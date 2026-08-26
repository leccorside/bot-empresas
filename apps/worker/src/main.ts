import { Worker, Job } from 'bullmq';
import { createWebsiteAnalysisIntent, persistDiscoveryProgress, prisma, recordServiceHeartbeat } from '@prospector/database';
import type { ProspectingRun, SearchCell } from '@prospector/database';
import { campaignQueue, enqueueWebsiteAnalysis, queueOptions, QUEUES } from '@prospector/queues';
import { AiInsightProvider, analyzeWebsite, GooglePlacesProvider, PageSpeedProvider, websiteAnalysisVersion, WhatsAppCloudProvider } from '@prospector/integrations';
import { businessWhere, calculateLeadScore, campaignDispatchDecision, generateGeographicGrid, logger, normalizePhone, normalizeText, parseCampaignDispatchPolicy, phoneType, resolveTemplateVariable } from '@prospector/shared';
import type { GeographicBounds } from '@prospector/shared';

const log=logger('worker');
const whatsappLog=logger('whatsapp');
const provider=new GooglePlacesProvider();
const pageSpeedProvider=new PageSpeedProvider();
class RunCancelledError extends Error {}

async function automationPaused(){const row=await prisma.systemSetting.findUnique({where:{key:'automation'}});return Boolean((row?.value as any)?.paused)}
async function scheduleWebsiteAnalysis(businessId:string,url:string,force=false){
  const version=websiteAnalysisVersion(url);
  const intent=await createWebsiteAnalysisIntent({businessId,url,version,force});
  if(!intent.shouldEnqueue)return intent.analysis;
  const job=await enqueueWebsiteAnalysis(intent.analysis.id);
  await prisma.jobRecord.update({where:{idempotencyKey:intent.analysis.idempotencyKey},data:{bullJobId:job.id}});
  return intent.analysis;
}

function persistedBounds(run: ProspectingRun): GeographicBounds | null {
  return [run.boundarySouth,run.boundaryNorth,run.boundaryWest,run.boundaryEast].every(value=>value!=null)
    ? {south:run.boundarySouth!,north:run.boundaryNorth!,west:run.boundaryWest!,east:run.boundaryEast!}
    : null;
}

function cellBounds(cell: SearchCell): GeographicBounds | undefined {
  return [cell.southLatitude,cell.northLatitude,cell.westLongitude,cell.eastLongitude].every(value=>value!=null)
    ? {south:cell.southLatitude!,north:cell.northLatitude!,west:cell.westLongitude!,east:cell.eastLongitude!}
    : undefined;
}

async function ensureGeographicGrid(run: ProspectingRun, jobLog: ReturnType<typeof logger>) {
  const existingCells=await prisma.searchCell.count({where:{runId:run.id}});
  if(existingCells){if(run.gridCellsTotal!==existingCells)await prisma.prospectingRun.update({where:{id:run.id},data:{gridCellsTotal:existingCells}});return existingCells}
  const bounds=persistedBounds(run)??await provider.resolveBoundary({country:run.country,state:run.state,city:run.city});
  const requestedCellSize=Number(process.env.GRID_CELL_SIZE_METERS??5000);
  const cells=generateGeographicGrid(bounds,requestedCellSize,Number(process.env.GRID_MAX_CELLS??500));
  await prisma.$transaction(async tx=>{
    await tx.prospectingRun.update({where:{id:run.id},data:{boundarySouth:bounds.south,boundaryNorth:bounds.north,boundaryWest:bounds.west,boundaryEast:bounds.east,gridCellSizeMeters:requestedCellSize,gridCellsTotal:cells.length,gridCellsCompleted:0,currentStage:'GRID_DISCOVERY'}});
    await tx.searchCell.createMany({data:cells.map(cell=>({runId:run.id,sequence:cell.sequence,latitude:cell.latitude,longitude:cell.longitude,radius:cell.radius,southLatitude:cell.south,northLatitude:cell.north,westLongitude:cell.west,eastLongitude:cell.east,category:run.category})),skipDuplicates:true});
  });
  jobLog.info({cells:cells.length,bounds,cellSizeMeters:requestedCellSize},'geographic grid created');
  return cells.length;
}

async function processCell(run: ProspectingRun, cell: SearchCell, jobLog: ReturnType<typeof logger>) {
  const cellLog=jobLog.child({cellId:cell.id,cellSequence:cell.sequence});
  await prisma.$transaction([
    prisma.searchCell.update({where:{id:cell.id},data:{status:'RUNNING',startedAt:cell.startedAt??new Date(),completedAt:null}}),
    prisma.processingCheckpoint.upsert({where:{runId_stage_entityType_entityId:{runId:run.id,stage:'DISCOVERY',entityType:'CELL',entityId:cell.id}},update:{status:'RUNNING',completedAt:null},create:{runId:run.id,stage:'DISCOVERY',entityType:'CELL',entityId:cell.id,status:'RUNNING',page:cell.currentPage,metadata:{nextPageToken:cell.nextPageToken??null}}}),
  ]);
  let token=cell.nextPageToken??undefined,page=cell.currentPage;
  const maxPages=Math.max(1,Number(process.env.GOOGLE_PLACES_MAX_PAGES_PER_CELL??3));
  try{
    while(page<maxPages&&(page===0||Boolean(token))){
      const currentRun=await prisma.prospectingRun.findUnique({where:{id:run.id},select:{status:true}});
      if(currentRun?.status==='CANCELLED')throw new RunCancelledError('Execução cancelada');
      if(await automationPaused())throw new Error('Automações pausadas pelo botão de emergência');
      const found=await provider.discover({country:run.country,state:run.state,city:run.city,category:run.category,pageToken:token,bounds:cellBounds(cell)});
      for(const item of found.results){
        const normalizedPhone=normalizePhone(item.phone);const normalizedName=normalizeText(item.name);const normalizedAddress=normalizeText(item.address??'');
        const existing=await prisma.business.findUnique({where:{provider_providerId:{provider:item.provider,providerId:item.providerId}}});
        if(existing&&await prisma.discoveryEvent.findUnique({where:{runId_businessId:{runId:run.id,businessId:existing.id}}}))continue;
        const website=item.website??null,websiteChanged=(existing?.website??null)!==website;
        const currentSiteStatus=website?(websiteChanged?'UNKNOWN':existing?.siteStatus??'UNKNOWN'):'NO_WEBSITE';
        const score=calculateLeadScore({website,siteStatus:currentSiteStatus,reviewsCount:item.reviewsCount,phone:item.phone,siteResponseMs:websiteChanged?null:existing?.siteResponseMs,hasHttps:websiteChanged?null:existing?.hasHttps});
        const resetWebsiteAnalysis=websiteChanged?{siteStatus:currentSiteStatus,siteHttpStatus:null,siteResponseMs:null,hasHttps:null,siteFinalUrl:null,siteSslValid:null,hasViewport:null,pageTitle:null,metaDescription:null,isWordPress:null,technologies:[],websiteAnalysisVersion:null,websiteCheckedAt:null}:{};
        const business=await prisma.$transaction(async tx=>{
          const business=await tx.business.upsert({where:{provider_providerId:{provider:item.provider,providerId:item.providerId}},update:{...item,website,normalizedName,normalizedAddress,normalizedPhone,lastSeenAt:new Date(),...resetWebsiteAnalysis,leadScore:score.score,scoreClass:score.scoreClass},create:{...item,website,normalizedName,normalizedAddress,normalizedPhone,siteStatus:currentSiteStatus,leadScore:score.score,scoreClass:score.scoreClass}});
          if(normalizedPhone)await tx.businessPhone.upsert({where:{normalizedPhone},update:{businessId:business.id,phone:item.phone!},create:{businessId:business.id,phone:item.phone!,normalizedPhone,type:phoneType(normalizedPhone)}});
          await persistDiscoveryProgress(tx,{runId:run.id,businessId:business.id,cellId:cell.id,wasNew:!existing,page:page+1,nextPageToken:found.nextPageToken,snapshot:{rating:item.rating,reviewsCount:item.reviewsCount,website:item.website,phone:item.phone}});
          return business;
        });
        if(website)await scheduleWebsiteAnalysis(business.id,website).catch(error=>cellLog.warn({businessId:business.id,error:error.message},'website analysis queued for reconciliation'));
      }
      page++;token=found.nextPageToken;
      await prisma.$transaction([
        prisma.searchCell.update({where:{id:cell.id},data:{currentPage:page,nextPageToken:token??null,resultsFound:{increment:found.results.length}}}),
        prisma.processingCheckpoint.update({where:{runId_stage_entityType_entityId:{runId:run.id,stage:'DISCOVERY',entityType:'CELL',entityId:cell.id}},data:{page,status:'RUNNING',metadata:{nextPageToken:token??null}}}),
      ]);
      if(!token)break;
    }
    const finalRun=await prisma.prospectingRun.findUnique({where:{id:run.id},select:{status:true}});
    if(finalRun?.status==='CANCELLED')throw new RunCancelledError('Execução cancelada');
    await prisma.$transaction([
      prisma.searchCell.update({where:{id:cell.id},data:{status:'COMPLETED',completedAt:new Date(),nextPageToken:null}}),
      prisma.processingCheckpoint.update({where:{runId_stage_entityType_entityId:{runId:run.id,stage:'DISCOVERY',entityType:'CELL',entityId:cell.id}},data:{status:'COMPLETED',completedAt:new Date(),metadata:{nextPageToken:null}}}),
      prisma.prospectingRun.update({where:{id:run.id},data:{gridCellsCompleted:{increment:1}}}),
    ]);
    cellLog.info({pages:page},'search cell completed');
  }catch(error:any){
    const status=error instanceof RunCancelledError?'PENDING':'FAILED';
    await prisma.$transaction([
      prisma.searchCell.update({where:{id:cell.id},data:{status}}),
      prisma.processingCheckpoint.update({where:{runId_stage_entityType_entityId:{runId:run.id,stage:'DISCOVERY',entityType:'CELL',entityId:cell.id}},data:{status}}),
    ]).catch(()=>{});
    cellLog.error({error:error.message,page},'search cell failed');
    throw error;
  }
}

async function processRun(job:Job<{runId:string}>){
  const jobLog=log.child({jobId:job.id,runId:job.data.runId});
  jobLog.info('prospecting job started');
  if(await automationPaused())throw new Error('Automações pausadas pelo botão de emergência');
  const run=await prisma.prospectingRun.findUnique({where:{id:job.data.runId}});if(!run||['COMPLETED','CANCELLED'].includes(run.status))return;
  await prisma.prospectingRun.update({where:{id:run.id},data:{status:'RUNNING',startedAt:run.startedAt??new Date(),heartbeatAt:new Date(),currentStage:'DISCOVERY'}});
  const heartbeat=setInterval(()=>prisma.prospectingRun.update({where:{id:run.id},data:{heartbeatAt:new Date()}}).catch(()=>{}),15000);
  try{
    await ensureGeographicGrid(run,jobLog);
    const cells=await prisma.searchCell.findMany({where:{runId:run.id,status:{not:'COMPLETED'}},orderBy:{sequence:'asc'}});
    const maxBusinesses=Math.max(1,Number(process.env.MAX_BUSINESSES_PER_RUN??5000));
    for(const [cellIndex,cell] of cells.entries()){
      const discovered=await prisma.discoveryEvent.count({where:{runId:run.id}});
      if(discovered>=maxBusinesses){jobLog.warn({maxBusinesses,remainingCells:cells.length-cellIndex},'run business limit reached');break}
      await processCell(run,cell,jobLog);
    }
    const finalRun=await prisma.prospectingRun.findUnique({where:{id:run.id},select:{status:true}});
    if(finalRun?.status==='CANCELLED')throw new RunCancelledError('Execução cancelada');
    const stats=await prisma.discoveryEvent.aggregate({where:{runId:run.id},_count:true});const fresh=await prisma.discoveryEvent.count({where:{runId:run.id,wasNew:true}});const businesses=await prisma.business.findMany({where:{discoveries:{some:{runId:run.id}}},select:{website:true,phone:true,phones:true}});
    const [completedCells,totalCells,rawResults]=await Promise.all([prisma.searchCell.count({where:{runId:run.id,status:'COMPLETED'}}),prisma.searchCell.count({where:{runId:run.id}}),prisma.searchCell.aggregate({where:{runId:run.id},_sum:{resultsFound:true}})]);
    const reachedLimit=stats._count>=Math.max(1,Number(process.env.MAX_BUSINESSES_PER_RUN??5000))&&completedCells<totalCells;
    await prisma.$transaction([prisma.prospectingRun.update({where:{id:run.id},data:{status:'COMPLETED',finishedAt:new Date(),heartbeatAt:new Date(),currentStage:reachedLimit?'COMPLETED_LIMIT':'COMPLETED',gridCellsTotal:totalCells,gridCellsCompleted:completedCells,businessesFound:stats._count,businessesNew:fresh,businessesUpdated:stats._count-fresh,duplicatesFound:Math.max(0,(rawResults._sum.resultsFound??0)-stats._count),websitesFound:businesses.filter(b=>b.website).length,withoutWebsite:businesses.filter(b=>!b.website).length,phonesFound:businesses.filter(b=>b.phone).length,whatsappFound:businesses.filter(b=>b.phones.some(p=>p.whatsappStatus==='AVAILABLE')).length}}),prisma.jobRecord.updateMany({where:{runId:run.id,state:{in:['WAITING','ACTIVE','RECOVERING']}},data:{state:'COMPLETED',completedAt:new Date()}})]);
    jobLog.info({businessesFound:stats._count,businessesNew:fresh,duplicatesFound:Math.max(0,(rawResults._sum.resultsFound??0)-stats._count),completedCells,totalCells,reachedLimit},'prospecting job completed');
  }catch(error:any){
    if(error instanceof RunCancelledError){jobLog.warn('prospecting job cancelled');await prisma.jobRecord.updateMany({where:{runId:run.id,state:{in:['WAITING','ACTIVE','RECOVERING']}},data:{state:'CANCELLED',completedAt:new Date()}});return}
    jobLog.error({error:error.message},'prospecting job failed');await prisma.$transaction([prisma.prospectingRun.update({where:{id:run.id},data:{status:'FAILED',errorMessage:error.message,finishedAt:new Date()}}),prisma.jobRecord.updateMany({where:{runId:run.id},data:{state:'FAILED',errorMessage:error.message}})]);throw error
  }finally{clearInterval(heartbeat)}
}

async function processWebsiteAnalysis(job:Job<{analysisId:string}>){
  const analysisLog=log.child({jobId:job.id,analysisId:job.data.analysisId});
  const analysis=await prisma.websiteAnalysis.findUnique({where:{id:job.data.analysisId},include:{business:{include:{phones:true}}}});
  if(!analysis||['COMPLETED','CANCELLED'].includes(analysis.status))return;
  await prisma.websiteAnalysis.update({where:{id:analysis.id},data:{status:'ACTIVE',attempts:{increment:1},startedAt:new Date(),completedAt:null,errorMessage:null}});
  try{
    const result=await analyzeWebsite(analysis.url);
    const current=await prisma.websiteAnalysis.findUnique({where:{id:analysis.id},select:{status:true}});
    if(current?.status==='CANCELLED'){analysisLog.warn('website analysis cancelled');return}
    const pageSpeed=await pageSpeedProvider.analyze(analysis.url).catch(error=>{analysisLog.warn({error:error.message},'pagespeed analysis failed');return {performanceScore:null}});
    const score=calculateLeadScore({website:analysis.business.website,siteStatus:result.status,reviewsCount:analysis.business.reviewsCount,phone:analysis.business.phone,whatsapp:analysis.business.phones.some(phone=>phone.whatsappStatus==='AVAILABLE'),siteResponseMs:result.responseMs,hasHttps:result.hasHttps,performanceScore:pageSpeed.performanceScore});
    await prisma.$transaction([
      prisma.websiteAnalysis.update({where:{id:analysis.id},data:{status:'COMPLETED',finalUrl:result.finalUrl,httpStatus:result.httpStatus,responseMs:result.responseMs,hasHttps:result.hasHttps,sslValid:result.sslValid,hasViewport:result.hasViewport,title:result.title,description:result.description,isWordPress:result.isWordPress,technologies:result.technologies,performanceScore:pageSpeed.performanceScore,pageSpeedFetchedAt:pageSpeed.performanceScore!=null?new Date():null,errorMessage:null,completedAt:new Date()}}),
      prisma.business.updateMany({where:{id:analysis.businessId,website:analysis.url},data:{siteStatus:result.status,siteHttpStatus:result.httpStatus,siteResponseMs:result.responseMs,hasHttps:result.hasHttps,siteFinalUrl:result.finalUrl,siteSslValid:result.sslValid,hasViewport:result.hasViewport,pageTitle:result.title,metaDescription:result.description,isWordPress:result.isWordPress,technologies:result.technologies,websiteAnalysisVersion:analysis.version,websiteCheckedAt:new Date(),performanceScore:pageSpeed.performanceScore,leadScore:score.score,scoreClass:score.scoreClass}}),
      prisma.jobRecord.update({where:{idempotencyKey:analysis.idempotencyKey},data:{state:'COMPLETED',errorMessage:null,completedAt:new Date()}}),
    ]);
    analysisLog.info({businessId:analysis.businessId,status:result.status,httpStatus:result.httpStatus,responseMs:result.responseMs,performanceScore:pageSpeed.performanceScore,technologies:result.technologies},'website analysis completed');
  }catch(error:any){
    const hasHttps=/^https:/i.test(analysis.url);
    const score=calculateLeadScore({website:analysis.business.website,siteStatus:'POOR',reviewsCount:analysis.business.reviewsCount,phone:analysis.business.phone,whatsapp:analysis.business.phones.some(phone=>phone.whatsappStatus==='AVAILABLE'),hasHttps});
    await prisma.$transaction([
      prisma.websiteAnalysis.update({where:{id:analysis.id},data:{status:'FAILED',hasHttps,sslValid:hasHttps?false:null,errorMessage:error.message}}),
      prisma.business.updateMany({where:{id:analysis.businessId,website:analysis.url},data:{siteStatus:'POOR',hasHttps,siteSslValid:hasHttps?false:null,websiteAnalysisVersion:analysis.version,websiteCheckedAt:new Date(),leadScore:score.score,scoreClass:score.scoreClass}}),
      prisma.jobRecord.update({where:{idempotencyKey:analysis.idempotencyKey},data:{state:'FAILED',errorMessage:error.message}}),
    ]).catch(()=>{});
    analysisLog.error({businessId:analysis.businessId,error:error.message},'website analysis failed');
    throw error;
  }
}

async function processCampaign(job:Job<{campaignId:string}>){
  const campaignLog=whatsappLog.child({jobId:job.id,campaignId:job.data.campaignId});
  campaignLog.info('campaign job started');
  try{
    const campaign=await prisma.campaign.findUnique({where:{id:job.data.campaignId},include:{template:true}});if(!campaign)return;
    if(!campaign.template)throw new Error('Campanha sem template aprovado');
    if(campaign.template.status!=='APPROVED')throw new Error('Template da campanha não está aprovado');
    if(await automationPaused())throw new Error('Automações pausadas');
    if(process.env.AUTO_SEND_CAMPAIGNS!=='true'&&process.env.DRY_RUN==='false')throw new Error('AUTO_SEND_CAMPAIGNS desativado');
    const messaging=new WhatsAppCloudProvider();
    const template=campaign.template;
    const templateVariables=(template.variables as string[])??[];
    await prisma.campaign.update({where:{id:campaign.id},data:{status:'RUNNING',startedAt:new Date()}});
    const messages=await prisma.campaignMessage.findMany({where:{campaignId:campaign.id,status:{in:['PENDING','QUEUED']}},include:{business:true}});
    for(const message of messages){
      const messageLog=campaignLog.child({businessId:message.businessId,messageId:message.id});
      const suppressed=await prisma.contactSuppression.findUnique({where:{normalizedPhone:message.phone}});
      if(suppressed){await prisma.campaignMessage.update({where:{id:message.id},data:{status:'BLOCKED',errorMessage:'Contato suprimido'}});messageLog.warn('message blocked by suppression list');continue}
      const now=new Date(),policy=parseCampaignDispatchPolicy();
      const [sentLastHour,sentToday]=await Promise.all([
        prisma.campaignMessage.count({where:{sentAt:{gte:new Date(now.getTime()-60*60_000)}}}),
        prisma.campaignMessage.count({where:{sentAt:{gte:new Date(now.getTime()-24*60*60_000)}}}),
      ]);
      const decision=campaignDispatchDecision({now,sentLastHour,sentToday,policy});
      if(!decision.allowed){
        await prisma.$transaction([
          prisma.campaign.update({where:{id:campaign.id},data:{status:'SCHEDULED',scheduledAt:decision.retryAt}}),
          prisma.campaignMessage.updateMany({where:{campaignId:campaign.id,status:{in:['PENDING','QUEUED']}},data:{status:'QUEUED'}}),
        ]);
        const queue=campaignQueue();
        try{await queue.add('send-campaign',{campaignId:campaign.id},{jobId:`campaign-${campaign.id}-${decision.retryAt.getTime()}`,delay:Math.max(1,decision.retryAt.getTime()-Date.now())})}finally{await queue.close()}
        campaignLog.warn({reason:decision.reason,retryAt:decision.retryAt},'campaign deferred by dispatch policy');
        return;
      }
      const bodyParameters=templateVariables.map(variable=>resolveTemplateVariable(variable,message.business));
      const result=await messaging.send({to:message.phone,idempotencyKey:message.idempotencyKey,template:{name:template.name,language:template.language,bodyParameters}});
      await prisma.campaignMessage.update({where:{id:message.id},data:{status:'SENT',providerMessageId:result.providerMessageId,sentAt:new Date()}});
      messageLog.info('message sent');
    }
    await prisma.campaign.update({where:{id:campaign.id},data:{status:'COMPLETED',finishedAt:new Date()}});
    campaignLog.info({messages:messages.length},'campaign job completed');
  }catch(error:any){campaignLog.error({error:error.message},'campaign job failed');throw error}
}

async function processInsightBatch(job:Job<{batchId:string}>){
  const batchLog=log.child({jobId:job.id,batchId:job.data.batchId});
  const batch=await prisma.insightBatch.findUnique({where:{id:job.data.batchId}});
  if(!batch||['COMPLETED','CANCELLED'].includes(batch.status))return;
  await prisma.insightBatch.update({where:{id:batch.id},data:{status:'ACTIVE',startedAt:batch.startedAt??new Date()}});
  const where={...businessWhere(batch.filters as any),...(batch.onlyMissing?{insight:null}:{})};
  const businesses=await prisma.business.findMany({where,orderBy:{leadScore:'desc'},take:batch.totalBusinesses});
  const provider=new AiInsightProvider();
  try{
    for(const business of businesses){
      const current=await prisma.insightBatch.findUnique({where:{id:batch.id},select:{status:true}});
      if(current?.status==='CANCELLED'){batchLog.warn('insight batch cancelled');return}
      try{
        const result=await provider.generateLeadInsight({name:business.name,category:business.category,city:business.city,state:business.state,siteStatus:business.siteStatus,hasWebsite:Boolean(business.website),reviewsCount:business.reviewsCount??0,rating:business.rating,leadScore:business.leadScore,technologies:(business.technologies as string[])??[]});
        await prisma.businessInsight.upsert({where:{businessId:business.id},update:{summary:result.summary,suggestedPitch:result.suggestedPitch,model:result.model,approved:false,suggestedScore:result.suggestedScore,scoreJustification:result.scoreJustification,scoreApplied:false,generatedAt:new Date()},create:{businessId:business.id,summary:result.summary,suggestedPitch:result.suggestedPitch,model:result.model,suggestedScore:result.suggestedScore,scoreJustification:result.scoreJustification}});
        await prisma.insightBatch.update({where:{id:batch.id},data:{processedCount:{increment:1},generatedCount:{increment:1}}});
      }catch(error:any){
        batchLog.warn({businessId:business.id,error:error.message},'insight batch item failed');
        await prisma.insightBatch.update({where:{id:batch.id},data:{processedCount:{increment:1},failedCount:{increment:1}}});
      }
    }
    await prisma.insightBatch.update({where:{id:batch.id},data:{status:'COMPLETED',completedAt:new Date()}});
    batchLog.info({total:businesses.length},'insight batch completed');
  }catch(error:any){
    await prisma.insightBatch.update({where:{id:batch.id},data:{status:'FAILED',errorMessage:error.message}}).catch(()=>{});
    batchLog.error({error:error.message},'insight batch failed');
    throw error;
  }
}

const prospectWorker=new Worker(QUEUES.prospecting,processRun,{...queueOptions(),concurrency:Number(process.env.WORKER_CONCURRENCY??5),limiter:{max:Number(process.env.MAX_REQUESTS_PER_SECOND??5),duration:1000}});
const websiteWorker=new Worker(QUEUES.websiteAnalysis,processWebsiteAnalysis,{...queueOptions(),concurrency:Number(process.env.WEBSITE_ANALYZER_CONCURRENCY??3),limiter:{max:Number(process.env.WEBSITE_ANALYZER_REQUESTS_PER_SECOND??3),duration:1000}});
const campaignWorker=new Worker(QUEUES.campaign,processCampaign,{...queueOptions(),concurrency:1});
const insightBatchWorker=new Worker(QUEUES.insightBatch,processInsightBatch,{...queueOptions(),concurrency:1});
for(const worker of [prospectWorker,websiteWorker,campaignWorker,insightBatchWorker]){worker.on('active',j=>prisma.jobRecord.updateMany({where:{bullJobId:j.id},data:{state:'ACTIVE',startedAt:new Date(),attempts:{increment:1}}}).catch(()=>{}));worker.on('failed',(j,e)=>log.error({jobId:j?.id,runId:(j?.data as any)?.runId,analysisId:(j?.data as any)?.analysisId,campaignId:(j?.data as any)?.campaignId,batchId:(j?.data as any)?.batchId,error:e.message},'job failed'))}
const heartbeat=()=>Promise.all([recordServiceHeartbeat('worker'),recordServiceHeartbeat('website-analyzer')]).catch(error=>log.error({error:error.message},'worker heartbeat failed'));
const serviceHeartbeatTimer=setInterval(heartbeat,15000);
heartbeat();
async function shutdown(signal:string){log.info({signal},'graceful shutdown');clearInterval(serviceHeartbeatTimer);await Promise.all([prospectWorker.close(),websiteWorker.close(),campaignWorker.close(),insightBatchWorker.close()]);await prisma.$disconnect();process.exit(0)}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));log.info('worker online');whatsappLog.info('whatsapp processor online');
