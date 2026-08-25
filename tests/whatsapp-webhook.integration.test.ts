import { createHmac, randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { normalizePhone } from '../packages/shared/src';
import { ApiService } from '../apps/api/src/service';

const createdBusinessIds: string[] = [];
const createdCampaignIds: string[] = [];

function whatsappFrom(suffix: string) {
  const digits8 = (suffix.replace(/\D/g, '') + '00000000').slice(0, 8);
  return `5562${9}${digits8}`;
}

function statusPayload(id: string, status: string) {
  return { entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] };
}
function messagePayload(from: string, text: string) {
  return { entry: [{ changes: [{ value: { messages: [{ from, text: { body: text } }] } }] }] };
}

beforeAll(() => prisma.$connect());

afterEach(async () => {
  if (createdBusinessIds.length) {
    const ids = createdBusinessIds.splice(0);
    await prisma.contactSuppression.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  }
  if (createdCampaignIds.length) await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

describe('webhook de verificação (handshake)', () => {
  it('retorna o challenge quando o token confere', () => {
    const original = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'meu-token';
    try {
      const service = new ApiService();
      expect(service.verifyWhatsAppWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'meu-token', 'hub.challenge': '12345' })).toBe('12345');
      expect(() => service.verifyWhatsAppWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '12345' })).toThrow();
    } finally { process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = original; }
  });
});

describe('webhook de eventos', () => {
  it('rejeita corpo com assinatura inválida quando WHATSAPP_APP_SECRET está configurado', async () => {
    const original = process.env.WHATSAPP_APP_SECRET;
    process.env.WHATSAPP_APP_SECRET = 'segredo-teste';
    try {
      const service = new ApiService();
      const body = Buffer.from(JSON.stringify({ entry: [] }));
      await expect(service.receiveWhatsAppWebhook(body, 'sha256=assinatura-invalida')).rejects.toThrow();
      const valid = `sha256=${createHmac('sha256', 'segredo-teste').update(body).digest('hex')}`;
      await expect(service.receiveWhatsAppWebhook(body, valid)).resolves.toEqual({ received: true });
    } finally { process.env.WHATSAPP_APP_SECRET = original; }
  });

  it('atualiza o status da CampaignMessage a partir do callback de status', async () => {
    const service = new ApiService();
    const suffix = randomUUID();
    const businessId = `test-wa-status-${suffix}`, campaignId = `test-wa-campaign-${suffix}`;
    createdBusinessIds.push(businessId); createdCampaignIds.push(campaignId);
    await prisma.business.create({ data: { id: businessId, provider: 'TEST', providerId: `wa-status-${suffix}`, name: 'Lead Status', normalizedName: 'lead status', category: 'Teste', city: 'Cidade WA', state: 'GO', phone: '(62) 99999-0000', normalizedPhone: `+55629${suffix.replace(/\D/g, '').slice(0, 8) || '10000000'}` } });
    await prisma.campaign.create({ data: { id: campaignId, name: 'Campanha Teste WA', messageTemplate: 'Olá {{empresa}}' } });
    const providerMessageId = `wamid.test-${suffix}`;
    const message = await prisma.campaignMessage.create({ data: { campaignId, businessId, phone: '+5562999990000', status: 'SENT', providerMessageId, idempotencyKey: `campaign:${campaignId}:${businessId}`, sentAt: new Date() } });

    await service.receiveWhatsAppWebhook(Buffer.from(JSON.stringify(statusPayload(providerMessageId, 'delivered'))), undefined);
    await expect(prisma.campaignMessage.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({ status: 'DELIVERED' });

    await service.receiveWhatsAppWebhook(Buffer.from(JSON.stringify(statusPayload(providerMessageId, 'read'))), undefined);
    const read = await prisma.campaignMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(read.status).toBe('READ');
    expect(read.readAt).toBeTruthy();
  });

  it('resposta inbound avança o lead para REPLIED e marca a mensagem como respondida', async () => {
    const service = new ApiService();
    const suffix = randomUUID();
    const businessId = `test-wa-reply-${suffix}`, campaignId = `test-wa-reply-campaign-${suffix}`;
    createdBusinessIds.push(businessId); createdCampaignIds.push(campaignId);
    const from = whatsappFrom(suffix);
    const normalizedPhone = normalizePhone(`+${from}`)!;
    await prisma.business.create({ data: { id: businessId, provider: 'TEST', providerId: `wa-reply-${suffix}`, name: 'Lead Reply', normalizedName: 'lead reply', category: 'Teste', city: 'Cidade WA', state: 'GO', normalizedPhone, leadStatus: 'CONTACTED' } });
    await prisma.campaign.create({ data: { id: campaignId, name: 'Campanha Reply', messageTemplate: 'Olá {{empresa}}' } });
    const message = await prisma.campaignMessage.create({ data: { campaignId, businessId, phone: normalizedPhone, status: 'SENT', providerMessageId: `wamid.reply-${suffix}`, idempotencyKey: `campaign:${campaignId}:${businessId}`, sentAt: new Date() } });

    await service.receiveWhatsAppWebhook(Buffer.from(JSON.stringify(messagePayload(from, 'Tenho interesse sim, podemos conversar'))), undefined);

    await expect(prisma.business.findUniqueOrThrow({ where: { id: businessId } })).resolves.toMatchObject({ leadStatus: 'REPLIED' });
    await expect(prisma.campaignMessage.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({ status: 'REPLIED' });
    const events = await prisma.leadEvent.findMany({ where: { businessId } });
    expect(events).toMatchObject([{ fromStatus: 'CONTACTED', toStatus: 'REPLIED' }]);
  });

  it('resposta inbound com pedido de opt-out marca DO_NOT_CONTACT e suprime o telefone', async () => {
    const service = new ApiService();
    const suffix = randomUUID();
    const businessId = `test-wa-optout-${suffix}`;
    createdBusinessIds.push(businessId);
    const from = whatsappFrom(suffix);
    const normalizedPhone = normalizePhone(`+${from}`)!;
    await prisma.business.create({ data: { id: businessId, provider: 'TEST', providerId: `wa-optout-${suffix}`, name: 'Lead Optout', normalizedName: 'lead optout', category: 'Teste', city: 'Cidade WA', state: 'GO', normalizedPhone, leadStatus: 'CONTACTED' } });

    await service.receiveWhatsAppWebhook(Buffer.from(JSON.stringify(messagePayload(from, 'Por favor pare de enviar mensagens'))), undefined);

    await expect(prisma.business.findUniqueOrThrow({ where: { id: businessId } })).resolves.toMatchObject({ leadStatus: 'DO_NOT_CONTACT' });
    await expect(prisma.contactSuppression.findUnique({ where: { normalizedPhone } })).resolves.toMatchObject({ businessId });
  });
});

describe('campaignMessages', () => {
  it('lista as mensagens de uma campanha com o nome da empresa', async () => {
    const service = new ApiService();
    const suffix = randomUUID();
    const businessId = `test-wa-list-${suffix}`, campaignId = `test-wa-list-campaign-${suffix}`;
    createdBusinessIds.push(businessId); createdCampaignIds.push(campaignId);
    await prisma.business.create({ data: { id: businessId, provider: 'TEST', providerId: `wa-list-${suffix}`, name: 'Lead Lista', normalizedName: 'lead lista', category: 'Teste', city: 'Cidade WA', state: 'GO' } });
    await prisma.campaign.create({ data: { id: campaignId, name: 'Campanha Lista', messageTemplate: 'Olá {{empresa}}' } });
    await prisma.campaignMessage.create({ data: { campaignId, businessId, phone: '+5562999990001', status: 'SENT', idempotencyKey: `campaign:${campaignId}:${businessId}` } });

    const messages = await service.campaignMessages(campaignId);
    expect(messages).toMatchObject([{ business: { name: 'Lead Lista' } }]);
    await expect(service.campaignMessages(`missing-${suffix}`)).rejects.toThrow();
  });
});
