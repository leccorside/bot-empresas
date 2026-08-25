import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { directorySize, mergeQueueCounts, normalizeQueueCounts } from '../apps/api/src/operations';

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
});
