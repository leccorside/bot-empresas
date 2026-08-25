import type { Queue } from 'bullmq';
import { prisma } from '@prospector/database';

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
  return { durable: candidates.length, rebuilt };
}
