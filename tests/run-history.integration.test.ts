import { randomUUID } from 'crypto';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { ApiService } from '../apps/api/src/service';

const createdRunIds: string[] = [];
const createdBusinessIds: string[] = [];

beforeAll(() => prisma.$connect());

afterEach(async () => {
  if (createdRunIds.length) await prisma.prospectingRun.deleteMany({ where: { id: { in: createdRunIds.splice(0) } } });
  if (createdBusinessIds.length) await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

describe('histórico de execuções — comparação de crescimento', () => {
  it('calcula crescimento de empresas e oportunidades entre execuções da mesma cidade/categoria', async () => {
    const suffix = randomUUID();
    const city = `Cidade Histórico ${suffix}`, state = 'GO', category = 'Restaurantes';
    const runOldId = `test-history-run-old-${suffix}`, runNewId = `test-history-run-new-${suffix}`;
    createdRunIds.push(runOldId, runNewId);
    await prisma.prospectingRun.create({ data: { id: runOldId, country: 'Brasil', state, city, category, status: 'COMPLETED', idempotencyKey: `test-history-old:${suffix}`, createdAt: new Date('2026-08-01T00:00:00.000Z'), businessesFound: 10, businessesNew: 10, duplicatesFound: 0 } });
    await prisma.prospectingRun.create({ data: { id: runNewId, country: 'Brasil', state, city, category, status: 'COMPLETED', idempotencyKey: `test-history-new:${suffix}`, createdAt: new Date('2026-08-15T00:00:00.000Z'), businessesFound: 16, businessesNew: 6, duplicatesFound: 1 } });

    const highOldId = `test-history-biz-high-old-${suffix}`, highNewId = `test-history-biz-high-new-${suffix}`, lowNewId = `test-history-biz-low-new-${suffix}`;
    createdBusinessIds.push(highOldId, highNewId, lowNewId);
    await prisma.business.create({ data: { id: highOldId, provider: 'TEST', providerId: `high-old-${suffix}`, name: 'Alta Antiga', normalizedName: 'alta antiga', category, city, state, leadScore: 70 } });
    await prisma.business.create({ data: { id: highNewId, provider: 'TEST', providerId: `high-new-${suffix}`, name: 'Alta Nova', normalizedName: 'alta nova', category, city, state, leadScore: 65 } });
    await prisma.business.create({ data: { id: lowNewId, provider: 'TEST', providerId: `low-new-${suffix}`, name: 'Baixa Nova', normalizedName: 'baixa nova', category, city, state, leadScore: 20 } });

    await prisma.discoveryEvent.create({ data: { runId: runOldId, businessId: highOldId, wasNew: true } });
    await prisma.discoveryEvent.create({ data: { runId: runNewId, businessId: highNewId, wasNew: true } });
    await prisma.discoveryEvent.create({ data: { runId: runNewId, businessId: lowNewId, wasNew: true } });

    const [group] = await new ApiService().runHistory({ city, state, category });
    expect(group.destination).toEqual({ city, state, category });
    expect(group.runs).toHaveLength(2);
    const [oldRun, newRun] = group.runs;
    expect(oldRun).toMatchObject({ businessesFound: 10, opportunitiesFound: 1, growthBusinesses: null, growthOpportunities: null });
    expect(newRun).toMatchObject({ businessesFound: 16, opportunitiesFound: 1, growthBusinesses: 6, growthOpportunities: 0 });
  });
});
