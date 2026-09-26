import { z } from 'zod';
import {
  INTERVIEW_STATUSES,
  INTERVIEW_TYPES,
  QUESTION_CATEGORIES,
  QUESTION_DIFFICULTIES,
} from '../enums';
import { csvArray, idSchema, nullableText, nullableUrl, optionalText, paginationQuerySchema } from './common';

export const createInterviewSchema = z.object({
  applicationId: idSchema,
  interviewerId: idSchema,
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now() - 5 * 60_000, {
    error: 'Interview must be scheduled in the future',
  }),
  duration: z.number().int().min(15).max(480).default(60),
  type: z.enum(INTERVIEW_TYPES).default('VIDEO'),
  meetingUrl: nullableUrl,
  location: nullableText(200),
  notes: nullableText(4000),
});
export type CreateInterviewInput = z.input<typeof createInterviewSchema>;

export const updateInterviewSchema = z.object({
  interviewerId: idSchema.optional(),
  scheduledAt: z.coerce.date().optional(),
  duration: z.number().int().min(15).max(480).optional(),
  type: z.enum(INTERVIEW_TYPES).optional(),
  meetingUrl: nullableUrl,
  location: nullableText(200),
  notes: nullableText(4000),
  status: z.enum(INTERVIEW_STATUSES).optional(),
  feedback: nullableText(8000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});
export type UpdateInterviewInput = z.input<typeof updateInterviewSchema>;

export const interviewListQuerySchema = paginationQuerySchema.extend({
  status: csvArray(z.enum(INTERVIEW_STATUSES)),
  applicationId: optionalText(64),
  upcoming: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  mine: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});
export type InterviewListQuery = z.infer<typeof interviewListQuerySchema>;

export const generateQuestionsSchema = z.object({
  count: z.number().int().min(3).max(20).default(8),
  categories: z.array(z.enum(QUESTION_CATEGORIES)).min(1).max(5).optional(),
  difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
  /** Replace previously generated questions instead of appending. */
  replace: z.boolean().default(true),
});
export type GenerateQuestionsInput = z.input<typeof generateQuestionsSchema>;

export const questionListQuerySchema = z.object({
  category: csvArray(z.enum(QUESTION_CATEGORIES)),
});
