import { z } from 'zod';
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  JOB_STATUSES,
  REMOTE_TYPES,
  REQUIREMENT_CATEGORIES,
} from '../enums';
import { csvArray, optionalText, paginationQuerySchema } from './common';

export const jobRequirementInputSchema = z.object({
  skill: z.string().trim().min(1).max(80),
  category: z.enum(REQUIREMENT_CATEGORIES).default('OTHER'),
  required: z.boolean().default(true),
  weight: z.number().int().min(1).max(5).default(3),
  minimumYears: z.number().min(0).max(30).nullable().default(null),
});
export type JobRequirementInput = z.infer<typeof jobRequirementInputSchema>;

const moneySchema = z.number().int().min(0).max(10_000_000).nullable();

const jobFieldsSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z
    .string()
    .trim()
    .min(50, { error: 'Describe the role in at least 50 characters' })
    .max(20_000),
  location: z.string().trim().max(120).nullable().default(null),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('FULL_TIME'),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).default('MID'),
  remoteType: z.enum(REMOTE_TYPES).default('HYBRID'),
  salaryMin: moneySchema.default(null),
  salaryMax: moneySchema.default(null),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: 'Use a 3-letter ISO currency code' })
    .default('USD'),
  minYearsExperience: z.number().min(0).max(40).nullable().default(null),
  educationLevel: z.enum(EDUCATION_LEVELS).nullable().default(null),
  responsibilities: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  requirements: z.array(jobRequirementInputSchema).max(40).default([]),
});

const salaryRangeValid = (v: { salaryMin?: number | null; salaryMax?: number | null }) =>
  v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax;

export const createJobSchema = jobFieldsSchema.refine(salaryRangeValid, {
  path: ['salaryMax'],
  error: 'Maximum salary must be greater than or equal to minimum salary',
});
export type CreateJobInput = z.input<typeof createJobSchema>;
export type CreateJobData = z.output<typeof createJobSchema>;

/** PATCH: every field optional, no defaults applied (so omitted fields are left untouched). */
export const updateJobSchema = z
  .object({
    title: jobFieldsSchema.shape.title.optional(),
    description: jobFieldsSchema.shape.description.optional(),
    location: z.string().trim().max(120).nullable().optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
    remoteType: z.enum(REMOTE_TYPES).optional(),
    salaryMin: moneySchema.optional(),
    salaryMax: moneySchema.optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    minYearsExperience: z.number().min(0).max(40).nullable().optional(),
    educationLevel: z.enum(EDUCATION_LEVELS).nullable().optional(),
    responsibilities: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
    requirements: z.array(jobRequirementInputSchema).max(40).optional(),
  })
  .refine(salaryRangeValid, {
    path: ['salaryMax'],
    error: 'Maximum salary must be greater than or equal to minimum salary',
  });
export type UpdateJobInput = z.input<typeof updateJobSchema>;
export type UpdateJobData = z.output<typeof updateJobSchema>;

export const JOB_TRANSITIONS = ['publish', 'pause', 'close', 'reopen'] as const;
export type JobTransition = (typeof JOB_TRANSITIONS)[number];

export const jobTransitionParamSchema = z.object({
  id: z.string().min(1).max(64),
  action: z.enum(JOB_TRANSITIONS),
});

export const JOB_SORT_FIELDS = ['createdAt', 'updatedAt', 'title', 'publishedAt'] as const;

export const jobListQuerySchema = paginationQuerySchema.extend({
  search: optionalText(100),
  status: csvArray(z.enum(JOB_STATUSES)),
  sort: z.enum(JOB_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;

export const publicJobListQuerySchema = paginationQuerySchema.extend({
  search: optionalText(100),
  location: optionalText(100),
  remoteType: csvArray(z.enum(REMOTE_TYPES)),
  employmentType: csvArray(z.enum(EMPLOYMENT_TYPES)),
  experienceLevel: csvArray(z.enum(EXPERIENCE_LEVELS)),
  organization: optionalText(60),
});
export type PublicJobListQuery = z.infer<typeof publicJobListQuerySchema>;

export const analyzeJobSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(50).max(20_000),
});
export type AnalyzeJobInput = z.infer<typeof analyzeJobSchema>;
