import { z } from 'zod';
import { APPLICATION_STATUSES, PIPELINE_STAGES } from '../enums';
import { csvArray, idSchema, optionalText, paginationQuerySchema } from './common';

export const createApplicationSchema = z.object({
  resumeId: idSchema,
  coverLetter: optionalText(5000),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** Recruiters move applications between pipeline stages; WITHDRAWN is candidate-only. */
export const updateApplicationStatusSchema = z.object({
  status: z.enum(PIPELINE_STAGES),
  note: optionalText(1000),
  /** Optimistic concurrency: the status the client believes is current. */
  fromStatus: z.enum(APPLICATION_STATUSES).optional(),
});
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;

export const APPLICATION_SORT_FIELDS = ['appliedAt', 'score', 'updatedAt'] as const;

export const applicationListQuerySchema = paginationQuerySchema.extend({
  jobId: optionalText(64),
  status: csvArray(z.enum(APPLICATION_STATUSES)),
  search: optionalText(100),
  minScore: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(APPLICATION_SORT_FIELDS).default('appliedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

export const pipelineQuerySchema = z.object({
  jobId: optionalText(64),
});
export type PipelineQuery = z.infer<typeof pipelineQuerySchema>;

export const addApplicationNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type AddApplicationNoteInput = z.infer<typeof addApplicationNoteSchema>;
