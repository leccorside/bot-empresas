import { Queue } from 'bullmq';
import type { QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

export const QUEUES = { prospecting: 'prospecting', campaign: 'campaign', deadLetter: 'dead-letter' } as const;
export const DEFAULT_JOB_OPTIONS = { attempts: 5, backoff: { type: 'exponential' as const, delay: 2000 }, removeOnComplete: 500, removeOnFail: 1000 };
export function redisConnection() {
  const connection = new IORedis({ host: process.env.REDIS_HOST ?? 'redis', port: Number(process.env.REDIS_PORT ?? 6379), maxRetriesPerRequest: null });
  connection.on('error', () => undefined);
  return connection;
}
export function queueOptions(): QueueOptions { return { connection: redisConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS }; }
export const prospectingQueue = () => new Queue(QUEUES.prospecting, queueOptions());
export const campaignQueue = () => new Queue(QUEUES.campaign, queueOptions());
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
