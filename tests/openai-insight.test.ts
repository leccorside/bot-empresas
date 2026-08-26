import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiInsightProvider } from '../packages/integrations/src';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const businessInput = { name: 'Padaria Boa Vista', category: 'Padarias', city: 'Caldas Novas', state: 'GO', siteStatus: 'NO_WEBSITE', hasWebsite: false, reviewsCount: 0, rating: null, leadScore: 65, technologies: [] };

describe('OpenAiInsightProvider — insight de lead', () => {
  it('sem chave, gera um insight determinístico em modo demo sem chamar a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiInsightProvider('');
    const first = await provider.generateLeadInsight(businessInput);
    const second = await provider.generateLeadInsight(businessInput);
    expect(first).toEqual(second);
    expect(first.model).toBe('demo');
    expect(first.summary).toContain('Padaria Boa Vista');
    expect(first.summary.toLowerCase()).toContain('não possui site');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('menciona site ruim quando existe website mas está com status POOR', async () => {
    const provider = new OpenAiInsightProvider('');
    const result = await provider.generateLeadInsight({ ...businessInput, hasWebsite: true, siteStatus: 'POOR' });
    expect(result.summary.toLowerCase()).toContain('problemas técnicos');
  });

  it('com chave, consulta a API oficial da OpenAI e retorna o JSON estruturado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: 'Resumo gerado', suggestedPitch: 'Abordagem sugerida' }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiInsightProvider('fake-key');
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
  it('sem chave, reconhece palavras-chave comuns em modo demo', async () => {
    const provider = new OpenAiInsightProvider('');
    await expect(provider.suggestSegment('quero empresas sem site em Caldas Novas')).resolves.toMatchObject({ filters: { hasWebsite: false } });
    await expect(provider.suggestSegment('leads com score alto e melhores oportunidades')).resolves.toMatchObject({ filters: { minScore: 60 } });
    await expect(provider.suggestSegment('empresas com site ruim e péssimo desempenho')).resolves.toMatchObject({ filters: { siteStatus: 'POOR' } });
  });

  it('sem chave e sem palavras-chave reconhecidas, retorna filtro vazio com explicação', async () => {
    const provider = new OpenAiInsightProvider('');
    const result = await provider.suggestSegment('algo bem genérico e sem sinais claros');
    expect(result.filters).toEqual({});
    expect(result.explanation).toContain('OPENAI_API_KEY');
  });

  it('com chave, consulta a API oficial e retorna o filtro estruturado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ filters: { city: 'Caldas Novas', hasWebsite: false }, explanation: 'Empresas sem site em Caldas Novas' }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiInsightProvider('fake-key');
    await expect(provider.suggestSegment('empresas sem site em Caldas Novas')).resolves.toEqual({ filters: { city: 'Caldas Novas', hasWebsite: false }, explanation: 'Empresas sem site em Caldas Novas' });
  });
});
