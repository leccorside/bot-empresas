import { describe, expect, it } from 'vitest';
import { businessFilterSchema, createRunSchema, createScheduleSchema } from '../packages/validation/src';

describe('validação de prospecções', () => {
  it('aplica defaults seguros à execução manual', () => {
    expect(createRunSchema.parse({ state: 'Goiás', city: 'Caldas Novas' })).toEqual({
      country: 'Brasil', state: 'Goiás', city: 'Caldas Novas', category: 'Todos', mode: 'now',
    });
  });

  it('aceita inclusão explícita na fila', () => {
    expect(createRunSchema.parse({ state: 'GO', city: 'Goiânia', category: 'Hotéis', mode: 'queue' }).mode).toBe('queue');
  });

  it('rejeita cidade vazia', () => {
    expect(() => createRunSchema.parse({ state: 'GO', city: '' })).toThrow();
  });
});

describe('validação de agendamentos', () => {
  it('converte a próxima execução para Date', () => {
    const schedule = createScheduleSchema.parse({ name: 'Diário', state: 'GO', city: 'Goiânia', scheduleType: 'DAILY', nextRunAt: '2026-08-26T04:00:00-03:00' });
    expect(schedule.nextRunAt).toBeInstanceOf(Date);
    expect(schedule.enabled).toBe(true);
  });

  it('rejeita tipo de agendamento desconhecido', () => {
    expect(() => createScheduleSchema.parse({ name: 'Inválido', state: 'GO', city: 'Goiânia', scheduleType: 'HOURLY' })).toThrow();
  });
});

describe('validação dos filtros de empresas', () => {
  it('converte paginação e score recebidos por query string', () => {
    expect(businessFilterSchema.parse({ page: '2', pageSize: '50', minScore: '60' })).toMatchObject({ page: 2, pageSize: 50, minScore: 60 });
  });

  it('aplica paginação padrão', () => {
    expect(businessFilterSchema.parse({})).toMatchObject({ page: 1, pageSize: 25 });
  });

  it('rejeita score e pageSize fora dos limites', () => {
    expect(() => businessFilterSchema.parse({ minScore: '101' })).toThrow();
    expect(() => businessFilterSchema.parse({ pageSize: '201' })).toThrow();
  });

  it('converte filtros booleanos sem confundir false com true', () => {
    expect(businessFilterSchema.parse({ hasWebsite: 'false', hasPhone: 'true' })).toMatchObject({ hasWebsite: false, hasPhone: true });
  });

  it('aceita filtros de WhatsApp, rating, avaliações e score', () => {
    expect(businessFilterSchema.parse({ whatsappStatus: 'AVAILABLE', minRating: '3.5', maxRating: '5', minReviews: '10', maxReviews: '100', minScore: '40', maxScore: '80' })).toMatchObject({ whatsappStatus: 'AVAILABLE', minRating: 3.5, maxRating: 5, minReviews: 10, maxReviews: 100, minScore: 40, maxScore: 80 });
  });

  it('rejeita faixas invertidas', () => {
    expect(() => businessFilterSchema.parse({ minRating: '5', maxRating: '4' })).toThrow('Faixa de rating inválida');
    expect(() => businessFilterSchema.parse({ minReviews: '100', maxReviews: '10' })).toThrow('Faixa de avaliações inválida');
    expect(() => businessFilterSchema.parse({ minScore: '80', maxScore: '40' })).toThrow('Faixa de score inválida');
  });
});
