/**
 * Domain enums shared by the API and the web app.
 *
 * These mirror the Prisma enums in `@hireflow/database`; a compile-time parity check lives in
 * `packages/database/src/enum-parity.ts` so the two can never drift.
 */

export const USER_ROLES = ['ADMIN', 'RECRUITER', 'HIRING_MANAGER', 'CANDIDATE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORG_ROLES = ['OWNER', 'ADMIN', 'RECRUITER', 'HIRING_MANAGER'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const JOB_STATUSES = ['DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'TEMPORARY',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EXPERIENCE_LEVELS = [
  'INTERN',
  'JUNIOR',
  'MID',
  'SENIOR',
  'LEAD',
  'PRINCIPAL',
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const REMOTE_TYPES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export type RemoteType = (typeof REMOTE_TYPES)[number];

export const EDUCATION_LEVELS = [
  'NONE',
  'HIGH_SCHOOL',
  'ASSOCIATE',
  'BACHELOR',
  'MASTER',
  'DOCTORATE',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const REQUIREMENT_CATEGORIES = [
  'LANGUAGE',
  'FRAMEWORK',
  'DATABASE',
  'CLOUD',
  'DEVOPS',
  'TOOL',
  'AI_ML',
  'CONCEPT',
  'SOFT_SKILL',
  'DOMAIN',
  'OTHER',
] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const PARSING_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type ParsingStatus = (typeof PARSING_STATUSES)[number];

export const ANALYSIS_STATUSES = ['NOT_STARTED', 'PENDING', 'COMPLETED', 'FAILED'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const APPLICATION_STATUSES = [
  'APPLIED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Columns shown on the recruiter Kanban board, in order. WITHDRAWN is candidate-initiated only. */
export const PIPELINE_STAGES = [
  'APPLIED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
] as const satisfies readonly ApplicationStatus[];
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const APPLICATION_SOURCES = ['JOB_BOARD', 'REFERRAL', 'SOURCED', 'IMPORTED'] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const SKILL_SOURCES = ['RESUME', 'MANUAL', 'INFERRED'] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

export const PROFICIENCY_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
export type Proficiency = (typeof PROFICIENCY_LEVELS)[number];

export const INTERVIEW_TYPES = [
  'PHONE',
  'VIDEO',
  'ONSITE',
  'TECHNICAL',
  'BEHAVIORAL',
  'PANEL',
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const QUESTION_CATEGORIES = [
  'TECHNICAL',
  'PROJECT',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'ROLE_SPECIFIC',
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const AUDIT_ACTIONS = [
  'JOB_CREATED',
  'JOB_UPDATED',
  'JOB_PUBLISHED',
  'JOB_PAUSED',
  'JOB_CLOSED',
  'JOB_DELETED',
  'JOB_DUPLICATED',
  'CANDIDATE_VIEWED',
  'APPLICATION_STATUS_CHANGED',
  'CANDIDATE_SHORTLISTED',
  'CANDIDATE_REJECTED',
  'INTERVIEW_CREATED',
  'INTERVIEW_UPDATED',
  'INTERVIEW_QUESTIONS_GENERATED',
  'MATCH_RECALCULATED',
  'MEMBER_INVITED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_REMOVED',
  'ORGANIZATION_UPDATED',
  'RESUME_VIEWED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const COPILOT_ROLES = ['USER', 'ASSISTANT'] as const;
export type CopilotRole = (typeof COPILOT_ROLES)[number];

/** Human-readable labels, used by the UI and email templates. */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  NONE: 'No formal requirement',
  HIGH_SCHOOL: 'High school',
  ASSOCIATE: 'Associate degree',
  BACHELOR: "Bachelor's degree",
  MASTER: "Master's degree",
  DOCTORATE: 'Doctorate',
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  TEMPORARY: 'Temporary',
};

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  INTERN: 'Intern',
  JUNIOR: 'Junior',
  MID: 'Mid-level',
  SENIOR: 'Senior',
  LEAD: 'Lead',
  PRINCIPAL: 'Principal',
};

export const REMOTE_TYPE_LABELS: Record<RemoteType, string> = {
  ONSITE: 'On-site',
  HYBRID: 'Hybrid',
  REMOTE: 'Remote',
};
