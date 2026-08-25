import { Queue } from 'bullmq';
import type { QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

export const QUEUES = { prospecting: 'prospecting', campaign: 'campaign', deadLetter: 'dead-letter' } as const;
export function redisConnection() { return new IORedis({ host: process.env.REDIS_HOST ?? 'redis', port: Number(process.env.REDIS_PORT ?? 6379), maxRetriesPerRequest: null }); }
export function queueOptions(): QueueOptions { return { connection: redisConnection(), defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 500, removeOnFail: 1000 } }; }
export const prospectingQueue = () => new Queue(QUEUES.prospecting, queueOptions());
export const campaignQueue = () => new Queue(QUEUES.campaign, queueOptions());
export async function enqueueRun(runId: string) {
  const queue = prospectingQueue();
  try { return await queue.add('prospect-run', { runId }, { jobId: `prospecting-${runId}` }); } finally { await queue.close(); }
}
