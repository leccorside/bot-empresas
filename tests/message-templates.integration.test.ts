import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { ApiService } from '../apps/api/src/service';

const createdCampaignIds: string[] = [];
const createdTemplateIds: string[] = [];

beforeAll(() => prisma.$connect());

afterEach(async () => {
  if (createdCampaignIds.length) await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds.splice(0) } } });
  if (createdTemplateIds.length) await prisma.messageTemplate.deleteMany({ where: { id: { in: createdTemplateIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

describe('templates de mensagem', () => {
  it('cria em rascunho e, ao enviar para aprovação sem credenciais da Meta configuradas, aprova localmente (modo demo)', async () => {
    const service = new ApiService();
    const name = `template_teste_${randomUUID().replace(/-/g, '_')}`;
    const created = await service.createTemplate({ name, bodyText: 'Olá {{1}}, temos uma oportunidade para {{2}}!', variables: ['nome_empresa', 'cidade'] });
    createdTemplateIds.push(created.id);
    expect(created.status).toBe('DRAFT');

    const submitted = await service.submitTemplate(created.id);
    expect(submitted.status).toBe('APPROVED');
    expect(submitted.providerTemplateId).toMatch(/^demo:/);
    expect(submitted.approvedAt).toBeTruthy();

    await expect(service.submitTemplate(created.id)).rejects.toThrow();
  });

  it('impede editar um template que já saiu do rascunho', async () => {
    const service = new ApiService();
    const name = `template_edit_${randomUUID().replace(/-/g, '_')}`;
    const created = await service.createTemplate({ name, bodyText: 'Corpo sem variáveis, apenas texto fixo' });
    createdTemplateIds.push(created.id);
    await service.submitTemplate(created.id);
    await expect(service.updateTemplate(created.id, { bodyText: 'Corpo alterado sem variáveis também' })).rejects.toThrow();
  });

  it('campanha exige um template existente e aprovado', async () => {
    const service = new ApiService();
    const draftName = `template_draft_${randomUUID().replace(/-/g, '_')}`;
    const draft = await service.createTemplate({ name: draftName, bodyText: 'Corpo de rascunho sem variáveis' });
    createdTemplateIds.push(draft.id);

    await expect(service.createCampaign({ name: 'Campanha sem template', filters: {} })).rejects.toThrow();
    await expect(service.createCampaign({ name: 'Campanha com rascunho', templateId: draft.id, filters: {} })).rejects.toThrow();

    const approved = await service.submitTemplate(draft.id);
    const campaign = await service.createCampaign({ name: 'Campanha aprovada', templateId: approved.id, filters: {} });
    createdCampaignIds.push(campaign.id);
    expect(campaign).toMatchObject({ templateId: approved.id, messageTemplate: approved.bodyText });
  });

  it('impede remover um template em uso por campanhas', async () => {
    const service = new ApiService();
    const name = `template_uso_${randomUUID().replace(/-/g, '_')}`;
    const template = await service.createTemplate({ name, bodyText: 'Corpo fixo sem variáveis para teste' });
    createdTemplateIds.push(template.id);
    const approved = await service.submitTemplate(template.id);
    const campaign = await service.createCampaign({ name: 'Campanha bloqueando exclusão', templateId: approved.id, filters: {} });
    createdCampaignIds.push(campaign.id);

    await expect(service.deleteTemplate(template.id)).rejects.toThrow();
  });
});
