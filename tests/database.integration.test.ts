import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { persistDiscoveryProgress, prisma } from '../packages/database/src';

const createdRunIds: string[] = [];
const createdBusinessIds: string[] = [];

async function createScenario() {
  const suffix = randomUUID();
  const runId = `test-run-${suffix}`;
  const businessId = `test-business-${suffix}`;
  const cellId = `test-cell-${suffix}`;
  createdRunIds.push(runId);
  createdBusinessIds.push(businessId);
  await prisma.prospectingRun.create({ data: { id: runId, country: 'Brasil', state: 'GO', city: 'Cidade Teste', category: 'Teste', status: 'PAUSED', idempotencyKey: `test:${suffix}` } });
  await prisma.searchCell.create({ data: { id: cellId, runId, latitude: 0, longitude: 0, category: 'Teste', status: 'RUNNING' } });
  await prisma.processingCheckpoint.create({ data: { id: `test-checkpoint-${suffix}`, runId, stage: 'DISCOVERY', entityType: 'CELL', entityId: cellId, status: 'RUNNING' } });
  await prisma.business.create({ data: { id: businessId, provider: 'TEST', providerId: suffix, name: 'Empresa Teste', normalizedName: 'empresa teste', category: 'Teste', city: 'Cidade Teste', state: 'GO' } });
  return { runId, businessId, cellId };
}

beforeAll(() => prisma.$connect());

afterEach(async () => {
  if (createdRunIds.length) await prisma.prospectingRun.deleteMany({ where: { id: { in: createdRunIds.splice(0) } } });
  if (createdBusinessIds.length) await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

describe('persistência e idempotência no PostgreSQL', () => {
  it('impede duas empresas com o mesmo provider e providerId', async () => {
    const scenario = await createScenario();
    await expect(prisma.business.create({ data: { provider: 'TEST', providerId: scenario.businessId.replace('test-business-', ''), name: 'Duplicada', normalizedName: 'duplicada', category: 'Teste', city: 'Cidade Teste', state: 'GO' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('registra descoberta, snapshot e checkpoint apenas uma vez', async () => {
    const scenario = await createScenario();
    const record = () => prisma.$transaction(tx => persistDiscoveryProgress(tx, { ...scenario, wasNew: true, page: 1, snapshot: { rating: 4.5, reviewsCount: 10, website: 'https://example.test', phone: '+5562999990000' } }));
    await expect(record()).resolves.toEqual({ inserted: true });
    await expect(record()).resolves.toEqual({ inserted: false });
    const [events, snapshots, checkpoint] = await Promise.all([
      prisma.discoveryEvent.count({ where: { runId: scenario.runId, businessId: scenario.businessId } }),
      prisma.businessSnapshot.count({ where: { businessId: scenario.businessId } }),
      prisma.processingCheckpoint.findUniqueOrThrow({ where: { runId_stage_entityType_entityId: { runId: scenario.runId, stage: 'DISCOVERY', entityType: 'CELL', entityId: scenario.cellId } } }),
    ]);
    expect(events).toBe(1);
    expect(snapshots).toBe(1);
    expect(checkpoint.processedItems).toBe(1);
    expect(checkpoint.page).toBe(1);
  });

  it('faz rollback conjunto de descoberta, snapshot e checkpoint', async () => {
    const scenario = await createScenario();
    await expect(prisma.$transaction(async tx => {
      await persistDiscoveryProgress(tx, { ...scenario, wasNew: true, page: 1, snapshot: { rating: 4 } });
      throw new Error('rollback proposital');
    })).rejects.toThrow('rollback proposital');
    const [events, snapshots, checkpoint] = await Promise.all([
      prisma.discoveryEvent.count({ where: { runId: scenario.runId } }),
      prisma.businessSnapshot.count({ where: { businessId: scenario.businessId } }),
      prisma.processingCheckpoint.findUniqueOrThrow({ where: { runId_stage_entityType_entityId: { runId: scenario.runId, stage: 'DISCOVERY', entityType: 'CELL', entityId: scenario.cellId } } }),
    ]);
    expect(events).toBe(0);
    expect(snapshots).toBe(0);
    expect(checkpoint.processedItems).toBe(0);
  });
});
