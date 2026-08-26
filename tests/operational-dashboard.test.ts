import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { directorySize, geographicCoverage, mergeQueueCounts, normalizeQueueCounts, verifiedBackupHealth } from '../apps/api/src/operations';

describe('métricas do dashboard operacional', () => {
  it('normaliza e soma filas sem propagar valores ausentes', () => {
    const prospecting = normalizeQueueCounts({ waiting: 2, active: 1 });
    const campaign = normalizeQueueCounts({ failed: 3, delayed: 4 });
    expect(mergeQueueCounts(prospecting, campaign)).toEqual({ waiting: 2, active: 1, failed: 3, delayed: 4, paused: 0 });
  });

  it('calcula recursivamente o espaço utilizado em disco', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-size-'));
    try {
      await mkdir(path.join(root, 'nested'));
      await writeFile(path.join(root, 'one.bin'), Buffer.alloc(10));
      await writeFile(path.join(root, 'nested', 'two.bin'), Buffer.alloc(25));
      expect(await directorySize(root)).toBe(35);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('retorna zero para diretório ainda não criado', async () => {
    expect(await directorySize(path.join(os.tmpdir(), `missing-${Date.now()}`))).toBe(0);
  });

  it('resume a cobertura, vazios e saturação do grid', () => {
    expect(geographicCoverage([{ status: 'COMPLETED', resultsFound: 0 }, { status: 'COMPLETED', resultsFound: 60 }, { status: 'FAILED', resultsFound: 4 }, { status: 'RUNNING', resultsFound: 2 }])).toEqual({ total: 4, completed: 2, pending: 0, running: 1, failed: 1, empty: 1, saturated: 1, results: 66, averageResultsPerCell: 16.5, percent: 50 });
  });

  it('considera saudável somente um backup verificado, existente e recente', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'backup-health-'));
    try {
      const archive = path.join(root, 'prospector.sql.gz');
      await writeFile(archive, Buffer.alloc(42));
      await writeFile(path.join(root, '.last_verified'), `2026-08-26T12:00:00Z|${archive}\n`);
      expect(await verifiedBackupHealth(root, 26)).toMatchObject({ status: 'ONLINE', archive: 'prospector.sql.gz', sizeBytes: 42 });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
