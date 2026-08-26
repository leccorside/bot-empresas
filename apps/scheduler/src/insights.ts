import { prisma } from '@prospector/database';
import { enqueueInsightBatch } from '@prospector/queues';

type EnqueueInsight = (batchId: string) => Promise<{ id?: string | number | null }>;

export async function dispatchAutomaticInsights(now = new Date(), enqueue: EnqueueInsight = enqueueInsightBatch, options: { businessIds?: string[] } = {}) {
  if (process.env.AUTO_GENERATE_INSIGHTS !== 'true') return { dispatched: false as const, reason: 'disabled' as const };
  const positiveInteger = (value: string | undefined, fallback: number, maximum: number) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback };
  const refreshDays = positiveInteger(process.env.AI_INSIGHT_REFRESH_DAYS, 30, 3650);
  const batchSize = positiveInteger(process.env.AI_AUTO_INSIGHT_BATCH_SIZE, 10, 200);
  const leaseMinutes = Math.max(5, positiveInteger(process.env.AI_INSIGHT_LEASE_MINUTES, 30, 1440));
  const staleAt = new Date(now.getTime() - refreshDays * 86_400_000);
  const leaseExpiredAt = new Date(now.getTime() - leaseMinutes * 60_000);
  const candidates = await prisma.business.findMany({
    where: {
      AND: [
        ...(options.businessIds?.length ? [{ id: { in: options.businessIds } }] : []),
        { OR: [{ website: null }, { websiteCheckedAt: { not: null } }] },
        { OR: [{ aiInsightQueuedAt: null }, { aiInsightQueuedAt: { lte: leaseExpiredAt } }] },
        { OR: [{ insight: null }, { insight: { generatedAt: { lte: staleAt } } }] },
      ],
    },
    orderBy: [{ aiInsightQueuedAt: 'asc' }, { updatedAt: 'asc' }],
    take: batchSize,
    select: { id: true },
  });
  if (!candidates.length) return { dispatched: false as const, reason: 'no_candidates' as const };
  const businessIds = candidates.map(item => item.id);
  const batch = await prisma.$transaction(async tx => {
    const created = await tx.insightBatch.create({ data: { filters: { businessIds }, source: 'AUTOMATIC', onlyMissing: false, totalBusinesses: businessIds.length } });
    await tx.business.updateMany({ where: { id: { in: businessIds } }, data: { aiInsightQueuedAt: now } });
    await tx.jobRecord.create({ data: { queue: 'insight-batch', name: 'generate-insight-batch', idempotencyKey: `insight-batch:${created.id}`, payload: { batchId: created.id, source: 'AUTOMATIC' } } });
    return created;
  });
  try {
    const job = await enqueue(batch.id);
    await prisma.jobRecord.update({ where: { idempotencyKey: `insight-batch:${batch.id}` }, data: { bullJobId: job.id == null ? null : String(job.id) } });
    return { dispatched: true as const, batchId: batch.id, businesses: businessIds.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$transaction([
      prisma.insightBatch.update({ where: { id: batch.id }, data: { status: 'FAILED', errorMessage: message, completedAt: new Date() } }),
      prisma.business.updateMany({ where: { id: { in: businessIds } }, data: { aiInsightQueuedAt: null } }),
      prisma.jobRecord.update({ where: { idempotencyKey: `insight-batch:${batch.id}` }, data: { state: 'FAILED', errorMessage: message } }),
    ]);
    throw error;
  }
}
