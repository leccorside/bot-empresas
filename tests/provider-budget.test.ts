import { describe, expect, it } from 'vitest';
import { providerBudgetDay } from '../packages/database/src';

describe('orçamento diário de provedores', () => {
  it('fecha o dia no fuso operacional em vez de UTC', () => {
    expect(providerBudgetDay(new Date('2026-08-27T01:30:00.000Z'), 'America/Sao_Paulo')).toBe('2026-08-26');
    expect(providerBudgetDay(new Date('2026-08-27T03:30:00.000Z'), 'America/Sao_Paulo')).toBe('2026-08-27');
  });
});
