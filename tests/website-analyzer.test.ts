import { describe, expect, it, vi } from 'vitest';
import { analyzeWebsite, classifyWebsite, isPrivateAddress, normalizeWebsiteUrl, websiteAnalysisVersion } from '../packages/integrations/src/website';

const publicResolver = async () => ['93.184.216.34'];

describe('Website Analyzer', () => {
  it('normaliza URLs e gera uma versão idempotente por endereço', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
    expect(websiteAnalysisVersion('example.com')).toBe(websiteAnalysisVersion('https://example.com/'));
    expect(websiteAnalysisVersion('https://example.com/a')).not.toBe(websiteAnalysisVersion('https://example.com/b'));
    expect(() => normalizeWebsiteUrl('file:///etc/passwd')).toThrow('HTTP');
  });

  it('bloqueia endereços locais, privados e reservados', async () => {
    expect(['127.0.0.1', '10.0.0.1', '172.16.4.2', '192.168.1.1', '::1', 'fd00::1', '::ffff:c0a8:101'].every(isPrivateAddress)).toBe(true);
    const fetcher = vi.fn();
    await expect(analyzeWebsite('http://internal.test', { fetcher, resolveHost: async () => ['10.0.0.5'] })).rejects.toThrow('privado');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('analisa HTTP, SSL, viewport, metadados, WordPress e tecnologias', async () => {
    const html = '<html><head><title> Clínica Exemplo </title><meta content="width=device-width" name="viewport"><meta name="description" content="Saúde &amp; bem-estar"><script src="/wp-includes/js/jquery.min.js"></script><link href="bootstrap.min.css"></head></html>';
    const fetcher = vi.fn().mockResolvedValue(new Response(html, { status: 200, headers: { server: 'cloudflare', 'x-powered-by': 'PHP/8.3' } }));
    const result = await analyzeWebsite('https://example.com', { fetcher, resolveHost: publicResolver });
    expect(result).toMatchObject({ finalUrl: 'https://example.com/', status: 'GOOD', httpStatus: 200, hasHttps: true, sslValid: true, hasViewport: true, title: 'Clínica Exemplo', description: 'Saúde & bem-estar', isWordPress: true });
    expect(result.technologies).toEqual(expect.arrayContaining(['WordPress', 'jQuery', 'Bootstrap', 'Cloudflare', 'PHP/8.3']));
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('valida novamente cada destino de redirecionamento', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    await expect(analyzeWebsite('https://example.com', { fetcher, resolveHost: async host => host === 'example.com' ? ['93.184.216.34'] : [host] })).rejects.toThrow('privado');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('classifica sites degradados sem misturar a futura métrica PageSpeed', () => {
    expect(classifyWebsite({ httpStatus: 503, responseMs: 200, hasHttps: true, sslValid: true, hasViewport: true, title: 'Site', description: 'Descrição' })).toBe('POOR');
    expect(classifyWebsite({ httpStatus: 200, responseMs: 5_000, hasHttps: false, sslValid: false, hasViewport: false, title: null, description: null })).toBe('POOR');
    expect(classifyWebsite({ httpStatus: 200, responseMs: 3_000, hasHttps: true, sslValid: true, hasViewport: false, title: 'Site', description: null })).toBe('AVERAGE');
  });
});
