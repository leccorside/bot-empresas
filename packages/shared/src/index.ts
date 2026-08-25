import pino from 'pino';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const logger = (service: string) => pino({ level: process.env.LOG_LEVEL ?? 'info', base: { service } });
export const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value, 'BR');
  return parsed?.isPossible() ? parsed.number : null;
}
export function phoneType(value?: string | null): 'MOBILE' | 'LANDLINE' | 'UNKNOWN' {
  const digits = value?.replace(/\D/g, '') ?? '';
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  return local.length === 11 && local[2] === '9' ? 'MOBILE' : local.length === 10 ? 'LANDLINE' : 'UNKNOWN';
}
export type LeadScoreInput = { website?: string | null; siteStatus?: string; reviewsCount?: number | null; whatsapp?: boolean; phone?: string | null; siteResponseMs?: number | null; hasHttps?: boolean | null };
export function calculateLeadScore(input: LeadScoreInput) {
  let raw = 0;
  if (!input.website) raw += 40; else if (input.siteStatus === 'POOR') raw += 25;
  if ((input.reviewsCount ?? 0) === 0) raw += 25; else if ((input.reviewsCount ?? 0) <= 10) raw += 15;
  if (input.whatsapp) raw += 20;
  if (input.phone) raw += 10;
  if ((input.siteResponseMs ?? 0) > 3000) raw += 15;
  if (input.website && input.hasHttps === false) raw += 10;
  const score = Math.min(100, raw);
  const scoreClass = score >= 80 ? 'VERY_HIGH' : score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
  return { score, scoreClass } as const;
}
export const terminalRunStates = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;

export function heartbeatStatus(value: unknown, maxAgeMs: number, now = new Date()): 'ONLINE' | 'OFFLINE' {
  if (!value || typeof value !== 'object') return 'OFFLINE';
  const heartbeatAt = (value as { heartbeatAt?: unknown }).heartbeatAt;
  const declaredStatus = (value as { status?: unknown }).status;
  if (declaredStatus !== 'ONLINE' || typeof heartbeatAt !== 'string') return 'OFFLINE';
  const timestamp = Date.parse(heartbeatAt);
  if (!Number.isFinite(timestamp)) return 'OFFLINE';
  const age = now.getTime() - timestamp;
  return age >= -maxAgeMs && age <= maxAgeMs ? 'ONLINE' : 'OFFLINE';
}
