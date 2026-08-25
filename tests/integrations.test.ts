import { afterEach, describe, expect, it, vi } from 'vitest';
import { GooglePlacesProvider, WhatsAppCloudProvider } from '../packages/integrations/src';

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
    await expect(new WhatsAppCloudProvider().send({ to: '+5562999990000', body: 'Olá', idempotencyKey: 'message-1' })).resolves.toEqual({ providerMessageId: 'dry-run:message-1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exige credenciais quando envio real está habilitado', async () => {
    process.env.DRY_RUN = 'false';
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await expect(new WhatsAppCloudProvider().send({ to: '+5562999990000', body: 'Olá', idempotencyKey: 'message-2' })).rejects.toThrow('Credenciais WhatsApp não configuradas');
  });

  it('mapeia o identificador devolvido pela API oficial', async () => {
    process.env.DRY_RUN = 'false';
    process.env.WHATSAPP_ACCESS_TOKEN = 'fake-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(new WhatsAppCloudProvider().send({ to: '+5562999990000', body: 'Olá', idempotencyKey: 'message-3' })).resolves.toEqual({ providerMessageId: 'wamid.123' });
  });
});
