import { describe, expect, it, vi } from 'vitest';
import { PageSpeedProvider } from '../packages/integrations/src/pagespeed';

describe('PageSpeedProvider', () => {
  it('sem chave, retorna um score de demonstração determinístico sem chamar a rede', async () => {
    const provider = new PageSpeedProvider('');
    const first = await provider.analyze('https://example.com');
    const second = await provider.analyze('https://example.com');
    expect(first).toEqual(second);
    expect(first.performanceScore).toBeGreaterThanOrEqual(0);
    expect(first.performanceScore).toBeLessThan(100);
  });

  it('com chave, consulta a API do PageSpeed e converte o score para 0-100', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ lighthouseResult: { categories: { performance: { score: 0.42 } } } }), { status: 200 }) as any);
    const provider = new PageSpeedProvider('test-key');
    const result = await provider.analyze('https://example.com');
    expect(result.performanceScore).toBe(42);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('key')).toBe('test-key');
    expect(url.searchParams.get('url')).toBe('https://example.com');
    fetchSpy.mockRestore();
  });

  it('com chave, propaga erro quando a API responde com falha', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('quota excedida', { status: 429 }) as any);
    const provider = new PageSpeedProvider('test-key');
    await expect(provider.analyze('https://example.com')).rejects.toThrow('429');
    fetchSpy.mockRestore();
  });
});
