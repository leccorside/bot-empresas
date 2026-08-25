import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { ApiService } from '../apps/api/src/service';

const createdBusinessIds: string[] = [];
const createdCampaignIds: string[] = [];

beforeAll(() => prisma.$connect());

afterEach(async () => {
  if (createdCampaignIds.length) await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds.splice(0) } } });
  if (createdBusinessIds.length) await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

describe('analytics comercial', () => {
  it('calcula o funil e as taxas de mensagens, e detalha por campanha', async () => {
    const service = new ApiService();
    const before = await service.commercialAnalytics(30);

    const suffix = randomUUID();
    const businessAId = `test-commercial-a-${suffix}`, businessBId = `test-commercial-b-${suffix}`, campaignId = `test-commercial-campaign-${suffix}`;
    createdBusinessIds.push(businessAId, businessBId); createdCampaignIds.push(campaignId);
    await prisma.business.create({ data: { id: businessAId, provider: 'TEST', providerId: `commercial-a-${suffix}`, name: 'Comercial A', normalizedName: 'comercial a', category: 'Teste', city: 'Cidade Comercial', state: 'GO', leadStatus: 'INTERESTED' } });
    await prisma.business.create({ data: { id: businessBId, provider: 'TEST', providerId: `commercial-b-${suffix}`, name: 'Comercial B', normalizedName: 'comercial b', category: 'Teste', city: 'Cidade Comercial', state: 'GO', leadStatus: 'CUSTOMER' } });
    await prisma.campaign.create({ data: { id: campaignId, name: 'Campanha Comercial Teste', messageTemplate: 'Olá {{empresa}}' } });

    const now = new Date();
    await prisma.campaignMessage.createMany({
      data: [
        { campaignId, businessId: businessAId, phone: '+5562990000001', status: 'REPLIED', idempotencyKey: `campaign:${campaignId}:${businessAId}`, sentAt: now, deliveredAt: now, readAt: now, repliedAt: now },
        { campaignId, businessId: businessBId, phone: '+5562990000002', status: 'DELIVERED', idempotencyKey: `campaign:${campaignId}:${businessBId}`, sentAt: now, deliveredAt: now },
      ],
    });

    const after = await service.commercialAnalytics(30);

    expect(after.funnel.businessesFound - before.funnel.businessesFound).toBe(2);
    expect(after.funnel.qualifiedLeads - before.funnel.qualifiedLeads).toBe(2);
    expect(after.funnel.interested - before.funnel.interested).toBe(1);
    expect(after.funnel.customers - before.funnel.customers).toBe(1);
    expect(after.funnel.messagesSent - before.funnel.messagesSent).toBe(2);
    expect(after.funnel.messagesDelivered - before.funnel.messagesDelivered).toBe(2);
    expect(after.funnel.messagesRead - before.funnel.messagesRead).toBe(1);
    expect(after.funnel.messagesReplied - before.funnel.messagesReplied).toBe(1);

    const campaign = after.campaigns.find((item: any) => item.id === campaignId);
    expect(campaign).toMatchObject({ name: 'Campanha Comercial Teste', total: 2, sent: 2, delivered: 2, read: 1, replied: 1, deliveryRate: 100, readRate: 50, replyRate: 50 });
  });

  it('respeita e limita a janela de dias, e nunca retorna taxas não finitas', async () => {
    const service = new ApiService();
    expect((await service.commercialAnalytics(3)).days).toBe(7);
    expect((await service.commercialAnalytics(400)).days).toBe(180);
    const result = await service.commercialAnalytics(30);
    expect(Object.values(result.rates).every(value => Number.isFinite(value))).toBe(true);
  });
});
