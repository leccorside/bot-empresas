import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../packages/database/src';
import { dispatchAutopilot } from '../apps/scheduler/src/autopilot';

const permissiveConfig = { maxConcurrentCities: 5, delaySeconds: 0, dailyLimit: 100, monthlyLimit: 1000 };
const createdTargetIds: string[] = [];
const createdRunIds: string[] = [];
const noopEnqueue = async (runId: string) => ({ id: `noop-${runId}` }) as any;

beforeAll(() => prisma.$connect());

afterEach(async () => {
  if (createdRunIds.length) await prisma.prospectingRun.deleteMany({ where: { id: { in: createdRunIds.splice(0) } } });
  if (createdTargetIds.length) await prisma.autopilotTarget.deleteMany({ where: { id: { in: createdTargetIds.splice(0) } } });
});

afterAll(() => prisma.$disconnect());

async function createTarget(overrides: Partial<{ enabled: boolean; state: string; city: string; category: string }> = {}) {
  const suffix = randomUUID();
  const target = await prisma.autopilotTarget.create({ data: { country: 'Brasil', state: 'GO', city: `Cidade Autopilot ${suffix}`, category: 'Teste', enabled: true, ...overrides } });
  createdTargetIds.push(target.id);
  return target;
}

describe('dispatchAutopilot', () => {
  it('não despacha quando o autopilot está desligado', async () => {
    const target = await createTarget();
    const result = await dispatchAutopilot(new Date(), { automation: { autopilot: false }, config: permissiveConfig, enqueue: noopEnqueue });
    expect(result).toEqual({ dispatched: false, reason: 'disabled' });
    await expect(prisma.prospectingRun.count({ where: { autopilotTargetId: target.id } })).resolves.toBe(0);
  });

  it('não despacha quando as automações estão pausadas', async () => {
    await createTarget();
    const result = await dispatchAutopilot(new Date(), { automation: { autopilot: true, paused: true }, config: permissiveConfig, enqueue: noopEnqueue });
    expect(result).toEqual({ dispatched: false, reason: 'disabled' });
  });

  it('despacha o alvo nunca executado e atualiza lastDispatchedAt', async () => {
    const target = await createTarget();
    const now = new Date();
    const result = await dispatchAutopilot(now, { automation: { autopilot: true, paused: false }, config: permissiveConfig, enqueue: noopEnqueue });
    expect(result).toMatchObject({ dispatched: true, targetId: target.id });
    if (!result.dispatched) throw new Error('esperava dispatched=true');
    createdRunIds.push(result.runId);
    const run = await prisma.prospectingRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run).toMatchObject({ autopilotTargetId: target.id, city: target.city, state: target.state, category: target.category, status: 'QUEUED' });
    const updatedTarget = await prisma.autopilotTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(updatedTarget.lastDispatchedAt?.getTime()).toBe(now.getTime());
  });

  it('não despacha novamente um alvo com execução ativa', async () => {
    const target = await createTarget();
    const run = await prisma.prospectingRun.create({ data: { autopilotTargetId: target.id, country: 'Brasil', state: target.state, city: target.city, category: target.category, status: 'RUNNING', idempotencyKey: `test-autopilot-active:${randomUUID()}` } });
    createdRunIds.push(run.id);
    const result = await dispatchAutopilot(new Date(), { automation: { autopilot: true, paused: false }, config: permissiveConfig, enqueue: noopEnqueue });
    expect(result).toEqual({ dispatched: false, reason: 'no-target' });
  });

  it('respeita o limite diário de disparos', async () => {
    const target = await createTarget();
    const run = await prisma.prospectingRun.create({ data: { autopilotTargetId: target.id, country: 'Brasil', state: target.state, city: target.city, category: target.category, status: 'COMPLETED', idempotencyKey: `test-autopilot-daily:${randomUUID()}` } });
    createdRunIds.push(run.id);
    const result = await dispatchAutopilot(new Date(), { automation: { autopilot: true, paused: false }, config: { ...permissiveConfig, dailyLimit: 1 }, enqueue: noopEnqueue });
    expect(result).toEqual({ dispatched: false, reason: 'limit' });
  });
});
