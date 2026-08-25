import { z } from 'zod';
export const createRunSchema = z.object({ country: z.string().min(2).default('Brasil'), state: z.string().min(2), city: z.string().min(2), category: z.string().min(2).default('Todos'), mode: z.enum(['now','queue']).default('now') });
export const createScheduleSchema = z.object({ name: z.string().min(2), country: z.string().default('Brasil'), state: z.string().min(2), city: z.string().min(2), category: z.string().default('Todos'), scheduleType: z.enum(['ONCE','DAILY','WEEKLY','MONTHLY','SPECIFIC_DAYS','CRON']), cronExpression: z.string().optional(), nextRunAt: z.coerce.date().optional(), enabled: z.boolean().default(true) });
const queryBoolean = z.enum(['true', 'false']).transform(value => value === 'true');
export const businessFilterSchema = z.object({
  search: z.string().trim().optional(), city: z.string().optional(), state: z.string().optional(), category: z.string().optional(),
  hasWebsite: queryBoolean.optional(), siteStatus: z.enum(['NO_WEBSITE', 'POOR', 'AVERAGE', 'GOOD', 'UNKNOWN']).optional(),
  hasPhone: queryBoolean.optional(), whatsappStatus: z.enum(['UNKNOWN', 'AVAILABLE', 'NOT_AVAILABLE', 'INVALID']).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(), maxRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).optional(), maxReviews: z.coerce.number().int().min(0).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(), maxScore: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(200).default(25),
}).refine(value => value.minRating == null || value.maxRating == null || value.minRating <= value.maxRating, { message: 'Faixa de rating inválida', path: ['maxRating'] })
  .refine(value => value.minReviews == null || value.maxReviews == null || value.minReviews <= value.maxReviews, { message: 'Faixa de avaliações inválida', path: ['maxReviews'] })
  .refine(value => value.minScore == null || value.maxScore == null || value.minScore <= value.maxScore, { message: 'Faixa de score inválida', path: ['maxScore'] });
