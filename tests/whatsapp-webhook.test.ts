import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { detectOptOutIntent, verifyWhatsAppWebhookSignature } from '../packages/integrations/src';

describe('verifyWhatsAppWebhookSignature', () => {
  const body = Buffer.from(JSON.stringify({ entry: [] }));
  const secret = 'test-app-secret';
  const sign = (payload: Buffer, key = secret) => `sha256=${createHmac('sha256', key).update(payload).digest('hex')}`;

  it('sem app secret configurado, aceita qualquer requisição (modo local/demo)', () => {
    expect(verifyWhatsAppWebhookSignature(body, undefined, undefined)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(body, 'sha256=lixo', undefined)).toBe(true);
  });

  it('com app secret configurado, aceita apenas a assinatura correta', () => {
    expect(verifyWhatsAppWebhookSignature(body, sign(body), secret)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(body, sign(body, 'chave-errada'), secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, 'assinatura-sem-prefixo', secret)).toBe(false);
  });

  it('rejeita corpo alterado mesmo com assinatura de outro payload válida', () => {
    const tampered = Buffer.from(JSON.stringify({ entry: [{ tampered: true }] }));
    expect(verifyWhatsAppWebhookSignature(tampered, sign(body), secret)).toBe(false);
  });
});

describe('detectOptOutIntent', () => {
  it('reconhece pedidos de opt-out em português, com e sem acentos/maiúsculas', () => {
    expect(detectOptOutIntent('Pode parar de enviar mensagens')).toBe(true);
    expect(detectOptOutIntent('NÃO QUERO mais receber')).toBe(true);
    expect(detectOptOutIntent('me remova da lista, por favor')).toBe(true);
    expect(detectOptOutIntent('STOP')).toBe(true);
  });

  it('não confunde mensagens neutras ou de interesse com opt-out', () => {
    expect(detectOptOutIntent('Olá, tenho interesse! Podemos conversar amanhã?')).toBe(false);
    expect(detectOptOutIntent('Qual o valor do serviço?')).toBe(false);
    expect(detectOptOutIntent('')).toBe(false);
  });
});
