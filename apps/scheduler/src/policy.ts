import { terminalRunStates } from '@prospector/shared';

export function nextOccurrence(type: string, from = new Date()) {
  const next = new Date(from);
  if (type === 'ONCE') return null;
  if (type === 'DAILY') next.setDate(next.getDate() + 1);
  else if (type === 'WEEKLY') next.setDate(next.getDate() + 7);
  else if (type === 'MONTHLY') next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

export function heartbeatCutoff(now: Date, timeoutSeconds: number) {
  return new Date(now.getTime() - timeoutSeconds * 1000);
}

export function shouldRemoveQueuedJob(runStatus?: string) {
  return !runStatus || terminalRunStates.includes(runStatus as typeof terminalRunStates[number]);
}
