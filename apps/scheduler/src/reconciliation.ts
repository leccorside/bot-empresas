import type { Queue } from 'bullmq';
import { createWebsiteAnalysisIntent, prisma } from '@prospector/database';
import { deadLetterJobId, ensureInsightBatchJob, ensureWebsiteAnalysisJob } from '@prospector/queues';
import { websiteAnalysisVersion } from '@prospector/integrations';
import { staleWebsiteCutoff } from './policy';

export const prospectingJobId = (runId: string) => `prospecting-${runId}`;
export const campaignJobId = (campaignId: string) => `campaign-${campaignId}`;

export function campaignRecoveryDelay(scheduledAt: Date | null, now = new Date()) {
  return Math.max(0, (scheduledAt?.getTime() ?? now.getTime()) - now.getTime());
}

export function shouldRecoverCampaign(status: string, updatedAt: Date, now = new Date(), staleSeconds = 120) {
  return status === 'SCHEDULED' || (status === 'RUNNING' && updatedAt.getTime() <= now.getTime() - staleSeconds * 1000);
}

export async function syncQueuePauseState(queues: Array<Pick<Queue, 'pause' | 'resume'>>, paused: boolean) {
  await Promise.all(queues.map(queue => paused ? queue.pause() : queue.resume()));
}

export async function rebuildProspectingQueue(queue: Queue) {
  const runs = await prisma.prospectingRun.findMany({ where: { status: { in: ['PENDING', 'QUEUED', 'RECOVERING'] } } });
  let rebuilt = 0;
  for (const run of runs) {
    const jobId = prospectingJobId(run.id);
    let job = await queue.getJob(jobId);
    if (!job) {
      job = await queue.add('prospect-run', { runId: run.id }, { jobId, attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
      rebuilt++;
    }
    await prisma.jobRecord.upsert({
      where: { idempotencyKey: `prospecting:${run.id}` },
      update: { bullJobId: job.id, state: run.status === 'RECOVERING' ? 'RECOVERING' : 'WAITING', errorMessage: null, payload: { runId: run.id } },
      create: { queue: 'prospecting', name: 'prospect-run', runId: run.id, bullJobId: job.id, idempotencyKey: `prospecting:${run.id}`, state: run.status === 'RECOVERING' ? 'RECOVERING' : 'WAITING', payload: { runId: run.id } },
    });
  }

  let removed = 0;
  const queued = await queue.getJobs(['waiting', 'delayed', 'prioritized', 'paused']);
  for (const job of queued) {
    const runId = job.data?.runId as string | undefined;
    const run = runId ? await prisma.prospectingRun.findUnique({ where: { id: runId }, select: { status: true } }) : null;
    if (!run || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) { await job.remove(); removed++; }
  }
  return { durable: runs.length, rebuilt, removed };
}

export async function rebuildCampaignQueue(queue: Queue, now = new Date(), staleSeconds = 120) {
  const candidates = await prisma.campaign.findMany({
    where: { status: { in: ['SCHEDULED', 'RUNNING'] }, messages: { some: { status: { in: ['PENDING', 'QUEUED'] } } } },
  });
  let rebuilt = 0;
  for (const campaign of candidates.filter(item => shouldRecoverCampaign(item.status, item.updatedAt, now, staleSeconds))) {
    const jobId = campaignJobId(campaign.id);
    if (!await queue.getJob(jobId)) {
      await queue.add('send-campaign', { campaignId: campaign.id }, { jobId, delay: campaignRecoveryDelay(campaign.scheduledAt, now) });
      rebuilt++;
    }
  }
  let removed = 0;
  for (const job of await queue.getJobs(['waiting', 'delayed', 'prioritized', 'paused', 'failed'])) {
    const campaignId = job.data?.campaignId as string | undefined;
    const campaign = campaignId ? await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } }) : null;
    if (!campaign || ['COMPLETED', 'CANCELLED'].includes(campaign.status)) { await job.remove(); removed++; }
  }
  return { durable: candidates.length, rebuilt, removed };
}

export async function rebuildWebsiteAnalysisQueue(queue: Queue, now = new Date(), staleSeconds = 120) {
  const staleAt = new Date(now.getTime() - staleSeconds * 1000);
  const analyses = await prisma.websiteAnalysis.findMany({ where: { OR: [{ status: { in: ['WAITING', 'RECOVERING'] } }, { status: 'ACTIVE', updatedAt: { lte: staleAt } }] } });
  let rebuilt = 0;
  for (const analysis of analyses) {
    const recovering = analysis.status === 'ACTIVE' || analysis.status === 'RECOVERING';
    if (analysis.status === 'ACTIVE') await prisma.websiteAnalysis.update({ where: { id: analysis.id }, data: { status: 'RECOVERING' } });
    const before = await queue.getJob(`website-analysis-${analysis.id}`);
    const job = await ensureWebsiteAnalysisJob(queue, analysis.id);
    if (!before) rebuilt++;
    await prisma.jobRecord.upsert({
      where: { idempotencyKey: analysis.idempotencyKey },
      update: { bullJobId: job.id, state: recovering ? 'RECOVERING' : 'WAITING', errorMessage: null, payload: { analysisId: analysis.id, businessId: analysis.businessId, version: analysis.version } },
      create: { queue: 'website-analysis', name: 'analyze-website', bullJobId: job.id, idempotencyKey: analysis.idempotencyKey, state: recovering ? 'RECOVERING' : 'WAITING', payload: { analysisId: analysis.id, businessId: analysis.businessId, version: analysis.version } },
    });
  }
  let removed = 0;
  for (const job of await queue.getJobs(['waiting', 'delayed', 'prioritized', 'paused', 'failed'])) {
    const analysisId = job.data?.analysisId as string | undefined;
    const analysis = analysisId ? await prisma.websiteAnalysis.findUnique({ where: { id: analysisId }, select: { status: true } }) : null;
    if (!analysis || ['COMPLETED', 'CANCELLED'].includes(analysis.status)) { await job.remove(); removed++; }
  }
  return { durable: analyses.length, rebuilt, removed };
}

export async function rebuildInsightBatchQueue(queue: Queue, now = new Date(), staleSeconds = 120) {
  const staleAt = new Date(now.getTime() - staleSeconds * 1000);
  const batches = await prisma.insightBatch.findMany({ where: { OR: [{ status: { in: ['WAITING', 'RECOVERING'] } }, { status: 'ACTIVE', updatedAt: { lte: staleAt } }] } });
  let rebuilt = 0;
  for (const batch of batches) {
    const recovering = batch.status === 'ACTIVE' || batch.status === 'RECOVERING';
    if (batch.status === 'ACTIVE') await prisma.insightBatch.update({ where: { id: batch.id }, data: { status: 'RECOVERING' } });
    const before = await queue.getJob(`insight-batch-${batch.id}`);
    const job = await ensureInsightBatchJob(queue, batch.id);
    if (!before) rebuilt++;
    await prisma.jobRecord.upsert({
      where: { idempotencyKey: `insight-batch:${batch.id}` },
      update: { bullJobId: job.id, state: recovering ? 'RECOVERING' : 'WAITING', errorMessage: null, payload: { batchId: batch.id } },
      create: { queue: 'insight-batch', name: 'generate-insight-batch', bullJobId: job.id, idempotencyKey: `insight-batch:${batch.id}`, state: recovering ? 'RECOVERING' : 'WAITING', payload: { batchId: batch.id } },
    });
  }
  let removed = 0;
  for (const job of await queue.getJobs(['waiting', 'delayed', 'prioritized', 'paused', 'failed'])) {
    const batchId = job.data?.batchId as string | undefined;
    const batch = batchId ? await prisma.insightBatch.findUnique({ where: { id: batchId }, select: { status: true } }) : null;
    if (!batch || ['COMPLETED', 'CANCELLED'].includes(batch.status)) { await job.remove(); removed++; }
  }
  return { durable: batches.length, rebuilt, removed };
}

export async function rebuildDeadLetterQueue(queue: Queue) {
  const failed = await prisma.jobRecord.findMany({ where: { state: 'FAILED', bullJobId: { not: null } } });
  let rebuilt = 0;
  for (const record of failed) {
    const sourceJobId = record.bullJobId!;
    const jobId = deadLetterJobId(record.queue, sourceJobId);
    if (!await queue.getJob(jobId)) {
      await queue.add('dead-letter', { sourceQueue: record.queue, sourceJobId, name: record.name, payload: record.payload, attempts: record.attempts, errorMessage: record.errorMessage ?? 'Falha sem mensagem' }, { jobId, attempts: 1 });
      rebuilt++;
    }
  }
  let removed = 0;
  for (const job of await queue.getJobs(['waiting', 'delayed', 'paused'])) {
    const exists = await prisma.jobRecord.count({ where: { state: 'FAILED', queue: String(job.data?.sourceQueue ?? ''), bullJobId: String(job.data?.sourceJobId ?? '') } });
    if (!exists) { await job.remove(); removed++; }
  }
  return { durable: failed.length, rebuilt, removed };
}

export async function reconcileDurableJobRecords() {
  const live = await prisma.jobRecord.findMany({ where: { state: { in: ['WAITING', 'ACTIVE', 'RECOVERING', 'DELAYED'] } } });
  let corrected = 0;
  for (const record of live) {
    let entityStatus: string | null = null;
    if (record.queue === 'prospecting' && record.runId) entityStatus = (await prisma.prospectingRun.findUnique({ where: { id: record.runId }, select: { status: true } }))?.status ?? null;
    if (record.queue === 'website-analysis') entityStatus = (await prisma.websiteAnalysis.findUnique({ where: { id: String((record.payload as any)?.analysisId ?? '') }, select: { status: true } }))?.status ?? null;
    if (record.queue === 'campaign') entityStatus = (await prisma.campaign.findUnique({ where: { id: String((record.payload as any)?.campaignId ?? '') }, select: { status: true } }))?.status ?? null;
    if (record.queue === 'insight-batch') entityStatus = (await prisma.insightBatch.findUnique({ where: { id: String((record.payload as any)?.batchId ?? '') }, select: { status: true } }))?.status ?? null;
    const running = ['PENDING', 'QUEUED', 'WAITING', 'ACTIVE', 'RUNNING', 'RECOVERING', 'SCHEDULED'].includes(entityStatus ?? '');
    if (running) continue;
    const state = entityStatus === 'COMPLETED' ? 'COMPLETED' : entityStatus === 'FAILED' ? 'FAILED' : 'CANCELLED';
    await prisma.jobRecord.update({ where: { id: record.id }, data: { state, completedAt: new Date(), errorMessage: state === 'CANCELLED' && !entityStatus ? 'Entidade de origem não existe mais' : record.errorMessage } });
    corrected++;
  }
  return { inspected: live.length, corrected };
}

export async function refreshStaleWebsiteAnalyses(queue: Queue, now = new Date(), staleDays = 30, batchSize = 20) {
  if (staleDays <= 0) return { eligible: 0, refreshed: 0 };
  const staleAt = staleWebsiteCutoff(now, staleDays);
  const candidates = await prisma.business.findMany({
    where: { website: { not: null }, websiteCheckedAt: { lte: staleAt } },
    orderBy: { websiteCheckedAt: 'asc' },
    take: Math.max(1, batchSize),
    select: { id: true, website: true },
  });
  let refreshed = 0;
  for (const business of candidates) {
    if (!business.website) continue;
    const version = websiteAnalysisVersion(business.website);
    const intent = await createWebsiteAnalysisIntent({ businessId: business.id, url: business.website, version, force: true });
    const job = await ensureWebsiteAnalysisJob(queue, intent.analysis.id);
    await prisma.jobRecord.update({ where: { idempotencyKey: intent.analysis.idempotencyKey }, data: { bullJobId: job.id } }).catch(() => {});
    refreshed++;
  }
  return { eligible: candidates.length, refreshed };
}
