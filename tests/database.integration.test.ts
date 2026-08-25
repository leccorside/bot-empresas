import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { persistDiscoveryProgress, prisma } from '../packages/database/src';
import { generateGeographicGrid } from '../packages/shared/src';

const createdRunIds: string[] = [];
const createdBusinessIds: string[] = [];
const createdExportIds: string[] = [];

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
  if (createdExportIds.length) await prisma.exportRecord.deleteMany({ where: { id: { in: createdExportIds.splice(0) } } });
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

  it('mantém o catálogo da exportação independente da resposta HTTP', async () => {
    const id = `test-export-${randomUUID()}`; createdExportIds.push(id);
    await prisma.exportRecord.create({ data: { id, format: 'CSV', status: 'COMPLETED', filename: `${id}.csv`, storagePath: `/storage/exports/${id}.csv`, mimeType: 'text/csv', sizeBytes: 128, rowCount: 3, filters: { city: 'Goiânia' }, completedAt: new Date() } });
    await expect(prisma.exportRecord.findUnique({ where: { id } })).resolves.toMatchObject({ status: 'COMPLETED', rowCount: 3, sizeBytes: 128 });
  });

  it('persiste células ordenadas e permite retomar somente as pendentes', async () => {
    const suffix = randomUUID();
    const runId = `test-grid-run-${suffix}`;
    createdRunIds.push(runId);
    const bounds = { south: -16.72, north: -16.62, west: -49.32, east: -49.22 };
    const cells = generateGeographicGrid(bounds, 5_000, 20);
    await prisma.prospectingRun.create({ data: { id: runId, country: 'Brasil', state: 'GO', city: 'Cidade Grid', category: 'Clínicas', status: 'RUNNING', idempotencyKey: `grid:${suffix}`, boundarySouth: bounds.south, boundaryNorth: bounds.north, boundaryWest: bounds.west, boundaryEast: bounds.east, gridCellsTotal: cells.length } });
    await prisma.searchCell.createMany({ data: cells.map(cell => ({ runId, category: 'Clínicas', sequence: cell.sequence, latitude: cell.latitude, longitude: cell.longitude, radius: cell.radius, southLatitude: cell.south, northLatitude: cell.north, westLongitude: cell.west, eastLongitude: cell.east })) });
    await prisma.searchCell.updateMany({ where: { runId, sequence: 0 }, data: { status: 'COMPLETED', completedAt: new Date() } });
    const pending = await prisma.searchCell.findMany({ where: { runId, status: { not: 'COMPLETED' } }, orderBy: { sequence: 'asc' } });
    expect(pending).toHaveLength(cells.length - 1);
    expect(pending[0].sequence).toBe(1);
    expect(pending[0]).toMatchObject({ southLatitude: cells[1].south, northLatitude: cells[1].north, westLongitude: cells[1].west, eastLongitude: cells[1].east });
  });
});
