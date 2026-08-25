import pino from 'pino';
import { Writable } from 'node:stream';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { CronExpressionParser } from 'cron-parser';

const weekdayNumbers: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour12: false, month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { day: Number(value('day')), hour: Number(value('hour')) % 24, minute: Number(value('minute')), weekday: weekdayNumbers[value('weekday')] };
}

export function validateTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); return true; } catch { return false; }
}

export function validateCronExpression(expression: string, timezone = 'America/Sao_Paulo') {
  try { CronExpressionParser.parse(expression, { currentDate: new Date(), tz: timezone }).next(); return true; } catch { return false; }
}

export function nextScheduleOccurrence(type: string, from: Date, cronExpression?: string | null, timezone = 'America/Sao_Paulo', anchor = from): Date | null {
  if (type === 'ONCE') return null;
  if (!validateTimezone(timezone)) throw new Error(`Timezone inválido: ${timezone}`);
  let expression = cronExpression?.trim();
  if (!['CRON', 'SPECIFIC_DAYS'].includes(type)) {
    const parts = zonedParts(anchor, timezone);
    if (type === 'DAILY') expression = `${parts.minute} ${parts.hour} * * *`;
    else if (type === 'WEEKLY') expression = `${parts.minute} ${parts.hour} * * ${parts.weekday}`;
    else if (type === 'MONTHLY') expression = `${parts.minute} ${parts.hour} ${parts.day} * *`;
    else throw new Error(`Tipo de agendamento inválido: ${type}`);
  }
  if (!expression) throw new Error('Expressão CRON obrigatória');
  return CronExpressionParser.parse(expression, { currentDate: from, tz: timezone }).next().toDate();
}

const logFiles: Record<string, string> = {
  api: 'api.log', worker: 'worker.log', scheduler: 'scheduler.log', recovery: 'recovery.log', whatsapp: 'whatsapp.log'
};

export class RotatingFileStream extends Writable {
  public readonly filename: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;

  constructor(
    filename: string,
    maxBytes = Number(process.env.LOG_MAX_BYTES ?? 10 * 1024 * 1024),
    maxFiles = Number(process.env.LOG_MAX_FILES ?? 5)
  ) {
    super();
    this.filename = filename;
    this.maxBytes = maxBytes;
    this.maxFiles = maxFiles;
    mkdirSync(dirname(filename), { recursive: true });
    closeSync(openSync(filename, 'a'));
  }

  private rotate(incomingBytes: number) {
    const currentBytes = existsSync(this.filename) ? statSync(this.filename).size : 0;
    if (currentBytes === 0 || currentBytes + incomingBytes <= Math.max(1, this.maxBytes)) return;
    const files = Math.max(1, this.maxFiles);
    const oldest = `${this.filename}.${files}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let index = files - 1; index >= 1; index--) {
      const source = `${this.filename}.${index}`;
      if (existsSync(source)) renameSync(source, `${this.filename}.${index + 1}`);
    }
    if (existsSync(this.filename)) renameSync(this.filename, `${this.filename}.1`);
    closeSync(openSync(this.filename, 'a'));
  }

  override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      this.rotate(data.byteLength);
      appendFileSync(this.filename, data);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

export type LoggerOptions = { directory?: string; maxBytes?: number; maxFiles?: number; stdout?: boolean };

export function logger(service: string, options: LoggerOptions = {}) {
  const directory = options.directory ?? process.env.LOG_DIR ?? '/storage/logs';
  const maxBytes = options.maxBytes ?? Number(process.env.LOG_MAX_BYTES ?? 10 * 1024 * 1024);
  const maxFiles = options.maxFiles ?? Number(process.env.LOG_MAX_FILES ?? 5);
  const safeService = service.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const streams: pino.StreamEntry[] = [];
  if (options.stdout !== false) streams.push({ level: 'trace', stream: process.stdout });
  streams.push({ level: 'trace', stream: new RotatingFileStream(join(directory, logFiles[safeService] ?? `${safeService}.log`), maxBytes, maxFiles) });
  streams.push({ level: 'error', stream: new RotatingFileStream(join(directory, 'errors.log'), maxBytes, maxFiles) });
  return pino(
    { level: process.env.LOG_LEVEL ?? 'info', base: { service } },
    pino.multistream(streams, { dedupe: false })
  );
}
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
