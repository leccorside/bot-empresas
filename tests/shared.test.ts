import {describe,expect,it} from 'vitest';
import {calculateLeadScore,heartbeatStatus,normalizePhone,normalizeText,parseAutopilotConfig,phoneType,shouldDispatchAutopilot,startOfLocalDay,startOfLocalMonth} from '../packages/shared/src';
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
  it('penaliza performance PageSpeed abaixo de 50',()=>expect(calculateLeadScore({website:'https://example.test',siteStatus:'GOOD',reviewsCount:150,siteResponseMs:500,hasHttps:true,performanceScore:35})).toEqual({score:15,scoreClass:'LOW'}));
  it('não penaliza performance PageSpeed saudável',()=>expect(calculateLeadScore({website:'https://example.test',siteStatus:'GOOD',reviewsCount:150,siteResponseMs:500,hasHttps:true,performanceScore:80})).toEqual({score:0,scoreClass:'LOW'}));
});

describe('saúde por heartbeat',()=>{
  const now=new Date('2026-08-25T12:00:00.000Z');
  it('considera online um heartbeat recente',()=>expect(heartbeatStatus({status:'ONLINE',heartbeatAt:'2026-08-25T11:59:30.000Z'},45000,now)).toBe('ONLINE'));
  it('considera offline um heartbeat vencido',()=>expect(heartbeatStatus({status:'ONLINE',heartbeatAt:'2026-08-25T11:58:00.000Z'},45000,now)).toBe('OFFLINE'));
  it('considera offline dados ausentes ou inválidos',()=>{expect(heartbeatStatus(null,45000,now)).toBe('OFFLINE');expect(heartbeatStatus({status:'ONLINE',heartbeatAt:'inválido'},45000,now)).toBe('OFFLINE')});
});

describe('autopilot',()=>{
  it('usa valores padrão quando a configuração está ausente ou inválida',()=>expect(parseAutopilotConfig(undefined)).toEqual({maxConcurrentCities:1,delaySeconds:300,dailyLimit:10,monthlyLimit:200}));
  it('descarta valores zerados, negativos ou não numéricos, mantendo o padrão',()=>expect(parseAutopilotConfig({maxConcurrentCities:0,delaySeconds:-5,dailyLimit:'abc',monthlyLimit:50})).toEqual({maxConcurrentCities:1,delaySeconds:300,dailyLimit:10,monthlyLimit:50}));
  it('trunca valores fracionários',()=>expect(parseAutopilotConfig({maxConcurrentCities:2.9})).toMatchObject({maxConcurrentCities:2}));

  const config={maxConcurrentCities:2,delaySeconds:60,dailyLimit:5,monthlyLimit:50};
  const now=new Date('2026-08-25T12:00:00.000Z');
  it('permite despachar quando nenhum limite foi atingido',()=>expect(shouldDispatchAutopilot({activeCount:0,dispatchedToday:0,dispatchedThisMonth:0,lastDispatchedAt:null,now,config})).toBe(true));
  it('bloqueia ao atingir o máximo de cidades simultâneas',()=>expect(shouldDispatchAutopilot({activeCount:2,dispatchedToday:0,dispatchedThisMonth:0,lastDispatchedAt:null,now,config})).toBe(false));
  it('bloqueia ao atingir o limite diário',()=>expect(shouldDispatchAutopilot({activeCount:0,dispatchedToday:5,dispatchedThisMonth:0,lastDispatchedAt:null,now,config})).toBe(false));
  it('bloqueia ao atingir o limite mensal',()=>expect(shouldDispatchAutopilot({activeCount:0,dispatchedToday:0,dispatchedThisMonth:50,lastDispatchedAt:null,now,config})).toBe(false));
  it('bloqueia dentro da janela de delay entre disparos',()=>expect(shouldDispatchAutopilot({activeCount:0,dispatchedToday:0,dispatchedThisMonth:0,lastDispatchedAt:new Date('2026-08-25T11:59:30.000Z'),now,config})).toBe(false));
  it('libera após o delay entre disparos ter passado',()=>expect(shouldDispatchAutopilot({activeCount:0,dispatchedToday:0,dispatchedThisMonth:0,lastDispatchedAt:new Date('2026-08-25T11:58:00.000Z'),now,config})).toBe(true));

  it('calcula o início do dia e do mês locais',()=>{
    const reference=new Date('2026-08-25T15:42:10.000Z');
    expect(startOfLocalDay(reference).getHours()).toBe(0);
    expect(startOfLocalDay(reference).getDate()).toBe(reference.getDate());
    expect(startOfLocalMonth(reference).getDate()).toBe(1);
    expect(startOfLocalMonth(reference).getHours()).toBe(0);
  });
});
