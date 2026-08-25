import { terminalRunStates } from '@prospector/shared';
import { nextScheduleOccurrence } from '@prospector/shared';

export const nextOccurrence = nextScheduleOccurrence;

export function heartbeatCutoff(now: Date, timeoutSeconds: number) {
  return new Date(now.getTime() - timeoutSeconds * 1000);
}

export function shouldRemoveQueuedJob(runStatus?: string) {
  return !runStatus || terminalRunStates.includes(runStatus as typeof terminalRunStates[number]);
}
