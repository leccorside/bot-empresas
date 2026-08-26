import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiInsightProvider } from '../packages/integrations/src';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const businessInput = { name: 'Padaria Boa Vista', category: 'Padarias', city: 'Caldas Novas', state: 'GO', siteStatus: 'NO_WEBSITE', hasWebsite: false, reviewsCount: 0, rating: null, leadScore: 65, technologies: [] };

describe('OpenAiInsightProvider — insight de lead', () => {
  it('sem chave, rejeita sem chamar a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiInsightProvider('');
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generateLeadInsight(businessInput)).rejects.toThrow('Chave da OpenAI não configurada');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com chave, consulta a API oficial da OpenAI e retorna o JSON estruturado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: 'Resumo gerado', suggestedPitch: 'Abordagem sugerida' }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiInsightProvider('fake-key');
    expect(provider.isConfigured()).toBe(true);
    const result = await provider.generateLeadInsight(businessInput);
    expect(result).toEqual({ summary: 'Resumo gerado', suggestedPitch: 'Abordagem sugerida', model: 'gpt-4o-mini' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer fake-key');
    expect(JSON.parse(options.body)).toMatchObject({ model: 'gpt-4o-mini', response_format: { type: 'json_object' } });
  });

  it('propaga erro HTTP da OpenAI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));
    const provider = new OpenAiInsightProvider('fake-key');
    await expect(provider.generateLeadInsight(businessInput)).rejects.toThrow('OpenAI respondeu 429');
  });
});

describe('OpenAiInsightProvider — sugestão de segmento', () => {
  it('sem chave, rejeita sem chamar a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiInsightProvider('');
    await expect(provider.suggestSegment('empresas sem site')).rejects.toThrow('Chave da OpenAI não configurada');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com chave, consulta a API oficial e retorna o filtro estruturado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ filters: { city: 'Caldas Novas', hasWebsite: false }, explanation: 'Empresas sem site em Caldas Novas' }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiInsightProvider('fake-key');
    await expect(provider.suggestSegment('empresas sem site em Caldas Novas')).resolves.toEqual({ filters: { city: 'Caldas Novas', hasWebsite: false }, explanation: 'Empresas sem site em Caldas Novas' });
  });
});
