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

export type GeographicBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};

export type GeographicGridCell = GeographicBounds & {
  sequence: number;
  latitude: number;
  longitude: number;
  radius: number;
};

const METERS_PER_LATITUDE_DEGREE = 111_320;
const coordinate = (value: number) => Number(value.toFixed(7));

export function validateGeographicBounds(bounds: GeographicBounds) {
  const values = [bounds.south, bounds.north, bounds.west, bounds.east];
  if (!values.every(Number.isFinite)) throw new Error('Limites geográficos inválidos');
  if (bounds.south < -90 || bounds.north > 90 || bounds.south >= bounds.north) throw new Error('Intervalo de latitude inválido');
  if (bounds.west < -180 || bounds.east > 180 || bounds.west >= bounds.east) throw new Error('Intervalo de longitude inválido');
  return bounds;
}

export function generateGeographicGrid(bounds: GeographicBounds, requestedCellSizeMeters = 5_000, requestedMaxCells = 500): GeographicGridCell[] {
  validateGeographicBounds(bounds);
  const cellSizeMeters = Math.max(500, Math.floor(requestedCellSizeMeters));
  const maxCells = Math.max(1, Math.floor(requestedMaxCells));
  const latitudeSpan = bounds.north - bounds.south;
  const longitudeSpan = bounds.east - bounds.west;
  const middleLatitudeRadians = ((bounds.south + bounds.north) / 2) * Math.PI / 180;
  const metersPerLongitudeDegree = Math.max(1, METERS_PER_LATITUDE_DEGREE * Math.cos(middleLatitudeRadians));
  const heightMeters = latitudeSpan * METERS_PER_LATITUDE_DEGREE;
  const widthMeters = longitudeSpan * metersPerLongitudeDegree;
  let effectiveCellSize = cellSizeMeters;
  let rows = Math.max(1, Math.ceil(heightMeters / effectiveCellSize));
  let columns = Math.max(1, Math.ceil(widthMeters / effectiveCellSize));
  if (rows * columns > maxCells) {
    effectiveCellSize *= Math.sqrt((rows * columns) / maxCells);
    rows = Math.max(1, Math.ceil(heightMeters / effectiveCellSize));
    columns = Math.max(1, Math.ceil(widthMeters / effectiveCellSize));
    while (rows * columns > maxCells) {
      effectiveCellSize *= 1.01;
      rows = Math.max(1, Math.ceil(heightMeters / effectiveCellSize));
      columns = Math.max(1, Math.ceil(widthMeters / effectiveCellSize));
    }
  }
  const latitudeStep = latitudeSpan / rows;
  const longitudeStep = longitudeSpan / columns;
  const cellHeightMeters = heightMeters / rows;
  const cellWidthMeters = widthMeters / columns;
  const radius = Math.max(100, Math.ceil(Math.hypot(cellHeightMeters, cellWidthMeters) / 2));
  const cells: GeographicGridCell[] = [];
  for (let row = 0; row < rows; row++) {
    const south = row === 0 ? bounds.south : bounds.south + latitudeStep * row;
    const north = row === rows - 1 ? bounds.north : bounds.south + latitudeStep * (row + 1);
    for (let column = 0; column < columns; column++) {
      const west = column === 0 ? bounds.west : bounds.west + longitudeStep * column;
      const east = column === columns - 1 ? bounds.east : bounds.west + longitudeStep * (column + 1);
      cells.push({
        sequence: cells.length,
        south: coordinate(south), north: coordinate(north), west: coordinate(west), east: coordinate(east),
        latitude: coordinate((south + north) / 2), longitude: coordinate((west + east) / 2), radius,
      });
    }
  }
  return cells;
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
export type LeadScoreInput = { website?: string | null; siteStatus?: string; reviewsCount?: number | null; whatsapp?: boolean; phone?: string | null; siteResponseMs?: number | null; hasHttps?: boolean | null; performanceScore?: number | null };
export function calculateLeadScore(input: LeadScoreInput) {
  let raw = 0;
  if (!input.website) raw += 40; else if (input.siteStatus === 'POOR') raw += 25;
  if ((input.reviewsCount ?? 0) === 0) raw += 25; else if ((input.reviewsCount ?? 0) <= 10) raw += 15;
  if (input.whatsapp) raw += 20;
  if (input.phone) raw += 10;
  if ((input.siteResponseMs ?? 0) > 3000) raw += 15;
  if (input.website && input.hasHttps === false) raw += 10;
  if (input.performanceScore != null && input.performanceScore < 50) raw += 15;
  const score = Math.min(100, raw);
  const scoreClass = score >= 80 ? 'VERY_HIGH' : score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
  return { score, scoreClass } as const;
}
export const terminalRunStates = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;

export const templateVariableNames = ['nome_empresa', 'cidade', 'categoria'] as const;
export type TemplateVariableName = typeof templateVariableNames[number];
export function templatePlaceholders(bodyText: string) {
  return [...new Set([...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(match => Number(match[1])))].sort((a, b) => a - b);
}
export function templateVariablesMatchBody(bodyText: string, variables: string[]) {
  const expected = variables.map((_, index) => index + 1);
  const found = templatePlaceholders(bodyText);
  return expected.length === found.length && expected.every((value, index) => value === found[index]);
}
export function resolveTemplateVariable(name: string, business: { name: string; city: string; category: string }) {
  if (name === 'nome_empresa') return business.name;
  if (name === 'cidade') return business.city;
  if (name === 'categoria') return business.category;
  return '';
}

export type AutopilotConfig = { maxConcurrentCities: number; delaySeconds: number; dailyLimit: number; monthlyLimit: number };
export const defaultAutopilotConfig: AutopilotConfig = { maxConcurrentCities: 1, delaySeconds: 300, dailyLimit: 10, monthlyLimit: 200 };
export function parseAutopilotConfig(raw: unknown): AutopilotConfig {
  const value = (raw ?? {}) as Partial<Record<keyof AutopilotConfig, unknown>>;
  const clamp = (input: unknown, fallback: number) => { const n = Math.floor(Number(input)); return Number.isFinite(n) && n > 0 ? n : fallback; };
  return {
    maxConcurrentCities: clamp(value.maxConcurrentCities, defaultAutopilotConfig.maxConcurrentCities),
    delaySeconds: clamp(value.delaySeconds, defaultAutopilotConfig.delaySeconds),
    dailyLimit: clamp(value.dailyLimit, defaultAutopilotConfig.dailyLimit),
    monthlyLimit: clamp(value.monthlyLimit, defaultAutopilotConfig.monthlyLimit),
  };
}
export function shouldDispatchAutopilot(input: { activeCount: number; dispatchedToday: number; dispatchedThisMonth: number; lastDispatchedAt: Date | null; now: Date; config: AutopilotConfig }) {
  if (input.activeCount >= input.config.maxConcurrentCities) return false;
  if (input.dispatchedToday >= input.config.dailyLimit) return false;
  if (input.dispatchedThisMonth >= input.config.monthlyLimit) return false;
  if (input.lastDispatchedAt && input.now.getTime() - input.lastDispatchedAt.getTime() < input.config.delaySeconds * 1000) return false;
  return true;
}
export function startOfLocalDay(now: Date) { const date = new Date(now); date.setHours(0, 0, 0, 0); return date; }
export function startOfLocalMonth(now: Date) { const date = new Date(now); date.setDate(1); date.setHours(0, 0, 0, 0); return date; }

export function businessWhere(q: any): any {
  const where: any = {};
  if (q.search) where.OR = [{ name: { contains: q.search, mode: 'insensitive' } }, { address: { contains: q.search, mode: 'insensitive' } }];
  if (q.city) where.city = q.city;
  if (q.state) where.state = q.state;
  if (q.category) where.category = q.category;
  if (q.hasWebsite != null) where.website = q.hasWebsite ? { not: null } : null;
  if (q.siteStatus) where.siteStatus = q.siteStatus;
  if (q.hasPhone != null) where.phone = q.hasPhone ? { not: null } : null;
  if (q.whatsappStatus) where.phones = { some: { whatsappStatus: q.whatsappStatus } };
  if (q.leadStatus) where.leadStatus = q.leadStatus;
  if (q.minRating != null || q.maxRating != null) where.rating = { ...(q.minRating != null ? { gte: q.minRating } : {}), ...(q.maxRating != null ? { lte: q.maxRating } : {}) };
  if (q.minReviews != null || q.maxReviews != null) where.reviewsCount = { ...(q.minReviews != null ? { gte: q.minReviews } : {}), ...(q.maxReviews != null ? { lte: q.maxReviews } : {}) };
  if (q.minScore != null || q.maxScore != null) where.leadScore = { ...(q.minScore != null ? { gte: q.minScore } : {}), ...(q.maxScore != null ? { lte: q.maxScore } : {}) };
  return where;
}

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
