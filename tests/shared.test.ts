import {describe,expect,it} from 'vitest';
import {calculateLeadScore,normalizePhone,normalizeText,phoneType} from '../packages/shared/src';
describe('normalização e score',()=>{
  it('normaliza nomes para deduplicação',()=>expect(normalizeText('Clínica São José!')).toBe('clinica sao jose'));
  it('remove espaços e símbolos repetidos',()=>expect(normalizeText('  Alfa---Beta & Cia.  ')).toBe('alfa beta cia'));
  it('normaliza telefone brasileiro em E.164',()=>expect(normalizePhone('(64) 99999-1234')).toBe('+5564999991234'));
  it('retorna null para telefone impossível',()=>expect(normalizePhone('123')).toBeNull());
  it('retorna null quando telefone não foi informado',()=>expect(normalizePhone()).toBeNull());
  it('classifica celular sem assumir WhatsApp',()=>expect(phoneType('+5564999991234')).toBe('MOBILE'));
  it('classifica telefone fixo',()=>expect(phoneType('+556434111234')).toBe('LANDLINE'));
  it('mantém tipo desconhecido para formato inválido',()=>expect(phoneType('123')).toBe('UNKNOWN'));
  it('limita score a 100',()=>expect(calculateLeadScore({reviewsCount:0,whatsapp:true,phone:'x'}).score).toBe(95));
  it('classifica oportunidade alta',()=>expect(calculateLeadScore({reviewsCount:0,phone:'x'}).scoreClass).toBe('HIGH'));
  it('pontua ausência de site e avaliações',()=>expect(calculateLeadScore({reviewsCount:0})).toEqual({score:65,scoreClass:'HIGH'}));
  it('pontua site ruim, lento e sem HTTPS',()=>expect(calculateLeadScore({website:'http://example.test',siteStatus:'POOR',reviewsCount:50,siteResponseMs:4000,hasHttps:false})).toEqual({score:50,scoreClass:'MEDIUM'}));
  it('não penaliza site saudável com muitas avaliações',()=>expect(calculateLeadScore({website:'https://example.test',siteStatus:'GOOD',reviewsCount:150,siteResponseMs:500,hasHttps:true})).toEqual({score:0,scoreClass:'LOW'}));
});
