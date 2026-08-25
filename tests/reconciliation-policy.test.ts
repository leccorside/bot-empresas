import { describe, expect, it } from 'vitest';
import { campaignJobId, campaignRecoveryDelay, prospectingJobId, shouldRecoverCampaign, syncQueuePauseState } from '../apps/scheduler/src/reconciliation';

describe('política de reconstrução após perda do Redis', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('gera IDs determinísticos para impedir jobs duplicados', () => {
    expect(prospectingJobId('run-1')).toBe('prospecting-run-1');
    expect(campaignJobId('campaign-1')).toBe('campaign-campaign-1');
  });

  it('preserva o delay de campanhas futuras e libera as vencidas', () => {
    expect(campaignRecoveryDelay(new Date('2026-08-25T12:05:00.000Z'), now)).toBe(300_000);
    expect(campaignRecoveryDelay(new Date('2026-08-25T11:55:00.000Z'), now)).toBe(0);
  });

  it('recupera campanhas agendadas e apenas execuções running obsoletas', () => {
    expect(shouldRecoverCampaign('SCHEDULED', now, now)).toBe(true);
    expect(shouldRecoverCampaign('RUNNING', new Date('2026-08-25T11:57:59.000Z'), now, 120)).toBe(true);
    expect(shouldRecoverCampaign('RUNNING', new Date('2026-08-25T11:59:00.000Z'), now, 120)).toBe(false);
    expect(shouldRecoverCampaign('COMPLETED', new Date('2026-08-25T11:00:00.000Z'), now)).toBe(false);
  });

  it('restaura nas filas o estado de pausa persistido no PostgreSQL', async () => {
    const calls: string[] = [];
    const queue = { pause: async () => { calls.push('pause'); }, resume: async () => { calls.push('resume'); } };
    await syncQueuePauseState([queue], true);
    await syncQueuePauseState([queue], false);
    expect(calls).toEqual(['pause', 'resume']);
  });
});
