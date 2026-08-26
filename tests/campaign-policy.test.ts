import { describe, expect, it } from 'vitest';
import { campaignDispatchDecision, parseCampaignDispatchPolicy } from '../packages/shared/src';

describe('política de disparo de campanhas', () => {
  const policy = { messagesPerHour: 10, messagesPerDay: 50, allowedStartHour: 8, allowedEndHour: 18, timezone: 'America/Sao_Paulo' };

  it('permite disparo dentro da janela e abaixo dos limites', () => {
    const result = campaignDispatchDecision({ now: new Date('2026-08-26T15:00:00Z'), sentLastHour: 9, sentToday: 49, policy });
    expect(result).toEqual({ allowed: true });
  });

  it('adia fora do horário permitido', () => {
    const result = campaignDispatchDecision({ now: new Date('2026-08-26T02:00:00Z'), sentLastHour: 0, sentToday: 0, policy });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('outside_allowed_hours');
  });

  it('adia ao atingir limites por hora ou por dia', () => {
    const now = new Date('2026-08-26T15:00:00Z');
    const hourly = campaignDispatchDecision({ now, sentLastHour: 10, sentToday: 10, policy });
    const daily = campaignDispatchDecision({ now, sentLastHour: 1, sentToday: 50, policy });
    expect(!hourly.allowed && hourly.reason).toBe('hourly_limit');
    expect(!daily.allowed && daily.reason).toBe('daily_limit');
  });

  it('usa defaults seguros quando a configuração é inválida', () => {
    expect(parseCampaignDispatchPolicy({ NODE_ENV: 'test', CAMPAIGN_MESSAGES_PER_HOUR: '0', CAMPAIGN_ALLOWED_START_HOUR: '99' } as NodeJS.ProcessEnv)).toMatchObject({ messagesPerHour: 100, messagesPerDay: 500, allowedStartHour: 8, allowedEndHour: 18 });
  });
});
