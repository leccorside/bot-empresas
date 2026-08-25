import { describe, expect, it, vi } from 'vitest';
import { ensureProspectingJob } from '../packages/queues/src';

describe('retomada de jobs de prospecção', () => {
  it('recoloca um job falho na fila sem criar duplicata', async () => {
    const job = { getState: vi.fn().mockResolvedValue('failed'), retry: vi.fn(), remove: vi.fn() };
    const queue = { getJob: vi.fn().mockResolvedValue(job), add: vi.fn() };
    await expect(ensureProspectingJob(queue as any, 'run-1')).resolves.toBe(job);
    expect(job.retry).toHaveBeenCalledOnce();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('substitui um job concluído quando a execução precisa ser retomada', async () => {
    const completed = { getState: vi.fn().mockResolvedValue('completed'), retry: vi.fn(), remove: vi.fn() };
    const replacement = { id: 'prospecting-run-2' };
    const queue = { getJob: vi.fn().mockResolvedValue(completed), add: vi.fn().mockResolvedValue(replacement) };
    await expect(ensureProspectingJob(queue as any, 'run-2')).resolves.toBe(replacement);
    expect(completed.remove).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith('prospect-run', { runId: 'run-2' }, { jobId: 'prospecting-run-2' });
  });

  it('mantém um job que já está aguardando ou executando', async () => {
    const job = { getState: vi.fn().mockResolvedValue('waiting'), retry: vi.fn(), remove: vi.fn() };
    const queue = { getJob: vi.fn().mockResolvedValue(job), add: vi.fn() };
    await expect(ensureProspectingJob(queue as any, 'run-3')).resolves.toBe(job);
    expect(job.retry).not.toHaveBeenCalled();
    expect(job.remove).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
