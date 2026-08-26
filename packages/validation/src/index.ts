import { z } from 'zod';
import { templateVariableNames, templateVariablesMatchBody } from '@prospector/shared';
export const createRunSchema = z.object({ country: z.string().min(2).default('Brasil'), state: z.string().min(2), city: z.string().min(2), category: z.string().min(2).default('Todos'), mode: z.enum(['now','queue']).default('now') });
export const segmentGoalSchema = z.object({ goal: z.string().trim().min(5).max(500) });
export const createScheduleSchema = z.object({
  name: z.string().trim().min(2), country: z.string().trim().min(2).default('Brasil'), state: z.string().trim().min(2), city: z.string().trim().min(2),
  category: z.string().trim().min(2).default('Todos'), scheduleType: z.enum(['ONCE','DAILY','WEEKLY','MONTHLY','SPECIFIC_DAYS','CRON']),
  cronExpression: z.string().trim().optional().nullable(), nextRunAt: z.coerce.date().optional().nullable(), timezone: z.string().trim().min(1).default('America/Sao_Paulo'),
  enabled: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (['CRON', 'SPECIFIC_DAYS'].includes(value.scheduleType) && !value.cronExpression) {
    ctx.addIssue({ code: 'custom', path: ['cronExpression'], message: 'Expressão CRON obrigatória' });
  }
  if (!['CRON', 'SPECIFIC_DAYS'].includes(value.scheduleType) && !value.nextRunAt) {
    ctx.addIssue({ code: 'custom', path: ['nextRunAt'], message: 'Próxima execução obrigatória' });
  }
});
export const autopilotTargetSchema = z.object({
  country: z.string().trim().min(2).default('Brasil'), state: z.string().trim().min(2), city: z.string().trim().min(2),
  category: z.string().trim().min(2).default('Todos'), enabled: z.boolean().default(true),
});
export const autopilotConfigSchema = z.object({
  maxConcurrentCities: z.coerce.number().int().min(1).max(50),
  delaySeconds: z.coerce.number().int().min(0).max(86400),
  dailyLimit: z.coerce.number().int().min(1).max(1000),
  monthlyLimit: z.coerce.number().int().min(1).max(20000),
});
export const messageTemplateSchema = z.object({
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9_]+$/, 'Use apenas letras minúsculas, números e sublinhado').min(3).max(60),
  language: z.string().trim().min(2).default('pt_BR'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).default('MARKETING'),
  bodyText: z.string().trim().min(10).max(1024),
  variables: z.array(z.enum(templateVariableNames)).max(3).default([]),
}).superRefine((value, ctx) => {
  if (!templateVariablesMatchBody(value.bodyText, value.variables)) {
    const placeholders = value.variables.map((_, index) => `{{${index + 1}}}`).join(', ') || '(nenhum)';
    ctx.addIssue({ code: 'custom', path: ['bodyText'], message: `O corpo deve conter exatamente os placeholders ${placeholders}, na ordem, correspondentes às variáveis declaradas` });
  }
});
export const createCampaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  templateId: z.string().trim().min(1),
  scheduledAt: z.coerce.date().optional().nullable(),
  businessIds: z.array(z.string().trim().min(1)).max(1000).default([]),
  filters: z.record(z.string(), z.unknown()).default({}),
});
const queryBoolean = z.preprocess(value => typeof value === 'boolean' ? String(value) : value, z.enum(['true', 'false'])).transform(value => value === 'true');
export const businessFilterSchema = z.object({
  search: z.string().trim().optional(), city: z.string().optional(), state: z.string().optional(), category: z.string().optional(),
  hasWebsite: queryBoolean.optional(), siteStatus: z.enum(['NO_WEBSITE', 'POOR', 'AVERAGE', 'GOOD', 'UNKNOWN']).optional(),
  hasPhone: queryBoolean.optional(), whatsappStatus: z.enum(['UNKNOWN', 'AVAILABLE', 'NOT_AVAILABLE', 'INVALID']).optional(),
  leadStatus: z.enum(['NEW', 'QUALIFIED', 'CONTACT_PENDING', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'PROPOSAL', 'CUSTOMER', 'NOT_INTERESTED', 'DO_NOT_CONTACT']).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(), maxRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).optional(), maxReviews: z.coerce.number().int().min(0).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(), maxScore: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(200).default(25),
}).refine(value => value.minRating == null || value.maxRating == null || value.minRating <= value.maxRating, { message: 'Faixa de rating inválida', path: ['maxRating'] })
  .refine(value => value.minReviews == null || value.maxReviews == null || value.minReviews <= value.maxReviews, { message: 'Faixa de avaliações inválida', path: ['maxReviews'] })
  .refine(value => value.minScore == null || value.maxScore == null || value.minScore <= value.maxScore, { message: 'Faixa de score inválida', path: ['maxScore'] });
