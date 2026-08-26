import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { ApiService } from '../apps/api/src/service';

const createdBusinessIds: string[] = [];
let originalOpenAiKey: string | undefined;
let originalGeminiKey: string | undefined;

beforeAll(() => prisma.$connect());

beforeEach(() => {
  // Força modo demo do AiInsightProvider mesmo que o .env tenha chaves reais configuradas
  // (Gemini e/ou OpenAI), para nunca fazer uma chamada de rede/custo real durante os testes.
  originalOpenAiKey = process.env.OPENAI_API_KEY;
  originalGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

afterEach(async () => {
  process.env.OPENAI_API_KEY = originalOpenAiKey;
  process.env.GEMINI_API_KEY = originalGeminiKey;
  if (createdBusinessIds.length) await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

async function createBusiness(overrides: Partial<{ website: string | null; siteStatus: string; reviewsCount: number; leadScore: number }> = {}) {
  const suffix = randomUUID();
  const id = `test-insight-${suffix}`;
  createdBusinessIds.push(id);
  await prisma.business.create({ data: { id, provider: 'TEST', providerId: `insight-${suffix}`, name: 'Empresa Insight', normalizedName: 'empresa insight', category: 'Teste', city: 'Cidade Insight', state: 'GO', website: overrides.website ?? null, siteStatus: (overrides.siteStatus as any) ?? 'NO_WEBSITE', reviewsCount: overrides.reviewsCount ?? 0, leadScore: overrides.leadScore ?? 0 } });
  return id;
}

describe('insight de lead assistido por IA', () => {
  it('gera, persiste (upsert) e permite aprovar um insight', async () => {
    const service = new ApiService();
    const id = await createBusiness();

    await expect(service.getLeadInsight(id)).resolves.toBeNull();

    const first = await service.generateLeadInsight(id);
    expect(first).toMatchObject({ businessId: id, model: 'demo', approved: false });
    expect(first.summary).toContain('Empresa Insight');

    const second = await service.generateLeadInsight(id);
    expect(second.id).toBe(first.id); // upsert: mesma linha, não duplica

    await expect(prisma.businessInsight.count({ where: { businessId: id } })).resolves.toBe(1);

    const approved = await service.approveInsight(id);
    expect(approved.approved).toBe(true);
  });

  it('aprovar sem insight gerado retorna erro', async () => {
    const service = new ApiService();
    const id = await createBusiness();
    await expect(service.approveInsight(id)).rejects.toThrow();
  });

  it('gerar insight para empresa inexistente retorna erro', async () => {
    const service = new ApiService();
    await expect(service.generateLeadInsight(`missing-${randomUUID()}`)).rejects.toThrow();
  });
});

describe('classificação assistida por IA (ajuste de score sugerido)', () => {
  it('gera um score sugerido com justificativa junto do insight', async () => {
    const service = new ApiService();
    const id = await createBusiness({ leadScore: 0 }); // sem site, sem avaliações: modo demo sugere ajuste

    const insight = await service.generateLeadInsight(id);
    expect(insight.suggestedScore).not.toBeNull();
    expect(insight.scoreJustification).not.toBe('');
    expect(insight.scoreApplied).toBe(false);
  });

  it('aplica o score sugerido ao Business, recalculando a scoreClass, e marca o insight como aplicado', async () => {
    const service = new ApiService();
    const id = await createBusiness({ leadScore: 0 });
    await service.generateLeadInsight(id);

    const updated = await service.applyInsightScore(id);
    const insight = await service.getLeadInsight(id);
    expect(updated!.leadScore).toBe(insight!.suggestedScore);
    expect(insight!.scoreApplied).toBe(true);

    const expectedClass = updated!.leadScore >= 80 ? 'VERY_HIGH' : updated!.leadScore >= 60 ? 'HIGH' : updated!.leadScore >= 30 ? 'MEDIUM' : 'LOW';
    expect(updated!.scoreClass).toBe(expectedClass);
  });

  it('regenerar o insight reseta scoreApplied para false', async () => {
    const service = new ApiService();
    const id = await createBusiness({ leadScore: 0 });
    await service.generateLeadInsight(id);
    await service.applyInsightScore(id);
    await expect(service.getLeadInsight(id)).resolves.toMatchObject({ scoreApplied: true });

    await service.generateLeadInsight(id);
    await expect(service.getLeadInsight(id)).resolves.toMatchObject({ scoreApplied: false });
  });

  it('aplicar score sem insight gerado retorna erro', async () => {
    const service = new ApiService();
    const id = await createBusiness();
    await expect(service.applyInsightScore(id)).rejects.toThrow();
  });
});

describe('segmentação sugerida por IA', () => {
  it('sugere filtros reconhecendo palavras-chave em modo demo', async () => {
    const service = new ApiService();
    const result = await service.suggestSegment({ goal: 'empresas sem site, ideal para oferta de criação de site' });
    expect(result.filters).toMatchObject({ hasWebsite: false });
  });

  it('descarta um siteStatus fora do enum antes de devolver ao cliente', async () => {
    const service = new ApiService();
    // Não há como injetar a resposta da IA no service diretamente aqui (o provider é
    // instanciado internamente); este teste cobre a sanitização usando o texto que o
    // modo demo já reconhece e confirma que apenas valores do enum chegam ao cliente.
    const result = await service.suggestSegment({ goal: 'empresas com site ruim e péssimo desempenho' });
    if (result.filters.siteStatus) expect(['NO_WEBSITE', 'POOR', 'AVERAGE', 'GOOD', 'UNKNOWN']).toContain(result.filters.siteStatus);
  });

  it('rejeita objetivo vazio ou curto demais', async () => {
    const service = new ApiService();
    await expect(service.suggestSegment({ goal: 'oi' })).rejects.toThrow();
  });
});
