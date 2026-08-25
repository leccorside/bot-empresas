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

describe('analytics', () => {
  it('agrega crescimento, distribuição de score, funil CRM, status de site e telefones por WhatsApp', async () => {
    const service = new ApiService();
    const before = await service.analytics(30);

    const suffix = randomUUID();
    const idA = `test-analytics-a-${suffix}`, idB = `test-analytics-b-${suffix}`;
    createdBusinessIds.push(idA, idB);
    const digits = suffix.replace(/\D/g, '').slice(0, 8) || '12345678';
    await prisma.business.create({ data: { id: idA, provider: 'TEST', providerId: `analytics-a-${suffix}`, name: 'Analytics A', normalizedName: 'analytics a', category: 'Teste Analytics', city: 'Cidade Analytics', state: 'GO', scoreClass: 'HIGH', leadScore: 70, leadStatus: 'QUALIFIED', siteStatus: 'GOOD', firstSeenAt: new Date(), phones: { create: { phone: `+5562${digits}0`, normalizedPhone: `+5562${digits}0`, whatsappStatus: 'AVAILABLE' } } } });
    await prisma.business.create({ data: { id: idB, provider: 'TEST', providerId: `analytics-b-${suffix}`, name: 'Analytics B', normalizedName: 'analytics b', category: 'Teste Analytics', city: 'Cidade Analytics', state: 'GO', scoreClass: 'HIGH', leadScore: 75, leadStatus: 'QUALIFIED', siteStatus: 'GOOD', firstSeenAt: new Date(), phones: { create: { phone: `+5562${digits}1`, normalizedPhone: `+5562${digits}1`, whatsappStatus: 'AVAILABLE' } } } });

    const after = await service.analytics(30);

    expect(after.totalBusinesses - before.totalBusinesses).toBe(2);
    expect((after.scoreDistribution.HIGH ?? 0) - (before.scoreDistribution.HIGH ?? 0)).toBe(2);
    expect((after.leadFunnel.QUALIFIED ?? 0) - (before.leadFunnel.QUALIFIED ?? 0)).toBe(2);
    expect((after.websiteStatus.GOOD ?? 0) - (before.websiteStatus.GOOD ?? 0)).toBe(2);
    expect((after.whatsappStatus.AVAILABLE ?? 0) - (before.whatsappStatus.AVAILABLE ?? 0)).toBe(2);

    const today = new Date().toISOString().slice(0, 10);
    const growthBefore = before.growth.find((g: any) => g.date === today)?.count ?? 0;
    const growthAfter = after.growth.find((g: any) => g.date === today)?.count ?? 0;
    expect(growthAfter - growthBefore).toBe(2);

    expect(Array.isArray(after.byCategory)).toBe(true);
    expect(Array.isArray(after.byCity)).toBe(true);
  });

  it('respeita e limita a janela de dias', async () => {
    const service = new ApiService();
    expect((await service.analytics(3)).days).toBe(7);
    expect((await service.analytics(400)).days).toBe(180);
    expect((await service.analytics(undefined)).days).toBe(30);
  });
});
