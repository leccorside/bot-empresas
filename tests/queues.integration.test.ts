import { randomUUID } from 'crypto';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_OPTIONS, QUEUES, redisConnection } from '../packages/queues/src';

const connection = { host: process.env.REDIS_HOST ?? 'redis', port: Number(process.env.REDIS_PORT ?? 6379) };

describe('configuração das filas', () => {
  it('mantém filas operacionais separadas', () => {
    expect(new Set(Object.values(QUEUES)).size).toBe(5);
    expect(QUEUES.websiteAnalysis).toBe('website-analysis');
  });

  it('configura cinco tentativas e backoff exponencial', () => {
    expect(DEFAULT_JOB_OPTIONS).toMatchObject({ attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
  });

  it('trata falhas transitórias de conexão durante a reinicialização do Redis', async () => {
    const client = redisConnection();
    try { expect(client.listenerCount('error')).toBeGreaterThan(0); }
    finally { await client.quit(); }
  });
});

describe('BullMQ com Redis real', () => {
  it('deduplica a inclusão pelo jobId', async () => {
    const name = `test-idempotency-${randomUUID()}`;
    const queue = new Queue(name, { connection });
    try {
      const first = await queue.add('process', { value: 1 }, { jobId: 'same-operation' });
      const second = await queue.add('process', { value: 1 }, { jobId: 'same-operation' });
      expect(second.id).toBe(first.id);
      expect(await queue.getWaitingCount()).toBe(1);
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  it('repete com backoff após falha transitória', async () => {
    const name = `test-retry-${randomUUID()}`;
    const queue = new Queue(name, { connection });
    const events = new QueueEvents(name, { connection });
    let executions = 0;
    const worker = new Worker(name, async (_job: Job) => {
      executions += 1;
      if (executions === 1) throw new Error('falha transitória');
      return 'ok';
    }, { connection });
    worker.on('error', () => undefined);
    try {
      await Promise.all([worker.waitUntilReady(), events.waitUntilReady()]);
      const job = await queue.add('retry', {}, { attempts: 2, backoff: { type: 'fixed', delay: 25 }, removeOnComplete: false });
      await expect(job.waitUntilFinished(events, 10_000)).resolves.toBe('ok');
      const completed = await queue.getJob(job.id!);
      expect(executions).toBe(2);
      expect(completed?.attemptsMade).toBe(2);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 15_000);
});
