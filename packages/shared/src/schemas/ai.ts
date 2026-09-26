import { z } from 'zod';
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  PROFICIENCY_LEVELS,
  QUESTION_CATEGORIES,
  QUESTION_DIFFICULTIES,
  REMOTE_TYPES,
  REQUIREMENT_CATEGORIES,
} from '../enums';

/**
 * Schemas for AI-produced structured data.
 *
 * They are used twice: (1) converted to JSON Schema for the model's structured-output mode and
 * (2) to re-validate whatever comes back before it is persisted. They avoid constraints that
 * structured-output JSON Schema cannot express (min/max lengths are applied afterwards by
 * `sanitize*` helpers in the API), so a single definition works for both.
 */

/** "YYYY-MM" or "YYYY" date strings, or null when unknown. */
const partialDate = z.string().nullable();

export const resumeAnalysisSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  currentRole: z.string().nullable(),
  totalExperienceYears: z.number().nullable(),
  skills: z.array(
    z.object({
      name: z.string(),
      proficiency: z.enum(PROFICIENCY_LEVELS).nullable(),
      yearsExperience: z.number().nullable(),
    }),
  ),
  workExperience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      startDate: partialDate,
      endDate: partialDate,
      current: z.boolean(),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string().nullable(),
      field: z.string().nullable(),
      level: z.enum(EDUCATION_LEVELS).nullable(),
      startDate: partialDate,
      endDate: partialDate,
      grade: z.string().nullable(),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      technologies: z.array(z.string()),
      url: z.string().nullable(),
    }),
  ),
  certifications: z.array(z.string()),
  links: z.object({
    portfolio: z.string().nullable(),
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    other: z.array(z.string()),
  }),
});
export type ResumeAnalysis = z.infer<typeof resumeAnalysisSchema>;

const analyzedRequirement = z.object({
  skill: z.string(),
  category: z.enum(REQUIREMENT_CATEGORIES),
  /** 1 (nice to know) … 5 (critical). */
  weight: z.number().int(),
  minimumYears: z.number().nullable(),
});

export const jobAnalysisSchema = z.object({
  summary: z.string(),
  requiredSkills: z.array(analyzedRequirement),
  preferredSkills: z.array(analyzedRequirement),
  minYearsExperience: z.number().nullable(),
  educationLevel: z.enum(EDUCATION_LEVELS).nullable(),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
  seniority: z.enum(EXPERIENCE_LEVELS).nullable(),
  location: z.string().nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
  remoteType: z.enum(REMOTE_TYPES).nullable(),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

export const generatedInterviewQuestionSchema = z.object({
  category: z.enum(QUESTION_CATEGORIES),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  question: z.string(),
  expectedSignals: z.array(z.string()),
  /** Why this question is relevant to this candidate and job (grounded in their data). */
  rationale: z.string(),
});
export type GeneratedInterviewQuestion = z.infer<typeof generatedInterviewQuestionSchema>;

export const interviewQuestionSetSchema = z.object({
  questions: z.array(generatedInterviewQuestionSchema),
});
export type InterviewQuestionSet = z.infer<typeof interviewQuestionSetSchema>;
