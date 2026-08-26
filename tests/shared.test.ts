import {describe,expect,it} from 'vitest';
import {calculateLeadScore,heartbeatStatus,normalizePhone,normalizeText,parseAutopilotConfig,phoneType,resolveTemplateVariable,scoreClassFor,shouldDispatchAutopilot,startOfLocalDay,startOfLocalMonth,templatePlaceholders,templateVariablesMatchBody} from '../packages/shared/src';
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
  it('scoreClassFor usa os mesmos limiares de calculateLeadScore',()=>{
    expect(scoreClassFor(0)).toBe('LOW');
    expect(scoreClassFor(29)).toBe('LOW');
    expect(scoreClassFor(30)).toBe('MEDIUM');
    expect(scoreClassFor(59)).toBe('MEDIUM');
    expect(scoreClassFor(60)).toBe('HIGH');
    expect(scoreClassFor(79)).toBe('HIGH');
    expect(scoreClassFor(80)).toBe('VERY_HIGH');
    expect(scoreClassFor(100)).toBe('VERY_HIGH');
  });
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

describe('templates de mensagem', () => {
  it('extrai os placeholders numerados do corpo, sem duplicar e em ordem', () => {
    expect(templatePlaceholders('Olá {{1}}, tudo bem em {{2}}?')).toEqual([1, 2]);
    expect(templatePlaceholders('{{2}} depois {{1}} e {{1}} de novo')).toEqual([1, 2]);
    expect(templatePlaceholders('Sem variáveis aqui')).toEqual([]);
  });

  it('valida que as variáveis declaradas batem exatamente com os placeholders do corpo', () => {
    expect(templateVariablesMatchBody('Olá {{1}}!', ['nome_empresa'])).toBe(true);
    expect(templateVariablesMatchBody('Olá {{1}}, de {{2}}!', ['nome_empresa', 'cidade'])).toBe(true);
    expect(templateVariablesMatchBody('Sem variáveis', [])).toBe(true);
    expect(templateVariablesMatchBody('Olá {{1}}!', [])).toBe(false);
    expect(templateVariablesMatchBody('Olá!', ['nome_empresa'])).toBe(false);
    expect(templateVariablesMatchBody('Olá {{2}}!', ['nome_empresa'])).toBe(false);
  });

  it('resolve variáveis conhecidas a partir dos dados da empresa e ignora desconhecidas', () => {
    const business = { name: 'Padaria Boa Vista', city: 'Caldas Novas', category: 'Padarias' };
    expect(resolveTemplateVariable('nome_empresa', business)).toBe('Padaria Boa Vista');
    expect(resolveTemplateVariable('cidade', business)).toBe('Caldas Novas');
    expect(resolveTemplateVariable('categoria', business)).toBe('Padarias');
    expect(resolveTemplateVariable('desconhecida', business)).toBe('');
  });
});
