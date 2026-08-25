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
});
