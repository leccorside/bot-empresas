import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { mkdir, rename, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { createWebsiteAnalysisIntent, prisma } from '@prospector/database';
import { enqueueInsightBatch, enqueueRun, enqueueWebsiteAnalysis, insightBatchQueue, prospectingQueue, campaignQueue, websiteAnalysisQueue } from '@prospector/queues';
import { AiInsightProvider, detectOptOutIntent, verifyWhatsAppWebhookSignature, websiteAnalysisVersion, WhatsAppTemplateProvider } from '@prospector/integrations';
import { businessWhere, heartbeatStatus, nextScheduleOccurrence, normalizePhone, parseAutopilotConfig, validateCronExpression, validateTimezone } from '@prospector/shared';
import { autopilotConfigSchema, autopilotTargetSchema, businessFilterSchema, createRunSchema, createScheduleSchema, messageTemplateSchema, segmentGoalSchema } from '@prospector/validation';
import { businessExportValues, exportColumns, persistentExportFilename, renderBusinessesCsv, safeExportPath } from './exports';
import { directorySize, emptyQueueCounts, mergeQueueCounts, normalizeQueueCounts } from './operations';

@Injectable()
export class ApiService {
  async health(){
    const started=Date.now();let database='ONLINE',redis='ONLINE',heartbeats:any[]=[];let databaseMs=0,redisMs=0;let prospecting=emptyQueueCounts(),websiteAnalysis=emptyQueueCounts(),campaigns=emptyQueueCounts();
    const databaseStarted=Date.now();try{await prisma.$queryRaw`SELECT 1`;heartbeats=await prisma.systemSetting.findMany({where:{key:{in:['service:worker','service:website-analyzer','service:scheduler','service:recovery','service:reconciliation','service:website-refresh']}}})}catch{database='OFFLINE'}databaseMs=Date.now()-databaseStarted;
    const queues=[prospectingQueue(),websiteAnalysisQueue(),campaignQueue()];const redisStarted=Date.now();try{const [prospectingRaw,websiteRaw,campaignRaw]=await Promise.all(queues.map(queue=>queue.getJobCounts('waiting','active','failed','delayed','paused')));prospecting=normalizeQueueCounts(prospectingRaw);websiteAnalysis=normalizeQueueCounts(websiteRaw);campaigns=normalizeQueueCounts(campaignRaw)}catch{redis='OFFLINE'}finally{await Promise.all(queues.map(queue=>queue.close().catch(()=>{})))}redisMs=Date.now()-redisStarted;
    const rows=Object.fromEntries(heartbeats.map(row=>[row.key,row.value]));const services={api:'ONLINE',database,redis,worker:heartbeatStatus(rows['service:worker'],45000),websiteAnalyzer:heartbeatStatus(rows['service:website-analyzer'],45000),scheduler:heartbeatStatus(rows['service:scheduler'],90000),recovery:heartbeatStatus(rows['service:recovery'],90000),reconciliation:heartbeatStatus(rows['service:reconciliation'],90000),websiteRefresh:heartbeatStatus(rows['service:website-refresh'],90000)};
    return{status:Object.values(services).every(value=>value==='ONLINE')?'ok':'degraded',services,queues:{prospecting,websiteAnalysis,campaigns,total:mergeQueueCounts(prospecting,websiteAnalysis,campaigns)},latencyMs:{database:databaseMs,redis:redisMs,total:Date.now()-started},uptimeSeconds:Math.floor(process.uptime()),timestamp:new Date().toISOString()}
  }
  async login(body:any){const user=await prisma.user.findUnique({where:{email:String(body.email).toLowerCase()}});if(!user||!await bcrypt.compare(String(body.password),user.passwordHash))throw new UnauthorizedException('E-mail ou senha inválidos');return{token:jwt.sign({sub:user.id,email:user.email},process.env.JWT_SECRET??'change-me',{expiresIn:'12h'}),user:{name:user.name,email:user.email}}}
  async dashboard(){
    const [businesses,withWebsite,withPhone,whatsapp,noReviews,high,runs,schedules,jobs,automation,health,databaseSize,exportsBytes,logsBytes,exportFiles]=await Promise.all([
      prisma.business.count(),prisma.business.count({where:{website:{not:null}}}),prisma.business.count({where:{phone:{not:null}}}),prisma.business.count({where:{phones:{some:{whatsappStatus:'AVAILABLE'}}}}),prisma.business.count({where:{OR:[{reviewsCount:null},{reviewsCount:0}]}}),prisma.business.count({where:{leadScore:{gte:60}}}),
      prisma.prospectingRun.findMany({orderBy:{createdAt:'desc'},take:8}),prisma.schedule.findMany({where:{enabled:true,nextRunAt:{not:null}},orderBy:{nextRunAt:'asc'},take:6}),prisma.jobRecord.groupBy({by:['state'],_count:true}),prisma.systemSetting.findUnique({where:{key:'automation'}}),this.health(),
      prisma.$queryRaw<Array<{bytes:bigint}>>`SELECT pg_database_size(current_database()) AS bytes`,directorySize(process.env.EXPORTS_DIR??'/storage/exports'),directorySize(process.env.LOGS_DIR??'/storage/logs'),prisma.exportRecord.count({where:{status:'COMPLETED'}}),
    ]);
    return{metrics:{businesses,withWebsite,withoutWebsite:businesses-withWebsite,withPhone,withoutPhone:businesses-withPhone,whatsapp,noReviews,high},runs,schedules,jobs:Object.fromEntries(jobs.map(job=>[job.state,job._count])),queues:health.queues,services:health.services,latencyMs:health.latencyMs,uptimeSeconds:health.uptimeSeconds,storage:{databaseBytes:Number(databaseSize[0]?.bytes??0),exportsBytes,logsBytes,exportFiles},healthCheckedAt:health.timestamp,settings:{dryRun:process.env.DRY_RUN!=='false',...(automation?.value as object??{})}}
  }
  runs(){return prisma.prospectingRun.findMany({orderBy:{createdAt:'desc'},take:100,include:{_count:{select:{cells:true,checkpoints:true}}}})}
  async runHistory(query:any){
    const where:any={status:{in:['COMPLETED','FAILED','CANCELLED']}};
    if(query.city)where.city=query.city;if(query.state)where.state=query.state;if(query.category)where.category=query.category;
    const runs=await prisma.prospectingRun.findMany({where,orderBy:{createdAt:'asc'}});
    if(!runs.length)return[];
    const opportunityRows=await prisma.discoveryEvent.groupBy({by:['runId'],where:{runId:{in:runs.map(r=>r.id)},business:{leadScore:{gte:60}}},_count:{_all:true}});
    const opportunities=Object.fromEntries(opportunityRows.map(row=>[row.runId,row._count._all]));
    const groups=new Map<string,{destination:{city:string;state:string;category:string};runs:any[]}>();
    for(const run of runs){
      const key=`${run.city}|${run.state}|${run.category}`;
      if(!groups.has(key))groups.set(key,{destination:{city:run.city,state:run.state,category:run.category},runs:[]});
      const list=groups.get(key)!.runs;const previous=list[list.length-1];const opportunitiesFound=opportunities[run.id]??0;
      list.push({id:run.id,createdAt:run.createdAt,finishedAt:run.finishedAt,status:run.status,businessesFound:run.businessesFound,businessesNew:run.businessesNew,businessesUpdated:run.businessesUpdated,duplicatesFound:run.duplicatesFound,websitesFound:run.websitesFound,withoutWebsite:run.withoutWebsite,phonesFound:run.phonesFound,whatsappFound:run.whatsappFound,opportunitiesFound,growthBusinesses:previous?run.businessesFound-previous.businessesFound:null,growthOpportunities:previous?opportunitiesFound-previous.opportunitiesFound:null});
    }
    return[...groups.values()].sort((a,b)=>new Date(b.runs[b.runs.length-1].createdAt).getTime()-new Date(a.runs[a.runs.length-1].createdAt).getTime());
  }
  async createRun(raw:any){const parsed=createRunSchema.parse(raw);const {mode:_mode,...body}=parsed;const run=await prisma.prospectingRun.create({data:{...body,idempotencyKey:`manual:${randomUUID()}`}});await prisma.$transaction([prisma.jobRecord.create({data:{queue:'prospecting',name:'prospect-run',runId:run.id,idempotencyKey:`prospecting:${run.id}`,payload:{runId:run.id}}}),prisma.prospectingRun.update({where:{id:run.id},data:{status:'QUEUED',currentStage:'QUEUED'}})]);const job=await enqueueRun(run.id);await prisma.jobRecord.update({where:{idempotencyKey:`prospecting:${run.id}`},data:{bullJobId:job.id}});return run}
  async runCells(id:string){const run=await prisma.prospectingRun.findUnique({where:{id},select:{id:true,city:true,state:true,category:true,boundarySouth:true,boundaryNorth:true,boundaryWest:true,boundaryEast:true,gridCellSizeMeters:true,gridCellsTotal:true,gridCellsCompleted:true}});if(!run)throw new NotFoundException('Execução não encontrada');const cells=await prisma.searchCell.findMany({where:{runId:id},orderBy:{sequence:'asc'}});return{run,cells}}
  async runAction(id:string,action:string){const run=await prisma.prospectingRun.findUnique({where:{id}});if(!run)throw new NotFoundException();if(action==='cancel'){const [cancelled]=await prisma.$transaction([prisma.prospectingRun.update({where:{id},data:{status:'CANCELLED',finishedAt:new Date()}}),prisma.jobRecord.updateMany({where:{runId:id,state:{in:['WAITING','ACTIVE','RECOVERING']}},data:{state:'CANCELLED',completedAt:new Date()}})]);return cancelled}if(action==='retry'){await prisma.prospectingRun.update({where:{id},data:{status:'RECOVERING',errorMessage:null,finishedAt:null}});await enqueueRun(id);return{ok:true}};throw new BadRequestException('Ação inválida')}
  async businesses(raw:any){const parsed=businessFilterSchema.safeParse(raw);if(!parsed.success)throw new BadRequestException({message:'Filtros inválidos',issues:parsed.error.issues.map(issue=>({field:issue.path.join('.'),message:issue.message}))});const q=parsed.data;const where=businessWhere(q);const [items,total]=await prisma.$transaction([prisma.business.findMany({where,include:{phones:true},orderBy:[{leadScore:'desc'},{updatedAt:'desc'}],skip:(q.page-1)*q.pageSize,take:q.pageSize}),prisma.business.count({where})]);return{items,total,page:q.page,pageSize:q.pageSize}}
  async businessFilterOptions(){const [locations,categories]=await Promise.all([prisma.business.findMany({select:{city:true,state:true},distinct:['city','state'],orderBy:[{state:'asc'},{city:'asc'}]}),prisma.business.findMany({select:{category:true},distinct:['category'],orderBy:{category:'asc'}})]);return{locations,categories:categories.map(item=>item.category),siteStatuses:['NO_WEBSITE','POOR','AVERAGE','GOOD','UNKNOWN'],whatsappStatuses:['UNKNOWN','AVAILABLE','NOT_AVAILABLE','INVALID']}}
  async business(id:string){const item=await prisma.business.findUnique({where:{id},include:{phones:true,snapshots:{orderBy:{capturedAt:'desc'},take:20},websiteAnalyses:{orderBy:{createdAt:'desc'},take:20},leadEvents:{orderBy:{createdAt:'desc'}},insight:true}});if(!item)throw new NotFoundException();return item}
  async analyzeBusinessWebsite(id:string){const business=await prisma.business.findUnique({where:{id}});if(!business)throw new NotFoundException('Empresa não encontrada');if(!business.website)throw new BadRequestException('Empresa não possui website');const version=websiteAnalysisVersion(business.website);const intent=await createWebsiteAnalysisIntent({businessId:id,url:business.website,version,force:true});const job=await enqueueWebsiteAnalysis(intent.analysis.id);await prisma.jobRecord.update({where:{idempotencyKey:intent.analysis.idempotencyKey},data:{bullJobId:job.id}});return intent.analysis}
  async websiteAnalyses(id:string){if(!await prisma.business.findUnique({where:{id},select:{id:true}}))throw new NotFoundException('Empresa não encontrada');return prisma.websiteAnalysis.findMany({where:{businessId:id},orderBy:{createdAt:'desc'},take:50})}
  async leadStatus(id:string,body:any){const current=await prisma.business.findUnique({where:{id}});if(!current)throw new NotFoundException();return prisma.$transaction(async tx=>{const updated=await tx.business.update({where:{id},data:{leadStatus:body.status}});await tx.leadEvent.create({data:{businessId:id,fromStatus:current.leadStatus,toStatus:body.status,note:body.note}});if(body.status==='DO_NOT_CONTACT'&&current.normalizedPhone)await tx.contactSuppression.upsert({where:{normalizedPhone:current.normalizedPhone},update:{reason:body.note??'Opt-out'},create:{businessId:id,normalizedPhone:current.normalizedPhone,reason:body.note??'Opt-out'}});return updated})}
  getLeadInsight(id:string){return prisma.businessInsight.findUnique({where:{businessId:id}})}
  async generateLeadInsight(id:string){
    const business=await prisma.business.findUnique({where:{id}});
    if(!business)throw new NotFoundException('Empresa não encontrada');
    const result=await new AiInsightProvider().generateLeadInsight({name:business.name,category:business.category,city:business.city,state:business.state,siteStatus:business.siteStatus,hasWebsite:Boolean(business.website),reviewsCount:business.reviewsCount??0,rating:business.rating,leadScore:business.leadScore,technologies:(business.technologies as string[])??[]});
    return prisma.businessInsight.upsert({where:{businessId:id},update:{summary:result.summary,suggestedPitch:result.suggestedPitch,model:result.model,approved:false,generatedAt:new Date()},create:{businessId:id,summary:result.summary,suggestedPitch:result.suggestedPitch,model:result.model}});
  }
  async approveInsight(id:string){const current=await prisma.businessInsight.findUnique({where:{businessId:id}});if(!current)throw new NotFoundException('Nenhum insight gerado para essa empresa ainda');return prisma.businessInsight.update({where:{businessId:id},data:{approved:true}})}
  async suggestSegment(raw:any){
    const parsed=segmentGoalSchema.parse(raw);
    const result=await new AiInsightProvider().suggestSegment(parsed.goal);
    const allowedSiteStatuses=['NO_WEBSITE','POOR','AVERAGE','GOOD','UNKNOWN'];
    const filters={...result.filters};
    if(filters.siteStatus&&!allowedSiteStatuses.includes(filters.siteStatus))delete filters.siteStatus;
    return{filters,explanation:result.explanation};
  }
  async createInsightBatch(raw:any){
    const parsed=businessFilterSchema.safeParse(raw?.filters??{});
    if(!parsed.success)throw new BadRequestException({message:'Filtros inválidos',issues:parsed.error.issues.map(issue=>({field:issue.path.join('.'),message:issue.message}))});
    const {page:_page,pageSize:_pageSize,...filters}=parsed.data;
    const onlyMissing=raw?.onlyMissing!==false;
    const maxSize=Math.max(1,Number(process.env.INSIGHT_BATCH_MAX_SIZE??30));
    const where={...businessWhere(filters),...(onlyMissing?{insight:null}:{})};
    const matched=await prisma.business.count({where});
    if(!matched)throw new BadRequestException(`Nenhuma empresa corresponde a esse filtro${onlyMissing?' (ou todas já têm insight gerado)':''}`);
    const batch=await prisma.insightBatch.create({data:{filters,onlyMissing,totalBusinesses:Math.min(matched,maxSize)}});
    const job=await enqueueInsightBatch(batch.id);
    await prisma.jobRecord.create({data:{queue:'insight-batch',name:'generate-insight-batch',idempotencyKey:`insight-batch:${batch.id}`,bullJobId:job.id,payload:{batchId:batch.id}}});
    return batch;
  }
  insightBatches(){return prisma.insightBatch.findMany({orderBy:{createdAt:'desc'},take:20})}
  async insightBatch(id:string){const batch=await prisma.insightBatch.findUnique({where:{id}});if(!batch)throw new NotFoundException('Lote não encontrado');return batch}
  async cancelInsightBatch(id:string){const batch=await prisma.insightBatch.findUnique({where:{id}});if(!batch)throw new NotFoundException('Lote não encontrado');if(['COMPLETED','CANCELLED','FAILED'].includes(batch.status))return batch;const queue=insightBatchQueue();try{await(await queue.getJob(`insight-batch-${id}`))?.remove()}catch{}finally{await queue.close()}return prisma.insightBatch.update({where:{id},data:{status:'CANCELLED',completedAt:new Date()}})}
  schedules(){return prisma.schedule.findMany({orderBy:{createdAt:'desc'}})}
  async createSchedule(raw:any){const body=this.parseSchedule(raw);return prisma.schedule.create({data:this.normalizeSchedule(body) as any})}
  async updateSchedule(id:string,raw:any){const current=await prisma.schedule.findUnique({where:{id}});if(!current)throw new NotFoundException('Agendamento não encontrado');const body=this.parseSchedule({...current,...raw});return prisma.schedule.update({where:{id},data:this.normalizeSchedule(body) as any})}
  async deleteSchedule(id:string){const current=await prisma.schedule.findUnique({where:{id}});if(!current)throw new NotFoundException('Agendamento não encontrado');return prisma.schedule.delete({where:{id}})}
  autopilotTargets(){return prisma.autopilotTarget.findMany({orderBy:{createdAt:'desc'}})}
  async createAutopilotTarget(raw:any){const parsed=autopilotTargetSchema.parse(raw);return prisma.autopilotTarget.create({data:parsed})}
  async updateAutopilotTarget(id:string,raw:any){const current=await prisma.autopilotTarget.findUnique({where:{id}});if(!current)throw new NotFoundException('Alvo do autopilot não encontrado');const parsed=autopilotTargetSchema.parse({...current,...raw});return prisma.autopilotTarget.update({where:{id},data:parsed})}
  async deleteAutopilotTarget(id:string){const current=await prisma.autopilotTarget.findUnique({where:{id}});if(!current)throw new NotFoundException('Alvo do autopilot não encontrado');return prisma.autopilotTarget.delete({where:{id}})}
  async autopilotConfig(){const row=await prisma.systemSetting.findUnique({where:{key:'autopilotConfig'}});return parseAutopilotConfig(row?.value)}
  async updateAutopilotConfig(raw:any){const parsed=autopilotConfigSchema.parse(raw);await prisma.systemSetting.upsert({where:{key:'autopilotConfig'},update:{value:parsed},create:{key:'autopilotConfig',value:parsed}});return parsed}
  private parseSchedule(raw:any){const parsed=createScheduleSchema.safeParse(raw);if(!parsed.success)throw new BadRequestException({message:'Agendamento inválido',issues:parsed.error.issues.map(issue=>({field:issue.path.join('.'),message:issue.message}))});return parsed.data}
  private normalizeSchedule(body:any){
    if(!validateTimezone(body.timezone))throw new BadRequestException('Fuso horário inválido');
    const cronBased=['CRON','SPECIFIC_DAYS'].includes(body.scheduleType);
    if(cronBased&&!validateCronExpression(body.cronExpression,body.timezone))throw new BadRequestException('Expressão CRON inválida');
    let nextRunAt:Date|null=body.nextRunAt??null;
    const now=new Date();
    if(cronBased)nextRunAt=nextScheduleOccurrence(body.scheduleType,now,body.cronExpression,body.timezone);
    else if(body.scheduleType==='ONCE'&&nextRunAt&&nextRunAt<=now)throw new BadRequestException('A execução única deve estar no futuro');
    else if(nextRunAt&&nextRunAt<=now)nextRunAt=nextScheduleOccurrence(body.scheduleType,now,null,body.timezone,nextRunAt);
    return{...body,cronExpression:cronBased?body.cronExpression:null,nextRunAt};
  }
  async analytics(rawDays?:any){
    const days=Math.min(180,Math.max(7,Number(rawDays)||30));
    const since=new Date(Date.now()-days*24*60*60*1000);
    const [growthRows,byCategoryRaw,byCityRaw,scoreDistribution,leadFunnel,websiteStatus,whatsappStatus,totalBusinesses]=await Promise.all([
      prisma.$queryRaw<Array<{day:Date;count:number}>>`SELECT date_trunc('day',"firstSeenAt") AS day, count(*)::int AS count FROM "Business" WHERE "firstSeenAt">=${since} GROUP BY day ORDER BY day`,
      prisma.business.groupBy({by:['category'],_count:{_all:true},_avg:{leadScore:true}}),
      prisma.business.groupBy({by:['city','state'],_count:{_all:true},_avg:{leadScore:true}}),
      prisma.business.groupBy({by:['scoreClass'],_count:{_all:true}}),
      prisma.business.groupBy({by:['leadStatus'],_count:{_all:true}}),
      prisma.business.groupBy({by:['siteStatus'],_count:{_all:true}}),
      prisma.businessPhone.groupBy({by:['whatsappStatus'],_count:{_all:true}}),
      prisma.business.count(),
    ]);
    const byCategory=byCategoryRaw.map(row=>({category:row.category,count:row._count._all,avgScore:Math.round(row._avg.leadScore??0)})).sort((a,b)=>b.count-a.count).slice(0,10);
    const byCity=byCityRaw.map(row=>({city:row.city,state:row.state,count:row._count._all,avgScore:Math.round(row._avg.leadScore??0)})).sort((a,b)=>b.count-a.count).slice(0,10);
    return{
      days,totalBusinesses,
      growth:growthRows.map(row=>({date:row.day.toISOString().slice(0,10),count:row.count})),
      scoreDistribution:Object.fromEntries(scoreDistribution.map(row=>[row.scoreClass,row._count._all])),
      leadFunnel:Object.fromEntries(leadFunnel.map(row=>[row.leadStatus,row._count._all])),
      websiteStatus:Object.fromEntries(websiteStatus.map(row=>[row.siteStatus,row._count._all])),
      whatsappStatus:Object.fromEntries(whatsappStatus.map(row=>[row.whatsappStatus,row._count._all])),
      byCategory,byCity,
    };
  }
  async commercialAnalytics(rawDays?:any){
    const days=Math.min(180,Math.max(7,Number(rawDays)||30));
    const since=new Date(Date.now()-days*24*60*60*1000);
    const rate=(numerator:number,denominator:number)=>denominator>0?Math.round((numerator/denominator)*1000)/10:0;
    const [businessesFound,businessesNew,qualifiedLeads,interested,proposals,customers,sent,delivered,read,replied,failed,blocked,campaigns]=await Promise.all([
      prisma.business.count(),
      prisma.business.count({where:{firstSeenAt:{gte:since}}}),
      prisma.business.count({where:{leadStatus:{notIn:['NEW']}}}),
      prisma.business.count({where:{leadStatus:'INTERESTED'}}),
      prisma.business.count({where:{leadStatus:'PROPOSAL'}}),
      prisma.business.count({where:{leadStatus:'CUSTOMER'}}),
      prisma.campaignMessage.count({where:{createdAt:{gte:since},sentAt:{not:null}}}),
      prisma.campaignMessage.count({where:{createdAt:{gte:since},deliveredAt:{not:null}}}),
      prisma.campaignMessage.count({where:{createdAt:{gte:since},readAt:{not:null}}}),
      prisma.campaignMessage.count({where:{createdAt:{gte:since},repliedAt:{not:null}}}),
      prisma.campaignMessage.count({where:{createdAt:{gte:since},status:'FAILED'}}),
      prisma.campaignMessage.count({where:{createdAt:{gte:since},status:'BLOCKED'}}),
      prisma.campaign.findMany({where:{createdAt:{gte:since}},orderBy:{createdAt:'desc'},include:{_count:{select:{messages:true}}}}),
    ]);
    const campaignBreakdown=await Promise.all(campaigns.map(async campaign=>{
      const [campaignSent,campaignDelivered,campaignRead,campaignReplied]=await Promise.all([
        prisma.campaignMessage.count({where:{campaignId:campaign.id,sentAt:{not:null}}}),
        prisma.campaignMessage.count({where:{campaignId:campaign.id,deliveredAt:{not:null}}}),
        prisma.campaignMessage.count({where:{campaignId:campaign.id,readAt:{not:null}}}),
        prisma.campaignMessage.count({where:{campaignId:campaign.id,repliedAt:{not:null}}}),
      ]);
      return{id:campaign.id,name:campaign.name,status:campaign.status,total:campaign._count.messages,sent:campaignSent,delivered:campaignDelivered,read:campaignRead,replied:campaignReplied,deliveryRate:rate(campaignDelivered,campaignSent),readRate:rate(campaignRead,campaignDelivered),replyRate:rate(campaignReplied,campaignSent)};
    }));
    return{
      days,
      funnel:{businessesFound,businessesNew,qualifiedLeads,messagesSent:sent,messagesDelivered:delivered,messagesRead:read,messagesReplied:replied,messagesFailed:failed,messagesBlocked:blocked,interested,proposals,customers},
      rates:{deliveryRate:rate(delivered,sent),readRate:rate(read,delivered),replyRate:rate(replied,sent),interestRate:rate(interested,replied),conversionRate:rate(customers,sent)},
      campaigns:campaignBreakdown,
    };
  }
  jobs(){return prisma.jobRecord.findMany({orderBy:{createdAt:'desc'},take:200,include:{run:{select:{city:true,state:true,status:true}}}})}
  async jobAction(id:string,action:string){const job=await prisma.jobRecord.findUnique({where:{id}});if(!job)throw new NotFoundException();if(action==='retry'&&job.runId){await prisma.jobRecord.update({where:{id},data:{state:'RECOVERING',errorMessage:null}});await enqueueRun(job.runId);return{ok:true}}if(action==='retry'&&job.queue==='website-analysis'){const analysisId=String((job.payload as any)?.analysisId??'');const analysis=await prisma.websiteAnalysis.findUnique({where:{id:analysisId}});if(!analysis)throw new NotFoundException('Análise não encontrada');await prisma.$transaction([prisma.websiteAnalysis.update({where:{id:analysis.id},data:{status:'RECOVERING',errorMessage:null}}),prisma.jobRecord.update({where:{id},data:{state:'RECOVERING',errorMessage:null}})]);await enqueueWebsiteAnalysis(analysis.id);return{ok:true}}if(action==='cancel'){if(job.queue==='website-analysis'){const analysisId=String((job.payload as any)?.analysisId??'');if(analysisId)await prisma.websiteAnalysis.updateMany({where:{id:analysisId},data:{status:'CANCELLED'}});const queue=websiteAnalysisQueue();try{await (await queue.getJob(`website-analysis-${analysisId}`))?.remove()}catch{}finally{await queue.close()}}return prisma.jobRecord.update({where:{id},data:{state:'CANCELLED'}})}throw new BadRequestException('Ação inválida')}
  campaigns(){return prisma.campaign.findMany({orderBy:{createdAt:'desc'},include:{_count:{select:{messages:true}}}})}
  async campaignMessages(id:string){if(!await prisma.campaign.findUnique({where:{id},select:{id:true}}))throw new NotFoundException('Campanha não encontrada');return prisma.campaignMessage.findMany({where:{campaignId:id},orderBy:{createdAt:'desc'},include:{business:{select:{name:true}}}})}
  async createCampaign(body:any){
    const template=body.templateId?await prisma.messageTemplate.findUnique({where:{id:body.templateId}}):null;
    if(!template)throw new BadRequestException('Selecione um template');
    if(template.status!=='APPROVED')throw new BadRequestException('O template selecionado ainda não foi aprovado');
    return prisma.campaign.create({data:{name:body.name,templateId:template.id,messageTemplate:template.bodyText,filters:body.filters??{},scheduledAt:body.scheduledAt?new Date(body.scheduledAt):null}});
  }
  templates(){return prisma.messageTemplate.findMany({orderBy:{createdAt:'desc'}})}
  async createTemplate(raw:any){const parsed=messageTemplateSchema.parse(raw);if(await prisma.messageTemplate.findUnique({where:{name:parsed.name}}))throw new BadRequestException('Já existe um template com esse nome');return prisma.messageTemplate.create({data:parsed})}
  async updateTemplate(id:string,raw:any){const current=await prisma.messageTemplate.findUnique({where:{id}});if(!current)throw new NotFoundException('Template não encontrado');if(current.status!=='DRAFT')throw new BadRequestException('Apenas templates em rascunho podem ser editados');const parsed=messageTemplateSchema.parse({...current,...raw});if(parsed.name!==current.name&&await prisma.messageTemplate.findUnique({where:{name:parsed.name}}))throw new BadRequestException('Já existe um template com esse nome');return prisma.messageTemplate.update({where:{id},data:parsed})}
  async deleteTemplate(id:string){const current=await prisma.messageTemplate.findUnique({where:{id}});if(!current)throw new NotFoundException('Template não encontrado');if(await prisma.campaign.count({where:{templateId:id}}))throw new BadRequestException('Template em uso por campanhas e não pode ser removido');return prisma.messageTemplate.delete({where:{id}})}
  async submitTemplate(id:string){
    const current=await prisma.messageTemplate.findUnique({where:{id}});
    if(!current)throw new NotFoundException('Template não encontrado');
    if(!['DRAFT','REJECTED'].includes(current.status))throw new BadRequestException('Template já foi enviado para aprovação');
    const result=await new WhatsAppTemplateProvider().submit({name:current.name,language:current.language,category:current.category,bodyText:current.bodyText});
    return prisma.messageTemplate.update({where:{id},data:{status:result.status,providerTemplateId:result.providerTemplateId,submittedAt:new Date(),approvedAt:result.status==='APPROVED'?new Date():null,rejectionReason:null}});
  }
  async syncTemplateStatus(id:string){
    const current=await prisma.messageTemplate.findUnique({where:{id}});
    if(!current)throw new NotFoundException('Template não encontrado');
    if(!current.providerTemplateId)throw new BadRequestException('Template ainda não foi enviado para aprovação');
    const result=await new WhatsAppTemplateProvider().checkStatus(current.providerTemplateId);
    return prisma.messageTemplate.update({where:{id},data:{status:result.status,rejectionReason:result.rejectedReason??null,approvedAt:result.status==='APPROVED'?(current.approvedAt??new Date()):current.approvedAt}});
  }
  async scheduleCampaign(id:string){const campaign=await prisma.campaign.findUnique({where:{id}});if(!campaign)throw new NotFoundException();const where={...businessWhere(campaign.filters as any),phone:{not:null},suppressions:{none:{}}};const businesses=await prisma.business.findMany({where});await prisma.$transaction(businesses.map(b=>prisma.campaignMessage.upsert({where:{campaignId_businessId:{campaignId:id,businessId:b.id}},update:{},create:{campaignId:id,businessId:b.id,phone:b.normalizedPhone??b.phone!,idempotencyKey:`campaign:${id}:${b.id}`,scheduledAt:campaign.scheduledAt??new Date()}})));await prisma.campaign.update({where:{id},data:{status:'SCHEDULED'}});const q=campaignQueue();await q.add('send-campaign',{campaignId:id},{jobId:`campaign-${id}`,delay:Math.max(0,(campaign.scheduledAt?.getTime()??Date.now())-Date.now())});await q.close();return{selected:businesses.length}}
  verifyWhatsAppWebhook(query:any){
    const verifyToken=process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if(verifyToken&&query['hub.mode']==='subscribe'&&query['hub.verify_token']===verifyToken)return String(query['hub.challenge']??'');
    throw new ForbiddenException('Token de verificação inválido');
  }
  async receiveWhatsAppWebhook(rawBody:Buffer|undefined,signature:string|undefined){
    const buffer=rawBody??Buffer.alloc(0);
    if(!verifyWhatsAppWebhookSignature(buffer,signature,process.env.WHATSAPP_APP_SECRET))throw new UnauthorizedException('Assinatura inválida');
    const body=JSON.parse(buffer.toString('utf8')||'{}');
    const changes=(body.entry??[]).flatMap((entry:any)=>entry.changes??[]);
    for(const change of changes){
      const value=change.value??{};
      for(const status of value.statuses??[])await this.applyWhatsAppStatus(status);
      for(const message of value.messages??[])await this.applyWhatsAppInboundMessage(message);
    }
    return{received:true};
  }
  private async applyWhatsAppStatus(status:any){
    const map:Record<string,{status:string;field?:'deliveredAt'|'readAt'|'failedAt'}>={sent:{status:'SENT'},delivered:{status:'DELIVERED',field:'deliveredAt'},read:{status:'READ',field:'readAt'},failed:{status:'FAILED',field:'failedAt'}};
    const mapped=map[status?.status];
    if(!mapped||!status?.id)return;
    const timestamp=Number(status.timestamp);
    const at=Number.isFinite(timestamp)?new Date(timestamp*1000):new Date();
    const data:any={status:mapped.status};
    if(mapped.field)data[mapped.field]=at;
    if(status.status==='failed')data.errorMessage=status.errors?.[0]?.title??'Falha reportada pelo WhatsApp';
    await prisma.campaignMessage.updateMany({where:{providerMessageId:status.id},data});
  }
  private async applyWhatsAppInboundMessage(message:any){
    if(!message?.from)return;
    const text=message.text?.body??'';
    const normalizedFrom=normalizePhone(`+${message.from}`);
    if(!normalizedFrom)return;
    const business=await prisma.business.findFirst({where:{normalizedPhone:normalizedFrom}});
    if(!business)return;
    const openMessage=await prisma.campaignMessage.findFirst({where:{businessId:business.id,status:{in:['SENT','DELIVERED','READ']}},orderBy:{sentAt:'desc'}});
    if(openMessage)await prisma.campaignMessage.update({where:{id:openMessage.id},data:{status:'REPLIED',repliedAt:new Date()}});
    if(detectOptOutIntent(text)){
      if(business.leadStatus!=='DO_NOT_CONTACT')await this.leadStatus(business.id,{status:'DO_NOT_CONTACT',note:`Opt-out automático via WhatsApp: "${text.slice(0,200)}"`});
      return;
    }
    const beforeReplied=new Set(['NEW','QUALIFIED','CONTACT_PENDING','CONTACTED']);
    if(beforeReplied.has(business.leadStatus))await this.leadStatus(business.id,{status:'REPLIED',note:text?`Respondeu no WhatsApp: "${text.slice(0,200)}"`:'Respondeu no WhatsApp'});
  }
  async settings(){const [row,configRow]=await Promise.all([prisma.systemSetting.findUnique({where:{key:'automation'}}),prisma.systemSetting.findUnique({where:{key:'autopilotConfig'}})]);return{dryRun:process.env.DRY_RUN!=='false',autoSendCampaigns:process.env.AUTO_SEND_CAMPAIGNS==='true',automation:row?.value??{paused:false,autopilot:false},autopilotConfig:parseAutopilotConfig(configRow?.value)}}
  async emergency(action:string){if(!['stop','resume','autopilot-on','autopilot-off'].includes(action))throw new BadRequestException();const current=await prisma.systemSetting.findUnique({where:{key:'automation'}});const value:any=current?.value??{};if(action==='stop')value.paused=true;if(action==='resume')value.paused=false;if(action==='autopilot-on')value.autopilot=true;if(action==='autopilot-off')value.autopilot=false;await prisma.systemSetting.upsert({where:{key:'automation'},update:{value},create:{key:'automation',value}});const queues=[prospectingQueue(),websiteAnalysisQueue(),campaignQueue()];for(const q of queues){action==='stop'?await q.pause():action==='resume'?await q.resume():null;await q.close()}return value}
  listExports(){return prisma.exportRecord.findMany({orderBy:{createdAt:'desc'},take:100})}
  async createExport(raw:any){
    const format=String(raw?.format??'').toUpperCase();if(!['CSV','XLSX'].includes(format))throw new BadRequestException('Formato de exportação inválido');
    const cleanFilters=Object.fromEntries(Object.entries(raw?.filters??{}).filter(([,value])=>value!==''&&value!=null));const parsed=businessFilterSchema.safeParse(cleanFilters);if(!parsed.success)throw new BadRequestException('Filtros de exportação inválidos');
    const id=randomUUID();const root=process.env.EXPORTS_DIR??'/storage/exports';const filename=persistentExportFilename(format as 'CSV'|'XLSX',id);const storagePath=safeExportPath(root,filename);const temporaryPath=`${storagePath}.tmp`;const mimeType=format==='CSV'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    await mkdir(root,{recursive:true});const record=await prisma.exportRecord.create({data:{id,format:format as any,filename,storagePath,mimeType,filters:cleanFilters as any}});
    try{
      const rows=await prisma.business.findMany({where:businessWhere(parsed.data),include:{phones:true},orderBy:{name:'asc'}});
      if(format==='CSV')await writeFile(temporaryPath,renderBusinessesCsv(rows),'utf8');
      else{const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Empresas');sheet.columns=exportColumns.map(header=>({header,width:22}));rows.forEach(row=>sheet.addRow(businessExportValues(row)));sheet.getRow(1).font={bold:true};await workbook.xlsx.writeFile(temporaryPath)}
      await rename(temporaryPath,storagePath);const file=await stat(storagePath);if(file.size>2147483647)throw new Error('Arquivo excede o limite suportado');
      return prisma.exportRecord.update({where:{id:record.id},data:{status:'COMPLETED',sizeBytes:file.size,rowCount:rows.length,completedAt:new Date()}});
    }catch(error:any){await Promise.all([unlink(temporaryPath).catch(()=>{}),unlink(storagePath).catch(()=>{})]);await prisma.exportRecord.update({where:{id:record.id},data:{status:'FAILED',errorMessage:error.message}});throw error}
  }
  async downloadExport(id:string,res:any){const record=await prisma.exportRecord.findUnique({where:{id}});if(!record||record.status!=='COMPLETED')throw new NotFoundException('Exportação não encontrada');const expected=safeExportPath(process.env.EXPORTS_DIR??'/storage/exports',record.filename);if(path.resolve(record.storagePath)!==expected)throw new NotFoundException('Arquivo de exportação inválido');try{await stat(expected)}catch{throw new NotFoundException('Arquivo de exportação indisponível')};res.setHeader('Content-Type',record.mimeType);return res.download(expected,record.filename)}
  async exportCsv(res:any){const record=await this.createExport({format:'CSV'});return this.downloadExport(record.id,res)}
  async exportXlsx(res:any){const record=await this.createExport({format:'XLSX'});return this.downloadExport(record.id,res)}
}
