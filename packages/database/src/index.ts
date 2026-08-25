import { Prisma, PrismaClient } from '@prisma/client';
const root = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = root.prisma ?? new PrismaClient({ log: ['error', 'warn'] });
if (process.env.NODE_ENV !== 'production') root.prisma = prisma;

export async function recordServiceHeartbeat(service: string, at = new Date()) {
  const value = { status: 'ONLINE', heartbeatAt: at.toISOString() };
  await prisma.systemSetting.upsert({
    where: { key: `service:${service}` },
    update: { value },
    create: { key: `service:${service}`, value },
  });
}

export type DiscoveryProgressInput = {
  runId: string;
  businessId: string;
  cellId: string;
  wasNew: boolean;
  page: number;
  nextPageToken?: string;
  snapshot: { rating?: number; reviewsCount?: number; website?: string; phone?: string };
};

export async function persistDiscoveryProgress(tx: Prisma.TransactionClient, input: DiscoveryProgressInput) {
  const discovery = await tx.discoveryEvent.createMany({
    data: [{ runId: input.runId, businessId: input.businessId, cellId: input.cellId, wasNew: input.wasNew }],
    skipDuplicates: true,
  });
  if (discovery.count) {
    await tx.businessSnapshot.create({ data: { businessId: input.businessId, ...input.snapshot } });
  }
  await tx.processingCheckpoint.upsert({
    where: { runId_stage_entityType_entityId: { runId: input.runId, stage: 'DISCOVERY', entityType: 'CELL', entityId: input.cellId } },
    update: { page: input.page, processedItems: { increment: discovery.count }, status: 'RUNNING', metadata: { nextPageToken: input.nextPageToken ?? null } },
    create: { runId: input.runId, stage: 'DISCOVERY', entityType: 'CELL', entityId: input.cellId, page: input.page, processedItems: discovery.count, status: 'RUNNING', metadata: { nextPageToken: input.nextPageToken ?? null } },
  });
  return { inserted: discovery.count === 1 };
}

export async function createWebsiteAnalysisIntent(input: { businessId: string; url: string; version: string; force?: boolean }) {
  return prisma.$transaction(async tx => {
    const existing = await tx.websiteAnalysis.findUnique({ where: { businessId_version: { businessId: input.businessId, version: input.version } } });
    if (existing?.status === 'COMPLETED' && !input.force) return { analysis: existing, shouldEnqueue: false };
    const idempotencyKey = `website-analysis:${input.businessId}:${input.version}`;
    const analysis = existing
      ? await tx.websiteAnalysis.update({ where: { id: existing.id }, data: input.force ? { status: 'WAITING', errorMessage: null, startedAt: null, completedAt: null } : {} })
      : await tx.websiteAnalysis.create({ data: { businessId: input.businessId, url: input.url, version: input.version, idempotencyKey } });
    await tx.jobRecord.upsert({
      where: { idempotencyKey },
      update: { queue: 'website-analysis', name: 'analyze-website', state: 'WAITING', errorMessage: null, completedAt: null, payload: { analysisId: analysis.id, businessId: input.businessId, version: input.version } },
      create: { queue: 'website-analysis', name: 'analyze-website', idempotencyKey, payload: { analysisId: analysis.id, businessId: input.businessId, version: input.version } },
    });
    return { analysis, shouldEnqueue: true };
  });
}

export * from '@prisma/client';
