import { Queue } from 'bullmq';
import type { QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

export const QUEUES = { prospecting: 'prospecting', websiteAnalysis: 'website-analysis', campaign: 'campaign', insightBatch: 'insight-batch', deadLetter: 'dead-letter' } as const;
export const DEFAULT_JOB_OPTIONS = { attempts: 5, backoff: { type: 'exponential' as const, delay: 2000 }, removeOnComplete: 500, removeOnFail: 1000 };
export function redisConnection() {
  const connection = new IORedis({ host: process.env.REDIS_HOST ?? 'redis', port: Number(process.env.REDIS_PORT ?? 6379), maxRetriesPerRequest: null });
  connection.on('error', () => undefined);
  return connection;
}
export function queueOptions(): QueueOptions { return { connection: redisConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS }; }
export const prospectingQueue = () => new Queue(QUEUES.prospecting, queueOptions());
export const websiteAnalysisQueue = () => new Queue(QUEUES.websiteAnalysis, queueOptions());
export const campaignQueue = () => new Queue(QUEUES.campaign, queueOptions());
export const insightBatchQueue = () => new Queue(QUEUES.insightBatch, queueOptions());
export const deadLetterQueue = () => new Queue(QUEUES.deadLetter, { ...queueOptions(), defaultJobOptions: { attempts: 1, removeOnComplete: 500, removeOnFail: 5000 } });
export const deadLetterJobId = (queue: string, jobId: string) => `dlq-${queue}-${jobId}`.replace(/[^a-zA-Z0-9_-]/g, '-');

export async function enqueueDeadLetter(input: { sourceQueue: string; sourceJobId: string; name: string; payload: unknown; attempts: number; errorMessage: string }) {
  const queue = deadLetterQueue();
  const jobId = deadLetterJobId(input.sourceQueue, input.sourceJobId);
  try {
    const existing = await queue.getJob(jobId);
    if (existing) return existing;
    return await queue.add('dead-letter', input, { jobId, attempts: 1 });
  } finally { await queue.close(); }
}

export async function removeDeadLetter(sourceQueue: string, sourceJobId: string) {
  const queue = deadLetterQueue();
  try { await (await queue.getJob(deadLetterJobId(sourceQueue, sourceJobId)))?.remove(); }
  finally { await queue.close(); }
}
export async function ensureProspectingJob(queue: Pick<Queue, 'getJob' | 'add'>, runId: string) {
  const jobId = `prospecting-${runId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'failed') {
      await existing.retry();
      return existing;
    }
    if (state !== 'completed') return existing;
    await existing.remove();
  }
  return queue.add('prospect-run', { runId }, { jobId });
}
export async function enqueueRun(runId: string) {
  const queue = prospectingQueue();
  try { return await ensureProspectingJob(queue, runId); } finally { await queue.close(); }
}

export async function ensureWebsiteAnalysisJob(queue: Pick<Queue, 'getJob' | 'add'>, analysisId: string) {
  const jobId = `website-analysis-${analysisId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'failed') { await existing.retry(); return existing; }
    if (state !== 'completed') return existing;
    await existing.remove();
  }
  return queue.add('analyze-website', { analysisId }, { jobId });
}

export async function enqueueWebsiteAnalysis(analysisId: string) {
  const queue = websiteAnalysisQueue();
  try { return await ensureWebsiteAnalysisJob(queue, analysisId); } finally { await queue.close(); }
}

export async function ensureInsightBatchJob(queue: Pick<Queue, 'getJob' | 'add'>, batchId: string) {
  const jobId = `insight-batch-${batchId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'failed') { await existing.retry(); return existing; }
    if (state !== 'completed') return existing;
    await existing.remove();
  }
  return queue.add('generate-insight-batch', { batchId }, { jobId });
}

export async function enqueueInsightBatch(batchId: string) {
  const queue = insightBatchQueue();
  try { return await ensureInsightBatchJob(queue, batchId); } finally { await queue.close(); }
}
