import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { dispatchAutomaticInsights } from '../apps/scheduler/src/insights';

const businessIds: string[] = [];
const batchIds: string[] = [];
const originalEnabled = process.env.AUTO_GENERATE_INSIGHTS;

beforeAll(() => prisma.$connect());
afterEach(async () => {
  if (originalEnabled === undefined) delete process.env.AUTO_GENERATE_INSIGHTS; else process.env.AUTO_GENERATE_INSIGHTS = originalEnabled;
  if (batchIds.length) {
    const ids = batchIds.splice(0);
    await prisma.jobRecord.deleteMany({ where: { idempotencyKey: { in: ids.map(id => `insight-batch:${id}`) } } });
    await prisma.insightBatch.deleteMany({ where: { id: { in: ids } } });
  }
  if (businessIds.length) await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
});
afterAll(() => prisma.$disconnect());

async function business(withFreshInsight = false) {
  const suffix = randomUUID(), id = `test-auto-insight-${suffix}`;
  businessIds.push(id);
  await prisma.business.create({ data: { id, provider: 'TEST', providerId: `auto-insight-${suffix}`, name: 'Empresa Insight Automático', normalizedName: 'empresa insight automatico', category: 'Teste IA', city: 'Cidade IA', state: 'GO' } });
  if (withFreshInsight) await prisma.businessInsight.create({ data: { businessId: id, summary: 'Atual', suggestedPitch: 'Atual', model: 'demo' } });
  return id;
}

describe('scheduler de insights automáticos', () => {
  it('não cria lotes quando a automação está desligada', async () => {
    delete process.env.AUTO_GENERATE_INSIGHTS;
    const id = await business();
    expect(await dispatchAutomaticInsights(new Date(), async () => ({ id: 'unused' }), { businessIds: [id] })).toEqual({ dispatched: false, reason: 'disabled' });
  });

  it('reserva apenas empresas elegíveis e cria lote persistente recuperável', async () => {
    process.env.AUTO_GENERATE_INSIGHTS = 'true';
    const eligible = await business(), fresh = await business(true);
    const result = await dispatchAutomaticInsights(new Date(), async batchId => ({ id: `test-auto-${batchId}` }), { businessIds: [eligible, fresh] });
    expect(result.dispatched).toBe(true);
    if (!result.dispatched) return;
    batchIds.push(result.batchId);
    expect(result.businesses).toBe(1);
    const batch = await prisma.insightBatch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect(batch).toMatchObject({ source: 'AUTOMATIC', onlyMissing: false, totalBusinesses: 1, status: 'WAITING' });
    expect((batch.filters as any).businessIds).toEqual([eligible]);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: eligible } })).aiInsightQueuedAt).not.toBeNull();
    expect((await prisma.business.findUniqueOrThrow({ where: { id: fresh } })).aiInsightQueuedAt).toBeNull();
  });

  it('aguarda o Website Analyzer antes de gerar insight para empresa com site', async () => {
    process.env.AUTO_GENERATE_INSIGHTS = 'true';
    const id = await business();
    await prisma.business.update({ where: { id }, data: { website: 'https://aguardando-analise.test', websiteCheckedAt: null } });
    expect(await dispatchAutomaticInsights(new Date(), async () => ({ id: 'unused' }), { businessIds: [id] })).toEqual({ dispatched: false, reason: 'no_candidates' });
  });
});
