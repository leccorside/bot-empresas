import { readFile, readdir, stat } from 'fs/promises';
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

export async function verifiedBackupHealth(directory: string, maxAgeHours = 26, now = Date.now()) {
  try {
    const marker = path.join(directory, '.last_verified');
    const [raw, markerStat] = await Promise.all([readFile(marker, 'utf8'), stat(marker)]);
    const archive = raw.trim().split('|').slice(1).join('|');
    const archiveStat = await stat(archive);
    const ageSeconds = Math.max(0, Math.floor((now - markerStat.mtimeMs) / 1000));
    const fresh = ageSeconds <= Math.max(1, maxAgeHours) * 3600;
    return { status: fresh && archiveStat.size > 0 ? 'ONLINE' : 'DEGRADED', archive: path.basename(archive), sizeBytes: archiveStat.size, ageSeconds, verifiedAt: markerStat.mtime.toISOString() };
  } catch { return { status: 'OFFLINE', archive: null, sizeBytes: 0, ageSeconds: null, verifiedAt: null }; }
}

export type CoverageCell = { status: string; resultsFound: number };
export function geographicCoverage(cells: CoverageCell[], maxPages = 3, pageSize = 20) {
  const total = cells.length;
  const count = (status: string) => cells.filter(cell => cell.status === status).length;
  const results = cells.reduce((sum, cell) => sum + Number(cell.resultsFound || 0), 0);
  const completed = count('COMPLETED');
  const saturationThreshold = Math.max(1, maxPages) * Math.max(1, pageSize);
  return {
    total,
    completed,
    pending: count('PENDING') + count('QUEUED'),
    running: count('RUNNING'),
    failed: count('FAILED'),
    empty: cells.filter(cell => cell.status === 'COMPLETED' && cell.resultsFound === 0).length,
    saturated: cells.filter(cell => cell.resultsFound >= saturationThreshold).length,
    results,
    averageResultsPerCell: total ? Math.round(results / total * 10) / 10 : 0,
    percent: total ? Math.round(completed / total * 1000) / 10 : 0,
  };
}
