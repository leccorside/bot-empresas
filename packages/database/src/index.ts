import { Prisma, PrismaClient } from '@prisma/client';
const root = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = root.prisma ?? new PrismaClient({ log: ['error', 'warn'] });
if (process.env.NODE_ENV !== 'production') root.prisma = prisma;

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

export * from '@prisma/client';
