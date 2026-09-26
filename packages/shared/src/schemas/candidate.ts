import { z } from 'zod';
import { APPLICATION_STATUSES, EDUCATION_LEVELS, PROFICIENCY_LEVELS } from '../enums';
import {
  booleanQuery,
  csvArray,
  nullableText,
  nullableUrl,
  optionalText,
  paginationQuerySchema,
} from './common';

/** ISO date (YYYY-MM-DD) or YYYY-MM, coerced to a Date; empty → null. */
export const flexibleDate = z.preprocess((v) => {
  if (v === '' || v === undefined || v === null) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  return v;
}, z.coerce.date().nullable());

export const updateCandidateProfileSchema = z.object({
  headline: nullableText(160),
  summary: nullableText(3000),
  location: nullableText(120),
  phone: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .trim()
      .regex(/^[+()\d\s.-]{6,25}$/, { error: 'Enter a valid phone number' })
      .nullable()
      .optional(),
  ),
  portfolioUrl: nullableUrl,
  linkedinUrl: nullableUrl,
  githubUrl: nullableUrl,
  currentRole: nullableText(120),
  totalExperience: z.number().min(0).max(60).nullable().optional(),
  highestEducation: z.enum(EDUCATION_LEVELS).nullable().optional(),
});
export type UpdateCandidateProfileInput = z.input<typeof updateCandidateProfileSchema>;

export const candidateSkillInputSchema = z.object({
  skill: z.string().trim().min(1).max(80),
  proficiency: z.enum(PROFICIENCY_LEVELS).nullable().default(null),
  yearsExperience: z.number().min(0).max(50).nullable().default(null),
});
export const replaceSkillsSchema = z.object({
  skills: z.array(candidateSkillInputSchema).max(80),
});
export type ReplaceSkillsInput = z.input<typeof replaceSkillsSchema>;

export const workExperienceInputSchema = z
  .object({
    company: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(120),
    description: nullableText(4000),
    startDate: flexibleDate,
    endDate: flexibleDate,
    current: z.boolean().default(false),
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
    path: ['endDate'],
    error: 'End date must be after start date',
  });
export const replaceExperienceSchema = z.object({
  experiences: z.array(workExperienceInputSchema).max(40),
});
export type ReplaceExperienceInput = z.input<typeof replaceExperienceSchema>;

export const educationInputSchema = z.object({
  institution: z.string().trim().min(1).max(160),
  degree: nullableText(120),
  field: nullableText(120),
  level: z.enum(EDUCATION_LEVELS).nullable().default(null),
  startDate: flexibleDate,
  endDate: flexibleDate,
  grade: nullableText(40),
});
export const replaceEducationSchema = z.object({
  education: z.array(educationInputSchema).max(20),
});
export type ReplaceEducationInput = z.input<typeof replaceEducationSchema>;

export const CANDIDATE_SORT_FIELDS = ['relevance', 'createdAt', 'experience', 'name'] as const;

/**
 * Recruiter candidate search. `q` triggers hybrid semantic search (vector similarity combined with
 * the structured filters); without `q` it is a filtered listing.
 */
export const candidateSearchQuerySchema = paginationQuerySchema.extend({
  q: optionalText(300),
  skills: csvArray(z.string().trim().min(1).max(60)),
  minExperience: z.coerce.number().min(0).max(60).optional(),
  maxExperience: z.coerce.number().min(0).max(60).optional(),
  location: optionalText(100),
  jobId: optionalText(64),
  status: csvArray(z.enum(APPLICATION_STATUSES)),
  appliedOnly: booleanQuery,
  sort: z.enum(CANDIDATE_SORT_FIELDS).default('relevance'),
});
export type CandidateSearchQuery = z.infer<typeof candidateSearchQuerySchema>;
