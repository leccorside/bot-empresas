import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { ApiService } from '../apps/api/src/service';

const createdBusinessIds: string[] = [];

beforeAll(() => prisma.$connect());

afterEach(async () => {
  if (createdBusinessIds.length) await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

describe('CRM — pipeline de leads', () => {
  it('filtra o pipeline por status e move um lead registrando o histórico', async () => {
    const service = new ApiService();
    const suffix = randomUUID();
    const id = `test-crm-${suffix}`, category = `Categoria CRM ${suffix}`;
    createdBusinessIds.push(id);
    await prisma.business.create({ data: { id, provider: 'TEST', providerId: `crm-${suffix}`, name: 'Lead CRM', normalizedName: 'lead crm', category, city: 'Cidade CRM', state: 'GO', normalizedPhone: `+5562${suffix.replace(/\D/g, '').slice(0, 8) || '12345678'}` } });

    const newColumn = await service.businesses({ leadStatus: 'NEW', category });
    expect(newColumn.items.map((item: any) => item.id)).toContain(id);
    const qualifiedColumnBefore = await service.businesses({ leadStatus: 'QUALIFIED', category });
    expect(qualifiedColumnBefore.items.map((item: any) => item.id)).not.toContain(id);

    await service.leadStatus(id, { status: 'QUALIFIED', note: 'primeiro contato feito' });

    const newColumnAfter = await service.businesses({ leadStatus: 'NEW', category });
    expect(newColumnAfter.items.map((item: any) => item.id)).not.toContain(id);
    const qualifiedColumnAfter = await service.businesses({ leadStatus: 'QUALIFIED', category });
    expect(qualifiedColumnAfter.items.map((item: any) => item.id)).toContain(id);

    const detail = await service.business(id);
    expect(detail.leadStatus).toBe('QUALIFIED');
    expect(detail.leadEvents).toMatchObject([{ fromStatus: 'NEW', toStatus: 'QUALIFIED', note: 'primeiro contato feito' }]);
  });

  it('marcar DO_NOT_CONTACT também suprime o telefone normalizado', async () => {
    const service = new ApiService();
    const suffix = randomUUID();
    const id = `test-crm-optout-${suffix}`;
    const normalizedPhone = `+5562${suffix.replace(/\D/g, '').slice(0, 8) || '87654321'}`;
    createdBusinessIds.push(id);
    await prisma.business.create({ data: { id, provider: 'TEST', providerId: `crm-optout-${suffix}`, name: 'Lead Opt-out', normalizedName: 'lead opt-out', category: 'Teste', city: 'Cidade CRM', state: 'GO', normalizedPhone } });

    await service.leadStatus(id, { status: 'DO_NOT_CONTACT', note: 'pediu para não contatar' });

    await expect(prisma.contactSuppression.findUnique({ where: { normalizedPhone } })).resolves.toMatchObject({ businessId: id, reason: 'pediu para não contatar' });
    await prisma.contactSuppression.deleteMany({ where: { normalizedPhone } });
  });
});
