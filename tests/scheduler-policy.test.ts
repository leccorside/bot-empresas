import { describe, expect, it } from 'vitest';
import { heartbeatCutoff, nextOccurrence, shouldRemoveQueuedJob } from '../apps/scheduler/src/policy';
import { validateCronExpression, validateTimezone } from '../packages/shared/src';

describe('política de agendamento', () => {
  const base = new Date('2026-08-25T12:00:00.000Z');

  it('não agenda nova ocorrência para execução única', () => {
    expect(nextOccurrence('ONCE', base)).toBeNull();
  });

  it('calcula recorrências diária, semanal e mensal', () => {
    expect(nextOccurrence('DAILY', base)?.toISOString()).toBe('2026-08-26T12:00:00.000Z');
    expect(nextOccurrence('WEEKLY', base)?.toISOString()).toBe('2026-09-01T12:00:00.000Z');
    expect(nextOccurrence('MONTHLY', base)?.toISOString()).toBe('2026-09-25T12:00:00.000Z');
  });

  it('calcula CRON e dias específicos no fuso configurado', () => {
    expect(nextOccurrence('CRON', base, '0 10 * * *', 'America/Sao_Paulo')?.toISOString()).toBe('2026-08-25T13:00:00.000Z');
    expect(nextOccurrence('SPECIFIC_DAYS', base, '0 10 * * 2,4', 'America/Sao_Paulo')?.toISOString()).toBe('2026-08-25T13:00:00.000Z');
  });

  it('preserva o horário local ao atravessar o horário de verão', () => {
    const beforeDst = new Date('2026-03-07T14:00:00.000Z');
    expect(nextOccurrence('DAILY', beforeDst, null, 'America/New_York')?.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('valida fuso horário e expressão CRON', () => {
    expect(validateTimezone('America/Sao_Paulo')).toBe(true);
    expect(validateTimezone('Fuso/Inexistente')).toBe(false);
    expect(validateCronExpression('0 9 * * 1-5')).toBe(true);
    expect(validateCronExpression('cron inválido')).toBe(false);
  });
});

describe('política de recovery e reconciliação', () => {
  it('calcula o limite de heartbeat em segundos', () => {
    expect(heartbeatCutoff(new Date('2026-08-25T12:00:00.000Z'), 120).toISOString()).toBe('2026-08-25T11:58:00.000Z');
  });

  it.each(['COMPLETED', 'FAILED', 'CANCELLED'])('remove job órfão quando run está %s', status => {
    expect(shouldRemoveQueuedJob(status)).toBe(true);
  });

  it('remove job sem run persistido', () => {
    expect(shouldRemoveQueuedJob()).toBe(true);
  });

  it.each(['PENDING', 'QUEUED', 'RUNNING', 'RECOVERING'])('preserva job de run %s', status => {
    expect(shouldRemoveQueuedJob(status)).toBe(false);
  });
});
