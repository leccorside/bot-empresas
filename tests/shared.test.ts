import {describe,expect,it} from 'vitest';
import {calculateLeadScore,normalizePhone,normalizeText,phoneType} from '../packages/shared/src';
describe('normalização e score',()=>{
  it('normaliza nomes para deduplicação',()=>expect(normalizeText('Clínica São José!')).toBe('clinica sao jose'));
  it('normaliza telefone brasileiro em E.164',()=>expect(normalizePhone('(64) 99999-1234')).toBe('+5564999991234'));
  it('classifica celular sem assumir WhatsApp',()=>expect(phoneType('+5564999991234')).toBe('MOBILE'));
  it('limita score a 100',()=>expect(calculateLeadScore({reviewsCount:0,whatsapp:true,phone:'x'}).score).toBe(95));
  it('classifica oportunidade alta',()=>expect(calculateLeadScore({reviewsCount:0,phone:'x'}).scoreClass).toBe('HIGH'));
});
