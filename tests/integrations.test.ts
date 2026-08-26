import { afterEach, describe, expect, it, vi } from 'vitest';
import { GooglePlacesProvider, WhatsAppCloudProvider, WhatsAppTemplateProvider } from '../packages/integrations/src';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GooglePlacesProvider', () => {
  it('usa dados determinísticos de demonstração sem chave', async () => {
    const provider = new GooglePlacesProvider('');
    const first = await provider.discover({ country: 'Brasil', state: 'GO', city: 'Goiânia', category: 'Academias' });
    const second = await provider.discover({ country: 'Brasil', state: 'GO', city: 'Goiânia', category: 'Academias' });
    expect(first).toEqual(second);
    expect(first.results).toHaveLength(3);
    expect(first.results.every(item => item.provider === 'DEMO')).toBe(true);
    await expect(provider.resolveBoundary({ country: 'Brasil', state: 'GO', city: 'Goiânia' })).resolves.toEqual(await provider.resolveBoundary({ country: 'Brasil', state: 'GO', city: 'Goiânia' }));
  });

  it('resolve o bounding box oficial da cidade', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [{ id: 'city-1', types: ['locality'], viewport: { low: { latitude: -16.8, longitude: -49.4 }, high: { latitude: -16.5, longitude: -49.1 } } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new GooglePlacesProvider('fake-key').resolveBoundary({ country: 'Brasil', state: 'GO', city: 'Goiânia' })).resolves.toEqual({ south: -16.8, north: -16.5, west: -49.4, east: -49.1 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ textQuery: 'Goiânia, GO, Brasil', pageSize: 5 });
    expect(fetchMock.mock.calls[0][1].headers['X-Goog-FieldMask']).toContain('places.viewport');
  });

  it('mapeia resposta oficial e envia token de paginação', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      places: [{ id: 'place-1', displayName: { text: 'Empresa Teste' }, formattedAddress: 'Rua 1', location: { latitude: -16.6, longitude: -49.2 }, nationalPhoneNumber: '(62) 99999-0000', rating: 4.5, userRatingCount: 12 }],
      nextPageToken: 'next-token',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new GooglePlacesProvider('fake-key').discover({ country: 'Brasil', state: 'GO', city: 'Goiânia', category: 'Clínicas', pageToken: 'current-token' });
    expect(result.nextPageToken).toBe('next-token');
    expect(result.results[0]).toMatchObject({ provider: 'GOOGLE', providerId: 'place-1', name: 'Empresa Teste', rating: 4.5, reviewsCount: 12 });
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(JSON.parse(request[1].body)).toMatchObject({ pageToken: 'current-token', languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 });
  });

  it('restringe a busca aos limites exatos da célula', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await new GooglePlacesProvider('fake-key').discover({ country: 'Brasil', state: 'GO', city: 'Goiânia', category: 'Clínicas', bounds: { south: -16.7, north: -16.6, west: -49.3, east: -49.2 } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ textQuery: 'Clínicas', locationRestriction: { rectangle: { low: { latitude: -16.7, longitude: -49.3 }, high: { latitude: -16.6, longitude: -49.2 } } } });
  });

  it('propaga erro HTTP do Google sem ocultar o status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota exceeded', { status: 429 })));
    await expect(new GooglePlacesProvider('fake-key').discover({ country: 'Brasil', state: 'GO', city: 'Goiânia', category: 'Lojas' })).rejects.toThrow('Google Places respondeu 429');
  });
});

describe('WhatsAppCloudProvider', () => {
  it('não faz chamada externa durante dry run', async () => {
    process.env.DRY_RUN = 'true';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(new WhatsAppCloudProvider().send({ to: '+5562999990000', idempotencyKey: 'message-1', template: { name: 'oportunidade', language: 'pt_BR', bodyParameters: ['Empresa'] } })).resolves.toEqual({ providerMessageId: 'dry-run:message-1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exige credenciais quando envio real está habilitado', async () => {
    process.env.DRY_RUN = 'false';
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await expect(new WhatsAppCloudProvider().send({ to: '+5562999990000', idempotencyKey: 'message-2', template: { name: 'oportunidade', language: 'pt_BR', bodyParameters: [] } })).rejects.toThrow('Credenciais WhatsApp não configuradas');
  });

  it('mapeia o identificador devolvido pela API oficial', async () => {
    process.env.DRY_RUN = 'false';
    process.env.WHATSAPP_ACCESS_TOKEN = 'fake-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(new WhatsAppCloudProvider().send({ to: '+5562999990000', idempotencyKey: 'message-3', template: { name: 'oportunidade', language: 'pt_BR', bodyParameters: ['Empresa Teste'] } })).resolves.toEqual({ providerMessageId: 'wamid.123' });
  });

  it('envia como mensagem de template (não texto livre), com os parâmetros na ordem certa', async () => {
    process.env.DRY_RUN = 'false';
    process.env.WHATSAPP_ACCESS_TOKEN = 'fake-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.456' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await new WhatsAppCloudProvider().send({ to: '+5562999990000', idempotencyKey: 'message-4', template: { name: 'oportunidade_site', language: 'pt_BR', bodyParameters: ['Padaria Central', 'Caldas Novas'] } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/phone-id/messages');
    expect(JSON.parse(options.body)).toMatchObject({ type: 'template', template: { name: 'oportunidade_site', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Padaria Central' }, { type: 'text', text: 'Caldas Novas' }] }] } });
  });

  it('omite components quando o template não tem variáveis', async () => {
    process.env.DRY_RUN = 'false';
    process.env.WHATSAPP_ACCESS_TOKEN = 'fake-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.789' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await new WhatsAppCloudProvider().send({ to: '+5562999990000', idempotencyKey: 'message-5', template: { name: 'aviso_fixo', language: 'pt_BR', bodyParameters: [] } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.components).toBeUndefined();
  });
});

describe('WhatsAppTemplateProvider', () => {
  it('sem credenciais da Meta, aprova localmente em modo demo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new WhatsAppTemplateProvider('', '');
    const result = await provider.submit({ name: 'oportunidade_site', language: 'pt_BR', category: 'MARKETING', bodyText: 'Olá {{1}}!' });
    expect(result).toEqual({ providerTemplateId: 'demo:oportunidade_site', status: 'APPROVED' });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(provider.checkStatus(result.providerTemplateId)).resolves.toEqual({ status: 'APPROVED' });
  });

  it('com credenciais, submete à API oficial e retorna status pendente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'meta-template-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new WhatsAppTemplateProvider('fake-token', 'waba-1');
    const result = await provider.submit({ name: 'oportunidade_site', language: 'pt_BR', category: 'MARKETING', bodyText: 'Olá {{1}}!' });
    expect(result).toEqual({ providerTemplateId: 'meta-template-1', status: 'PENDING' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v23.0/waba-1/message_templates');
  });

  it('propaga erro HTTP da Meta ao submeter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid template', { status: 400 })));
    const provider = new WhatsAppTemplateProvider('fake-token', 'waba-1');
    await expect(provider.submit({ name: 'x', language: 'pt_BR', category: 'MARKETING', bodyText: 'Olá {{1}}!' })).rejects.toThrow('Meta respondeu 400');
  });
});
