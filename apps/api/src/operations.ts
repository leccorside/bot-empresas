import { readdir, stat } from 'fs/promises';
import path from 'path';

export type OperationalQueueCounts = { waiting: number; active: number; failed: number; delayed: number; paused: number };
export const emptyQueueCounts = (): OperationalQueueCounts => ({ waiting: 0, active: 0, failed: 0, delayed: 0, paused: 0 });

export function normalizeQueueCounts(value: Partial<Record<keyof OperationalQueueCounts, number>>): OperationalQueueCounts {
  return { waiting: Number(value.waiting ?? 0), active: Number(value.active ?? 0), failed: Number(value.failed ?? 0), delayed: Number(value.delayed ?? 0), paused: Number(value.paused ?? 0) };
}

export function mergeQueueCounts(...values: OperationalQueueCounts[]) {
  return values.reduce((total, value) => ({ waiting: total.waiting + value.waiting, active: total.active + value.active, failed: total.failed + value.failed, delayed: total.delayed + value.delayed, paused: total.paused + value.paused }), emptyQueueCounts());
}

export async function directorySize(directory: string): Promise<number> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const sizes = await Promise.all(entries.map(async entry => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return directorySize(target);
      if (!entry.isFile()) return 0;
      return (await stat(target)).size;
    }));
    return sizes.reduce((total, size) => total + size, 0);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
}
