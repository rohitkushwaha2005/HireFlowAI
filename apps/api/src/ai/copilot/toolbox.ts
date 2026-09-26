import { z } from 'zod';
import { APPLICATION_STATUSES, JOB_STATUSES } from '@hireflow/shared';

/**
 * The copilot's only window into the database. Every tool is implemented by the service layer,
 * scoped to the caller's organization, and returns plain JSON. The toolbox records every candidate
 * it returned so the final answer can be checked against what was actually retrieved.
 */

export const copilotToolSchemas = {
  search_candidates: z.object({
    query: z.string().describe('Natural-language description of the experience to look for'),
    skills: z.array(z.string()).optional().describe('Skills that must all be present'),
    jobId: z.string().optional().describe('Restrict to applicants of this job'),
    limit: z.number().int().min(1).max(15).optional(),
  }),
  find_candidates_by_skills: z.object({
    skills: z.array(z.string()).min(1).describe('Skill names, e.g. ["React", "Node.js"]'),
    mode: z.enum(['all', 'any']).optional().describe('Require all skills (default) or any'),
    minYears: z.number().min(0).optional().describe('Minimum years with each skill, when known'),
    jobId: z.string().optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  find_candidates_missing_skill: z.object({
    skill: z.string(),
    jobId: z.string().optional().describe('Restrict to applicants of this job'),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  get_candidate_profile: z.object({
    candidateId: z.string().optional(),
    name: z.string().optional().describe('Full or partial candidate name when the id is unknown'),
  }),
  compare_candidates: z.object({
    candidateIds: z.array(z.string()).min(2).max(5),
    jobId: z.string().optional(),
  }),
  list_applications: z.object({
    jobId: z.string().optional(),
    status: z.array(z.enum(APPLICATION_STATUSES)).optional(),
    minScore: z.number().min(0).max(100).optional(),
    limit: z.number().int().min(1).max(30).optional(),
  }),
  list_jobs: z.object({
    status: z.array(z.enum(JOB_STATUSES)).optional(),
  }),
  get_pipeline_summary: z.object({
    jobId: z.string().optional(),
  }),
  get_interview_questions: z.object({
    applicationId: z.string(),
    generateIfMissing: z.boolean().optional(),
  }),
} as const;

export type CopilotToolName = keyof typeof copilotToolSchemas;
export type CopilotToolInput<K extends CopilotToolName> = z.infer<(typeof copilotToolSchemas)[K]>;

export const COPILOT_TOOL_DESCRIPTIONS: Record<CopilotToolName, string> = {
  search_candidates:
    'Semantic (vector) search over candidate profiles and resumes in this organization. Use for open-ended experience questions such as "real-time applications" or "fintech background". Returns candidates ranked by similarity with their skills and experience.',
  find_candidates_by_skills:
    'Structured lookup of candidates who have specific skills (normalized, so "ReactJS" matches "React"). Use when the question names concrete skills.',
  find_candidates_missing_skill:
    'Lists applicants who do NOT have a given skill, optionally for one job.',
  get_candidate_profile:
    'Full profile of one candidate: skills with years, work experience, education, projects, applications and match scores. Look up by id or name.',
  compare_candidates:
    'Side-by-side comparison of 2–5 candidates: skills, experience, education and match scores (for a job when given).',
  list_applications:
    'Applications in this organization, filterable by job, pipeline status and minimum match score. Sorted by match score.',
  list_jobs: 'Jobs in this organization with status and applicant counts.',
  get_pipeline_summary: 'Number of applications per pipeline stage, overall or for one job.',
  get_interview_questions:
    'Interview questions for an application. Can generate them when none exist yet.',
};

export interface RetrievedCandidate {
  candidateId: string;
  name: string;
  applicationId: string | null;
  jobTitle: string | null;
  score: number | null;
}

export interface CopilotToolbox {
  /** Executes a tool with already-validated input and returns JSON-serializable output. */
  execute<K extends CopilotToolName>(name: K, input: CopilotToolInput<K>): Promise<unknown>;
  /** Candidates returned by any tool during this turn. */
  retrieved(): RetrievedCandidate[];
  /** Tool names invoked during this turn, in order. */
  used(): CopilotToolName[];
}

/** Validates raw model-provided tool input; returns an error string instead of throwing. */
export function parseToolInput(
  name: string,
  input: unknown,
): { ok: true; name: CopilotToolName; input: unknown } | { ok: false; error: string } {
  if (!(name in copilotToolSchemas)) return { ok: false, error: `Unknown tool: ${name}` };
  const toolName = name as CopilotToolName;
  const result = copilotToolSchemas[toolName].safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      error: `Invalid input for ${name}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    };
  }
  return { ok: true, name: toolName, input: result.data };
}
