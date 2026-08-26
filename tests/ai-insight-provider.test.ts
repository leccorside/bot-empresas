import { describe, expect, it, vi } from 'vitest';
import { AiInsightProvider, demoLeadInsight, demoSegmentSuggestion, GeminiInsightProvider, OpenAiInsightProvider } from '../packages/integrations/src';

const businessInput = { name: 'Padaria Boa Vista', category: 'Padarias', city: 'Caldas Novas', state: 'GO', siteStatus: 'NO_WEBSITE', hasWebsite: false, reviewsCount: 0, rating: null, leadScore: 65, technologies: [] };

function fakeGemini(overrides: Partial<GeminiInsightProvider> = {}) {
  const provider = new GeminiInsightProvider('', undefined);
  return Object.assign(provider, { isConfigured: () => false, generateLeadInsight: vi.fn(), suggestSegment: vi.fn() }, overrides) as unknown as GeminiInsightProvider;
}
function fakeOpenAi(overrides: Partial<OpenAiInsightProvider> = {}) {
  const provider = new OpenAiInsightProvider('');
  return Object.assign(provider, { isConfigured: () => false, generateLeadInsight: vi.fn(), suggestSegment: vi.fn() }, overrides) as unknown as OpenAiInsightProvider;
}

describe('AiInsightProvider — orquestração em cadeia', () => {
  it('sem nenhum provedor configurado, usa o modo demo', async () => {
    const gemini = fakeGemini(), openai = fakeOpenAi();
    const provider = new AiInsightProvider(gemini, openai);
    const result = await provider.generateLeadInsight(businessInput);
    expect(result).toEqual(demoLeadInsight(businessInput));
    expect((gemini.generateLeadInsight as any)).not.toHaveBeenCalled();
    expect((openai.generateLeadInsight as any)).not.toHaveBeenCalled();
  });

  it('com só o Gemini configurado, usa o Gemini', async () => {
    const geminiResult = { summary: 'via gemini', suggestedPitch: 'oi', model: 'gemini-2.0-flash' };
    const gemini = fakeGemini({ isConfigured: () => true, generateLeadInsight: vi.fn().mockResolvedValue(geminiResult) } as any);
    const openai = fakeOpenAi();
    const result = await new AiInsightProvider(gemini, openai).generateLeadInsight(businessInput);
    expect(result).toEqual(geminiResult);
    expect((openai.generateLeadInsight as any)).not.toHaveBeenCalled();
  });

  it('com só a OpenAI configurada, usa a OpenAI direto (sem tentar o Gemini)', async () => {
    const openaiResult = { summary: 'via openai', suggestedPitch: 'oi', model: 'gpt-4o-mini' };
    const gemini = fakeGemini();
    const openai = fakeOpenAi({ isConfigured: () => true, generateLeadInsight: vi.fn().mockResolvedValue(openaiResult) } as any);
    const result = await new AiInsightProvider(gemini, openai).generateLeadInsight(businessInput);
    expect(result).toEqual(openaiResult);
    expect((gemini.generateLeadInsight as any)).not.toHaveBeenCalled();
  });

  it('com os dois configurados, prioriza o Gemini (economiza tokens da OpenAI)', async () => {
    const geminiResult = { summary: 'via gemini', suggestedPitch: 'oi', model: 'gemini-2.0-flash' };
    const gemini = fakeGemini({ isConfigured: () => true, generateLeadInsight: vi.fn().mockResolvedValue(geminiResult) } as any);
    const openai = fakeOpenAi({ isConfigured: () => true, generateLeadInsight: vi.fn() } as any);
    const result = await new AiInsightProvider(gemini, openai).generateLeadInsight(businessInput);
    expect(result).toEqual(geminiResult);
    expect((openai.generateLeadInsight as any)).not.toHaveBeenCalled();
  });

  it('se o Gemini falhar e a OpenAI estiver configurada, cai para a OpenAI', async () => {
    const openaiResult = { summary: 'via openai (fallback)', suggestedPitch: 'oi', model: 'gpt-4o-mini' };
    const gemini = fakeGemini({ isConfigured: () => true, generateLeadInsight: vi.fn().mockRejectedValue(new Error('Gemini respondeu 429')) } as any);
    const openai = fakeOpenAi({ isConfigured: () => true, generateLeadInsight: vi.fn().mockResolvedValue(openaiResult) } as any);
    const result = await new AiInsightProvider(gemini, openai).generateLeadInsight(businessInput);
    expect(result).toEqual(openaiResult);
  });

  it('se o Gemini falhar e não houver OpenAI configurada, propaga o erro (não mascara com demo)', async () => {
    const gemini = fakeGemini({ isConfigured: () => true, generateLeadInsight: vi.fn().mockRejectedValue(new Error('Gemini respondeu 429')) } as any);
    const openai = fakeOpenAi();
    await expect(new AiInsightProvider(gemini, openai).generateLeadInsight(businessInput)).rejects.toThrow('Gemini respondeu 429');
  });

  it('mesma cadeia de prioridade se aplica à sugestão de segmento', async () => {
    const geminiResult = { filters: { hasWebsite: false }, explanation: 'via gemini' };
    const gemini = fakeGemini({ isConfigured: () => true, suggestSegment: vi.fn().mockResolvedValue(geminiResult) } as any);
    const openai = fakeOpenAi({ isConfigured: () => true, suggestSegment: vi.fn() } as any);
    const result = await new AiInsightProvider(gemini, openai).suggestSegment('empresas sem site');
    expect(result).toEqual(geminiResult);
    expect((openai.suggestSegment as any)).not.toHaveBeenCalled();
  });
});

describe('funções puras de modo demo', () => {
  it('demoLeadInsight é determinístico e reflete a ausência de site', () => {
    const first = demoLeadInsight(businessInput);
    const second = demoLeadInsight(businessInput);
    expect(first).toEqual(second);
    expect(first.model).toBe('demo');
    expect(first.summary.toLowerCase()).toContain('não possui site');
  });

  it('demoSegmentSuggestion reconhece palavras-chave comuns', () => {
    expect(demoSegmentSuggestion('quero empresas sem site em Caldas Novas').filters).toMatchObject({ hasWebsite: false });
    expect(demoSegmentSuggestion('leads com score alto e melhores oportunidades').filters).toMatchObject({ minScore: 60 });
    expect(demoSegmentSuggestion('empresas com site ruim e péssimo desempenho').filters).toMatchObject({ siteStatus: 'POOR' });
  });

  it('demoSegmentSuggestion sem palavras-chave reconhecidas retorna filtro vazio com explicação', () => {
    const result = demoSegmentSuggestion('algo bem genérico e sem sinais claros');
    expect(result.filters).toEqual({});
    expect(result.explanation).toContain('GEMINI_API_KEY');
  });
});
