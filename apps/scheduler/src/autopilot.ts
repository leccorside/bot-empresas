import { prisma } from '@prospector/database';
import { enqueueRun } from '@prospector/queues';
import { AutopilotConfig, parseAutopilotConfig, shouldDispatchAutopilot, startOfLocalDay, startOfLocalMonth } from '@prospector/shared';

const activeStatuses = ['PENDING', 'QUEUED', 'RUNNING', 'RECOVERING'] as const;

export type DispatchAutopilotOptions = { enqueue?: typeof enqueueRun; automation?: { autopilot?: boolean; paused?: boolean }; config?: AutopilotConfig };

export async function dispatchAutopilot(now = new Date(), options: DispatchAutopilotOptions = {}) {
  const enqueue = options.enqueue ?? enqueueRun;
  const automation = options.automation ?? (await prisma.systemSetting.findUnique({ where: { key: 'automation' } }).then(row => (row?.value as any) ?? {}));
  if (!automation.autopilot || automation.paused) return { dispatched: false as const, reason: 'disabled' as const };
  const config = options.config ?? parseAutopilotConfig((await prisma.systemSetting.findUnique({ where: { key: 'autopilotConfig' } }))?.value);

  const [activeCount, dispatchedToday, dispatchedThisMonth, lastRun] = await Promise.all([
    prisma.prospectingRun.count({ where: { autopilotTargetId: { not: null }, status: { in: [...activeStatuses] } } }),
    prisma.prospectingRun.count({ where: { autopilotTargetId: { not: null }, createdAt: { gte: startOfLocalDay(now) } } }),
    prisma.prospectingRun.count({ where: { autopilotTargetId: { not: null }, createdAt: { gte: startOfLocalMonth(now) } } }),
    prisma.prospectingRun.findFirst({ where: { autopilotTargetId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  if (!shouldDispatchAutopilot({ activeCount, dispatchedToday, dispatchedThisMonth, lastDispatchedAt: lastRun?.createdAt ?? null, now, config })) {
    return { dispatched: false as const, reason: 'limit' as const };
  }

  const candidates = await prisma.autopilotTarget.findMany({ where: { enabled: true, runs: { none: { status: { in: [...activeStatuses] } } } }, orderBy: { createdAt: 'asc' } });
  const target = candidates.sort((a, b) => (a.lastDispatchedAt?.getTime() ?? 0) - (b.lastDispatchedAt?.getTime() ?? 0))[0];
  if (!target) return { dispatched: false as const, reason: 'no-target' as const };

  const idempotencyKey = `autopilot:${target.id}:${now.getTime()}`;
  const run = await prisma.$transaction(async tx => {
    const created = await tx.prospectingRun.create({ data: { autopilotTargetId: target.id, country: target.country, state: target.state, city: target.city, category: target.category, idempotencyKey, status: 'QUEUED', currentStage: 'QUEUED' } });
    await tx.jobRecord.create({ data: { queue: 'prospecting', name: 'prospect-run', runId: created.id, idempotencyKey: `prospecting:${created.id}`, payload: { runId: created.id } } });
    await tx.autopilotTarget.update({ where: { id: target.id }, data: { lastDispatchedAt: now } });
    return created;
  });
  await enqueue(run.id);
  return { dispatched: true as const, runId: run.id, targetId: target.id };
}
