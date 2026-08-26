import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiInsightProvider } from '../packages/integrations/src';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const businessInput = { name: 'Padaria Boa Vista', category: 'Padarias', city: 'Caldas Novas', state: 'GO', siteStatus: 'NO_WEBSITE', hasWebsite: false, reviewsCount: 0, rating: null, leadScore: 65, technologies: [] };

function geminiResponse(payload: unknown) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('GeminiInsightProvider — insight de lead', () => {
  it('sem chave, rejeita sem chamar a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiInsightProvider('', 'gemini-2.0-flash');
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generateLeadInsight(businessInput)).rejects.toThrow('Chave do Gemini não configurada');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com chave, consulta a API oficial do Gemini e retorna o JSON estruturado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse({ summary: 'Resumo gerado', suggestedPitch: 'Abordagem sugerida' }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiInsightProvider('fake-key', 'gemini-2.0-flash');
    expect(provider.isConfigured()).toBe(true);
    const result = await provider.generateLeadInsight(businessInput);
    expect(result).toEqual({ summary: 'Resumo gerado', suggestedPitch: 'Abordagem sugerida', model: 'gemini-2.0-flash' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=fake-key');
    expect(JSON.parse(options.body)).toMatchObject({ generationConfig: { responseMimeType: 'application/json' } });
  });

  it('usa o modelo default quando GEMINI_MODEL não é informado', async () => {
    const provider = new GeminiInsightProvider('fake-key', undefined as any);
    // o construtor cai no default 'gemini-2.0-flash' quando o parâmetro não é passado explicitamente
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse({ summary: 'x', suggestedPitch: 'y' }));
    vi.stubGlobal('fetch', fetchMock);
    await provider.generateLeadInsight(businessInput);
    expect(fetchMock.mock.calls[0][0]).toContain('models/gemini-2.0-flash:generateContent');
  });

  it('propaga erro HTTP do Gemini', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota exceeded', { status: 429 })));
    const provider = new GeminiInsightProvider('fake-key', 'gemini-2.0-flash');
    await expect(provider.generateLeadInsight(businessInput)).rejects.toThrow('Gemini respondeu 429');
  });
});

describe('GeminiInsightProvider — sugestão de segmento', () => {
  it('com chave, consulta a API oficial e retorna o filtro estruturado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse({ filters: { city: 'Caldas Novas', hasWebsite: false }, explanation: 'Empresas sem site em Caldas Novas' }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiInsightProvider('fake-key', 'gemini-2.0-flash');
    await expect(provider.suggestSegment('empresas sem site em Caldas Novas')).resolves.toEqual({ filters: { city: 'Caldas Novas', hasWebsite: false }, explanation: 'Empresas sem site em Caldas Novas' });
  });
});
