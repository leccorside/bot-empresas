import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { ApiService } from '../apps/api/src/service';

const createdBusinessIds: string[] = [];
const createdCampaignIds: string[] = [];
const createdTemplateIds: string[] = [];
let originalAccessToken: string | undefined;
let originalWabaId: string | undefined;

beforeAll(() => prisma.$connect());

beforeEach(() => {
  // Força modo demo do WhatsAppTemplateProvider (aprovação instantânea) mesmo com credenciais
  // reais da Meta configuradas no .env, para não submeter um template real durante o teste.
  originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  originalWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
});

afterEach(async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = originalWabaId;
  if (createdCampaignIds.length) await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds.splice(0) } } });
  if (createdTemplateIds.length) await prisma.messageTemplate.deleteMany({ where: { id: { in: createdTemplateIds.splice(0) } } });
  if (createdBusinessIds.length) await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

describe('campanha a partir de um segmento sugerido pela IA', () => {
  it('ao agendar, respeita o filtro completo do segmento (categoria + ausência de site), não só city/minScore', async () => {
    const service = new ApiService();
    const suffix = randomUUID();
    const category = `Padarias Segmento ${suffix}`;

    const matchId = `test-segment-match-${suffix}`;
    const wrongWebsiteId = `test-segment-wrong-website-${suffix}`;
    const wrongCategoryId = `test-segment-wrong-category-${suffix}`;
    createdBusinessIds.push(matchId, wrongWebsiteId, wrongCategoryId);

    await prisma.business.create({ data: { id: matchId, provider: 'TEST', providerId: `segment-match-${suffix}`, name: 'Padaria Sem Site', normalizedName: 'padaria sem site', category, city: 'Cidade Segmento', state: 'GO', website: null, phone: '(62) 99999-0001', normalizedPhone: `+55629${suffix.replace(/\D/g, '').slice(0, 7) || '1000000'}1` } });
    await prisma.business.create({ data: { id: wrongWebsiteId, provider: 'TEST', providerId: `segment-website-${suffix}`, name: 'Padaria Com Site', normalizedName: 'padaria com site', category, city: 'Cidade Segmento', state: 'GO', website: 'https://padaria-com-site.test', phone: '(62) 99999-0002', normalizedPhone: `+55629${suffix.replace(/\D/g, '').slice(0, 7) || '1000000'}2` } });
    await prisma.business.create({ data: { id: wrongCategoryId, provider: 'TEST', providerId: `segment-category-${suffix}`, name: 'Outro Ramo Sem Site', normalizedName: 'outro ramo sem site', category: `Outro Ramo ${suffix}`, city: 'Cidade Segmento', state: 'GO', website: null, phone: '(62) 99999-0003', normalizedPhone: `+55629${suffix.replace(/\D/g, '').slice(0, 7) || '1000000'}3` } });

    const templateName = `template_segmento_${suffix.replace(/-/g, '_')}`;
    const template = await service.createTemplate({ name: templateName, bodyText: 'Corpo fixo sem variáveis para o teste de segmento' });
    createdTemplateIds.push(template.id);
    const approvedTemplate = await service.submitTemplate(template.id);
    expect(approvedTemplate.status).toBe('APPROVED');

    const campaign = await service.createCampaign({ name: `Campanha Segmento ${suffix}`, templateId: approvedTemplate.id, filters: { category, hasWebsite: false } });
    createdCampaignIds.push(campaign.id);

    const result = await service.scheduleCampaign(campaign.id);
    expect(result.selected).toBe(1);

    const messages = await prisma.campaignMessage.findMany({ where: { campaignId: campaign.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].businessId).toBe(matchId);
  });
});
