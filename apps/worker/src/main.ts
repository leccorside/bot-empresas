import { Worker, Job } from 'bullmq';
import { prisma } from '@prospector/database';
import { queueOptions, QUEUES } from '@prospector/queues';
import { GooglePlacesProvider, WhatsAppCloudProvider } from '@prospector/integrations';
import { calculateLeadScore, logger, normalizePhone, normalizeText, phoneType } from '@prospector/shared';

const log=logger('worker');
const provider=new GooglePlacesProvider();

async function automationPaused(){const row=await prisma.systemSetting.findUnique({where:{key:'automation'}});return Boolean((row?.value as any)?.paused)}
async function analyzeWebsite(url?:string|null){if(!url)return{siteStatus:'NO_WEBSITE' as const,hasHttps:null,httpStatus:null,responseMs:null,title:null};const started=Date.now();try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'LocalProspector/1.0'}});const html=(await response.text()).slice(0,200000);clearTimeout(timer);const responseMs=Date.now()-started;const title=html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g,' ').trim();const siteStatus=response.ok?(responseMs<2000?'GOOD':'AVERAGE'):'POOR';return{siteStatus:siteStatus as 'GOOD'|'AVERAGE'|'POOR',hasHttps:url.startsWith('https://'),httpStatus:response.status,responseMs,title}}catch{return{siteStatus:'POOR' as const,hasHttps:url.startsWith('https://'),httpStatus:null,responseMs:Date.now()-started,title:null}}}

async function processRun(job:Job<{runId:string}>){
  if(await automationPaused())throw new Error('Automações pausadas pelo botão de emergência');
  const run=await prisma.prospectingRun.findUnique({where:{id:job.data.runId}});if(!run||['COMPLETED','CANCELLED'].includes(run.status))return;
  await prisma.prospectingRun.update({where:{id:run.id},data:{status:'RUNNING',startedAt:run.startedAt??new Date(),heartbeatAt:new Date(),currentStage:'DISCOVERY'}});
  const heartbeat=setInterval(()=>prisma.prospectingRun.update({where:{id:run.id},data:{heartbeatAt:new Date()}}).catch(()=>{}),15000);
  try{
    const cell=await prisma.searchCell.upsert({where:{runId_latitude_longitude_category:{runId:run.id,latitude:0,longitude:0,category:run.category}},update:{},create:{runId:run.id,latitude:0,longitude:0,radius:50000,category:run.category}});
    if(cell.status!=='COMPLETED'){
      await prisma.searchCell.update({where:{id:cell.id},data:{status:'RUNNING',startedAt:new Date()}});
      let token=cell.nextPageToken??undefined,page=cell.currentPage,done=false;
      while(!done){
        const found=await provider.discover({country:run.country,state:run.state,city:run.city,category:run.category,pageToken:token});
        for(const item of found.results){
          const normalizedPhone=normalizePhone(item.phone);const normalizedName=normalizeText(item.name);const normalizedAddress=normalizeText(item.address??'');
          const existing=await prisma.business.findUnique({where:{provider_providerId:{provider:item.provider,providerId:item.providerId}}});
          if(existing&&await prisma.discoveryEvent.findUnique({where:{runId_businessId:{runId:run.id,businessId:existing.id}}}))continue;
          const site=await analyzeWebsite(item.website);const score=calculateLeadScore({website:item.website,siteStatus:site.siteStatus,reviewsCount:item.reviewsCount,phone:item.phone,siteResponseMs:site.responseMs,hasHttps:site.hasHttps});
          await prisma.$transaction(async tx=>{
            const business=await tx.business.upsert({where:{provider_providerId:{provider:item.provider,providerId:item.providerId}},update:{...item,normalizedName,normalizedAddress,normalizedPhone,lastSeenAt:new Date(),siteStatus:site.siteStatus,siteHttpStatus:site.httpStatus,siteResponseMs:site.responseMs,hasHttps:site.hasHttps,pageTitle:site.title,websiteCheckedAt:new Date(),leadScore:score.score,scoreClass:score.scoreClass},create:{...item,normalizedName,normalizedAddress,normalizedPhone,siteStatus:site.siteStatus,siteHttpStatus:site.httpStatus,siteResponseMs:site.responseMs,hasHttps:site.hasHttps,pageTitle:site.title,websiteCheckedAt:new Date(),leadScore:score.score,scoreClass:score.scoreClass}});
            if(normalizedPhone)await tx.businessPhone.upsert({where:{normalizedPhone},update:{businessId:business.id,phone:item.phone!},create:{businessId:business.id,phone:item.phone!,normalizedPhone,type:phoneType(normalizedPhone)}});
            const discovery=await tx.discoveryEvent.createMany({data:[{runId:run.id,businessId:business.id,cellId:cell.id,wasNew:!existing}],skipDuplicates:true});
            if(discovery.count)await tx.businessSnapshot.create({data:{businessId:business.id,rating:item.rating,reviewsCount:item.reviewsCount,website:item.website,phone:item.phone}});
            await tx.processingCheckpoint.upsert({where:{runId_stage_entityType_entityId:{runId:run.id,stage:'DISCOVERY',entityType:'CELL',entityId:cell.id}},update:{page:page+1,processedItems:{increment:discovery.count},status:'RUNNING',metadata:{nextPageToken:found.nextPageToken??null}},create:{runId:run.id,stage:'DISCOVERY',entityType:'CELL',entityId:cell.id,page:page+1,processedItems:discovery.count,status:'RUNNING',metadata:{nextPageToken:found.nextPageToken??null}}});
          });
        }
        page++;token=found.nextPageToken;await prisma.searchCell.update({where:{id:cell.id},data:{currentPage:page,nextPageToken:token,resultsFound:{increment:found.results.length}}});done=!token||page>=3;
      }
      await prisma.$transaction([prisma.searchCell.update({where:{id:cell.id},data:{status:'COMPLETED',completedAt:new Date(),nextPageToken:null}}),prisma.processingCheckpoint.update({where:{runId_stage_entityType_entityId:{runId:run.id,stage:'DISCOVERY',entityType:'CELL',entityId:cell.id}},data:{status:'COMPLETED',completedAt:new Date()}})]);
    }
    const stats=await prisma.discoveryEvent.aggregate({where:{runId:run.id},_count:true});const fresh=await prisma.discoveryEvent.count({where:{runId:run.id,wasNew:true}});const businesses=await prisma.business.findMany({where:{discoveries:{some:{runId:run.id}}},select:{website:true,phone:true,phones:true}});
    await prisma.$transaction([prisma.prospectingRun.update({where:{id:run.id},data:{status:'COMPLETED',finishedAt:new Date(),heartbeatAt:new Date(),currentStage:'COMPLETED',businessesFound:stats._count,businessesNew:fresh,businessesUpdated:stats._count-fresh,websitesFound:businesses.filter(b=>b.website).length,withoutWebsite:businesses.filter(b=>!b.website).length,phonesFound:businesses.filter(b=>b.phone).length,whatsappFound:businesses.filter(b=>b.phones.some(p=>p.whatsappStatus==='AVAILABLE')).length}}),prisma.jobRecord.updateMany({where:{runId:run.id,state:{in:['WAITING','ACTIVE','RECOVERING']}},data:{state:'COMPLETED',completedAt:new Date()}})]);
  }catch(error:any){await prisma.$transaction([prisma.prospectingRun.update({where:{id:run.id},data:{status:'FAILED',errorMessage:error.message,finishedAt:new Date()}}),prisma.jobRecord.updateMany({where:{runId:run.id},data:{state:'FAILED',errorMessage:error.message}})]);throw error}finally{clearInterval(heartbeat)}
}

async function processCampaign(job:Job<{campaignId:string}>){const campaign=await prisma.campaign.findUnique({where:{id:job.data.campaignId}});if(!campaign)return;if(await automationPaused())throw new Error('Automações pausadas');if(process.env.AUTO_SEND_CAMPAIGNS!=='true'&&process.env.DRY_RUN==='false')throw new Error('AUTO_SEND_CAMPAIGNS desativado');const messaging=new WhatsAppCloudProvider();await prisma.campaign.update({where:{id:campaign.id},data:{status:'RUNNING',startedAt:new Date()}});const messages=await prisma.campaignMessage.findMany({where:{campaignId:campaign.id,status:{in:['PENDING','QUEUED']}},include:{business:true}});for(const message of messages){const suppressed=await prisma.contactSuppression.findUnique({where:{normalizedPhone:message.phone}});if(suppressed){await prisma.campaignMessage.update({where:{id:message.id},data:{status:'BLOCKED',errorMessage:'Contato suprimido'}});continue}const result=await messaging.send({to:message.phone,body:campaign.messageTemplate.replace(/{{empresa}}/g,message.business.name),idempotencyKey:message.idempotencyKey});await prisma.campaignMessage.update({where:{id:message.id},data:{status:'SENT',providerMessageId:result.providerMessageId,sentAt:new Date()}})}await prisma.campaign.update({where:{id:campaign.id},data:{status:'COMPLETED',finishedAt:new Date()}})}

const prospectWorker=new Worker(QUEUES.prospecting,processRun,{...queueOptions(),concurrency:Number(process.env.WORKER_CONCURRENCY??5),limiter:{max:Number(process.env.MAX_REQUESTS_PER_SECOND??5),duration:1000}});
const campaignWorker=new Worker(QUEUES.campaign,processCampaign,{...queueOptions(),concurrency:1});
for(const worker of [prospectWorker,campaignWorker]){worker.on('active',j=>prisma.jobRecord.updateMany({where:{bullJobId:j.id},data:{state:'ACTIVE',startedAt:new Date(),attempts:{increment:1}}}).catch(()=>{}));worker.on('failed',(j,e)=>log.error({jobId:j?.id,error:e.message},'job failed'))}
async function shutdown(signal:string){log.info({signal},'graceful shutdown');await Promise.all([prospectWorker.close(),campaignWorker.close()]);await prisma.$disconnect();process.exit(0)}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));log.info('worker online');
