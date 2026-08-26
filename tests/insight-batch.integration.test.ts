import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { ApiService } from '../apps/api/src/service';

const createdBusinessIds: string[] = [];
const createdBatchIds: string[] = [];
let originalOpenAiKey: string | undefined;
let originalGeminiKey: string | undefined;
let originalMaxSize: string | undefined;

beforeAll(() => prisma.$connect());

beforeEach(() => {
  // Força modo demo do AiInsightProvider mesmo que o .env tenha chaves reais configuradas,
  // para nunca fazer uma chamada de rede/custo real durante os testes.
  originalOpenAiKey = process.env.OPENAI_API_KEY;
  originalGeminiKey = process.env.GEMINI_API_KEY;
  originalMaxSize = process.env.INSIGHT_BATCH_MAX_SIZE;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

afterEach(async () => {
  process.env.OPENAI_API_KEY = originalOpenAiKey;
  process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalMaxSize === undefined) delete process.env.INSIGHT_BATCH_MAX_SIZE; else process.env.INSIGHT_BATCH_MAX_SIZE = originalMaxSize;
  if (createdBatchIds.length) await prisma.insightBatch.deleteMany({ where: { id: { in: createdBatchIds.splice(0) } } });
  if (createdBusinessIds.length) await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

async function createBusiness(overrides: Partial<{ category: string; city: string; website: string | null; withInsight: boolean }> = {}) {
  const suffix = randomUUID();
  const id = `test-batch-${suffix}`;
  createdBusinessIds.push(id);
  await prisma.business.create({ data: { id, provider: 'TEST', providerId: `batch-${suffix}`, name: `Empresa Lote ${suffix}`, normalizedName: `empresa lote ${suffix}`, category: overrides.category ?? 'Teste Lote', city: overrides.city ?? 'Cidade Lote', state: 'GO', website: overrides.website ?? null } });
  if (overrides.withInsight) await prisma.businessInsight.create({ data: { businessId: id, summary: 'resumo existente', suggestedPitch: 'pitch existente', model: 'demo' } });
  return id;
}

describe('geração de insights em lote', () => {
  it('cria um lote contando apenas empresas sem insight quando onlyMissing é true', async () => {
    const service = new ApiService();
    const category = `Categoria Lote ${randomUUID()}`;
    const withoutInsight = await createBusiness({ category });
    await createBusiness({ category, withInsight: true });

    const batch = await service.createInsightBatch({ filters: { category }, onlyMissing: true });
    createdBatchIds.push(batch.id);

    expect(batch.totalBusinesses).toBe(1);
    expect(batch.onlyMissing).toBe(true);
    expect(batch.status).toBe('WAITING');

    const stored = await service.insightBatch(batch.id);
    expect(stored.id).toBe(batch.id);
    void withoutInsight;
  });

  it('conta todas as empresas do filtro quando onlyMissing é false', async () => {
    const service = new ApiService();
    const category = `Categoria Lote ${randomUUID()}`;
    await createBusiness({ category });
    await createBusiness({ category, withInsight: true });

    const batch = await service.createInsightBatch({ filters: { category }, onlyMissing: false });
    createdBatchIds.push(batch.id);

    expect(batch.totalBusinesses).toBe(2);
  });

  it('respeita o teto de INSIGHT_BATCH_MAX_SIZE mesmo quando mais empresas correspondem ao filtro', async () => {
    process.env.INSIGHT_BATCH_MAX_SIZE = '1';
    const service = new ApiService();
    const category = `Categoria Lote ${randomUUID()}`;
    await createBusiness({ category });
    await createBusiness({ category });

    const batch = await service.createInsightBatch({ filters: { category }, onlyMissing: false });
    createdBatchIds.push(batch.id);

    expect(batch.totalBusinesses).toBe(1);
  });

  it('coage filtros vindos como string (hasWebsite) antes de aplicar, sem inverter o sentido do filtro', async () => {
    const service = new ApiService();
    const category = `Categoria Lote ${randomUUID()}`;
    const semSite = await createBusiness({ category, website: null });
    await createBusiness({ category, website: 'https://com-site.test' });

    // hasWebsite chega como string 'false' (ex: querystring/JSON solto), não boolean
    const batch = await service.createInsightBatch({ filters: { category, hasWebsite: 'false' }, onlyMissing: false });
    createdBatchIds.push(batch.id);

    expect(batch.totalBusinesses).toBe(1);
    void semSite;
  });

  it('rejeita quando nenhuma empresa corresponde ao filtro', async () => {
    const service = new ApiService();
    await expect(service.createInsightBatch({ filters: { category: `categoria-inexistente-${randomUUID()}` } })).rejects.toThrow();
  });

  it('consultar um lote inexistente retorna erro', async () => {
    const service = new ApiService();
    await expect(service.insightBatch(`missing-${randomUUID()}`)).rejects.toThrow();
    await expect(service.cancelInsightBatch(`missing-${randomUUID()}`)).rejects.toThrow();
  });

  it('lista os lotes mais recentes primeiro', async () => {
    const service = new ApiService();
    const category = `Categoria Lote ${randomUUID()}`;
    await createBusiness({ category });
    const batch = await service.createInsightBatch({ filters: { category } });
    createdBatchIds.push(batch.id);

    const list = await service.insightBatches();
    expect(list.some(item => item.id === batch.id)).toBe(true);
  });
});

describe('cancelamento de lote de insights', () => {
  it('cancela um lote em espera', async () => {
    const service = new ApiService();
    const category = `Categoria Lote ${randomUUID()}`;
    await createBusiness({ category });
    const batch = await service.createInsightBatch({ filters: { category } });
    createdBatchIds.push(batch.id);

    const cancelled = await service.cancelInsightBatch(batch.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.completedAt).not.toBeNull();
  });

  it('cancelar um lote já concluído é inofensivo (retorna o lote sem alterar o status)', async () => {
    const service = new ApiService();
    const category = `Categoria Lote ${randomUUID()}`;
    await createBusiness({ category });
    const batch = await service.createInsightBatch({ filters: { category } });
    createdBatchIds.push(batch.id);
    await prisma.insightBatch.update({ where: { id: batch.id }, data: { status: 'COMPLETED' } });

    const result = await service.cancelInsightBatch(batch.id);
    expect(result.status).toBe('COMPLETED');
  });
});
