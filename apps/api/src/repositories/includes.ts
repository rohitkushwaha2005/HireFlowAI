import type { Prisma } from '@hireflow/database';

/**
 * Reusable Prisma selections. Defining them once keeps queries consistent and lets mappers be
 * typed against exactly what was loaded (`Prisma.*GetPayload`).
 */

export const userPublicSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  emailVerified: true,
  createdAt: true,
} satisfies Prisma.UserSelect;
export type UserPublic = Prisma.UserGetPayload<{ select: typeof userPublicSelect }>;

export const userNameSelect = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

export const jobSummaryInclude = {
  createdBy: { select: userNameSelect },
  _count: { select: { applications: true } },
} satisfies Prisma.JobInclude;
export type JobWithSummary = Prisma.JobGetPayload<{ include: typeof jobSummaryInclude }>;

export const jobDetailInclude = {
  ...jobSummaryInclude,
  requirements: { orderBy: [{ required: 'desc' }, { position: 'asc' }] },
} satisfies Prisma.JobInclude;
export type JobWithDetail = Prisma.JobGetPayload<{ include: typeof jobDetailInclude }>;

export const publicJobInclude = {
  organization: { select: { name: true, slug: true, logoUrl: true } },
  requirements: {
    orderBy: [{ required: 'desc' }, { weight: 'desc' }, { position: 'asc' }],
    select: { skill: true, required: true, minimumYears: true, category: true },
  },
} satisfies Prisma.JobInclude;
export type PublicJob = Prisma.JobGetPayload<{ include: typeof publicJobInclude }>;

export const resumeSelect = {
  id: true,
  candidateId: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  parsingStatus: true,
  parsingError: true,
  parsedAt: true,
  isPrimary: true,
  createdAt: true,
  aiProvider: true,
} satisfies Prisma.ResumeSelect;
export type ResumeRow = Prisma.ResumeGetPayload<{ select: typeof resumeSelect }>;

export const candidateProfileInclude = {
  user: { select: userPublicSelect },
  skills: { orderBy: [{ yearsExperience: { sort: 'desc', nulls: 'last' } }, { skill: 'asc' }] },
  experiences: { orderBy: [{ current: 'desc' }, { startDate: { sort: 'desc', nulls: 'last' } }] },
  education: { orderBy: { endDate: { sort: 'desc', nulls: 'last' } } },
  projects: { orderBy: { createdAt: 'asc' } },
  resumes: { select: resumeSelect, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.CandidateProfileInclude;
export type CandidateProfileFull = Prisma.CandidateProfileGetPayload<{
  include: typeof candidateProfileInclude;
}>;

export const applicationListInclude = {
  job: { select: { id: true, title: true, slug: true, status: true, organizationId: true } },
  candidate: {
    select: {
      id: true,
      headline: true,
      currentRole: true,
      totalExperience: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  },
  match: { select: { overallScore: true, matchedSkills: true } },
  resume: { select: { parsingStatus: true } },
  _count: { select: { interviews: true } },
} satisfies Prisma.ApplicationInclude;
export type ApplicationListRow = Prisma.ApplicationGetPayload<{
  include: typeof applicationListInclude;
}>;

export const interviewInclude = {
  interviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
  application: {
    select: {
      id: true,
      job: {
        select: {
          id: true,
          title: true,
          organizationId: true,
          organization: { select: { name: true } },
        },
      },
      candidate: {
        select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  },
} satisfies Prisma.InterviewInclude;
export type InterviewRow = Prisma.InterviewGetPayload<{ include: typeof interviewInclude }>;

export const applicationDetailInclude = {
  ...applicationListInclude,
  resume: { select: resumeSelect },
  match: true,
  notes: { include: { author: { select: userNameSelect } }, orderBy: { createdAt: 'desc' } },
  statusEvents: {
    include: { changedBy: { select: userNameSelect } },
    orderBy: { createdAt: 'desc' },
  },
  interviews: { include: interviewInclude, orderBy: { scheduledAt: 'asc' } },
  questions: { orderBy: { position: 'asc' } },
} satisfies Prisma.ApplicationInclude;
export type ApplicationDetailRow = Prisma.ApplicationGetPayload<{
  include: typeof applicationDetailInclude;
}>;

export const candidateApplicationInclude = {
  job: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      location: true,
      remoteType: true,
      organization: { select: { name: true, logoUrl: true } },
    },
  },
  resume: { select: { id: true, fileName: true } },
  statusEvents: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
  interviews: {
    where: { status: 'SCHEDULED' },
    include: { interviewer: { select: userNameSelect } },
    orderBy: { scheduledAt: 'asc' },
  },
} satisfies Prisma.ApplicationInclude;
export type CandidateApplicationRow = Prisma.ApplicationGetPayload<{
  include: typeof candidateApplicationInclude;
}>;

export const auditInclude = { user: { select: userNameSelect } } satisfies Prisma.AuditLogInclude;
export type AuditRow = Prisma.AuditLogGetPayload<{ include: typeof auditInclude }>;
