import {
  DEFAULT_MATCHING_WEIGHTS,
  fullName,
  matchingWeightsSchema,
  PIPELINE_STAGES,
  type ApplicationDetailDto,
  type ApplicationListItemDto,
  type ApplicationStatus,
  type AuditLogDto,
  type CandidateApplicationDto,
  type CandidateInterviewDto,
  type CandidateProfileDto,
  type InterviewDto,
  type InterviewQuestionDto,
  type JobDetailDto,
  type JobRequirementDto,
  type JobSummaryDto,
  type MatchDto,
  type MatchingWeights,
  type OrganizationDto,
  type PublicJobDetailDto,
  type PublicJobDto,
  type RequirementBreakdown,
  type ResumeDto,
  type UserDto,
} from '@hireflow/shared';
import type {
  CandidateMatch,
  InterviewQuestion,
  JobRequirement,
  Organization,
} from '@hireflow/database';
import type {
  ApplicationDetailRow,
  ApplicationListRow,
  AuditRow,
  CandidateApplicationRow,
  CandidateProfileFull,
  InterviewRow,
  JobWithDetail,
  JobWithSummary,
  PublicJob,
  ResumeRow,
  UserPublic,
} from '../repositories/includes';

const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);
const name = (person: { firstName: string; lastName: string }) => fullName(person);

export function toUserDto(user: UserPublic): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: iso(user.createdAt),
  };
}

export function parseWeights(value: unknown): MatchingWeights {
  const parsed = matchingWeightsSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_MATCHING_WEIGHTS };
}

export function toOrganizationDto(org: Organization): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    matchingWeights: parseWeights(org.matchingWeights),
    createdAt: iso(org.createdAt),
  };
}

export function toRequirementDto(req: JobRequirement): JobRequirementDto {
  return {
    id: req.id,
    skill: req.skill,
    normalizedSkill: req.normalizedSkill,
    category: req.category,
    required: req.required,
    weight: req.weight,
    minimumYears: req.minimumYears,
    aiGenerated: req.aiGenerated,
  };
}

export function toJobSummaryDto(job: JobWithSummary, newApplicationCount = 0): JobSummaryDto {
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    status: job.status,
    location: job.location,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    remoteType: job.remoteType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    publishedAt: isoOrNull(job.publishedAt),
    closedAt: isoOrNull(job.closedAt),
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
    applicationCount: job._count.applications,
    newApplicationCount,
    createdBy: job.createdBy ? { id: job.createdBy.id, name: name(job.createdBy) } : null,
  };
}

export function emptyPipeline(): Record<ApplicationStatus, number> {
  return {
    APPLIED: 0,
    SCREENING: 0,
    SHORTLISTED: 0,
    INTERVIEW: 0,
    OFFER: 0,
    HIRED: 0,
    REJECTED: 0,
    WITHDRAWN: 0,
  };
}

export function toJobDetailDto(
  job: JobWithDetail,
  pipeline: Record<ApplicationStatus, number>,
  newApplicationCount = 0,
): JobDetailDto {
  return {
    ...toJobSummaryDto(job, newApplicationCount),
    description: job.description,
    responsibilities: job.responsibilities,
    minYearsExperience: job.minYearsExperience,
    educationLevel: job.educationLevel,
    requirements: job.requirements.map(toRequirementDto),
    analysisStatus: job.analysisStatus,
    analysisSummary: job.analysisSummary,
    keywords: job.keywords,
    analyzedAt: isoOrNull(job.analyzedAt),
    pipeline,
  };
}

export function toPublicJobDto(job: PublicJob): PublicJobDto {
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    location: job.location,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    remoteType: job.remoteType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    publishedAt: isoOrNull(job.publishedAt),
    organization: job.organization,
    skills: job.requirements.filter((r) => r.required).slice(0, 6).map((r) => r.skill),
  };
}

export function toPublicJobDetailDto(
  job: PublicJob,
  viewerApplication: PublicJobDetailDto['viewerApplication'],
): PublicJobDetailDto {
  return {
    ...toPublicJobDto(job),
    description: job.description,
    responsibilities: job.responsibilities,
    minYearsExperience: job.minYearsExperience,
    educationLevel: job.educationLevel,
    requirements: job.requirements,
    viewerApplication,
  };
}

export function toResumeDto(resume: ResumeRow): ResumeDto {
  return {
    id: resume.id,
    fileName: resume.fileName,
    mimeType: resume.mimeType,
    fileSize: resume.fileSize,
    parsingStatus: resume.parsingStatus,
    parsingError: resume.parsingError,
    parsedAt: isoOrNull(resume.parsedAt),
    isPrimary: resume.isPrimary,
    createdAt: iso(resume.createdAt),
    aiProvider: resume.aiProvider,
  };
}

/** 0–100 heuristic of how complete a profile is; drives the candidate dashboard nudge. */
export function profileCompleteness(profile: CandidateProfileFull): number {
  const checks = [
    !!profile.headline,
    !!profile.summary,
    !!profile.location,
    !!profile.currentRole,
    profile.skills.length >= 3,
    profile.experiences.length > 0,
    profile.education.length > 0,
    profile.resumes.some((r) => r.parsingStatus === 'COMPLETED'),
    !!(profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl),
    profile.projects.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function toCandidateProfileDto(profile: CandidateProfileFull): CandidateProfileDto {
  return {
    id: profile.id,
    userId: profile.userId,
    firstName: profile.user.firstName,
    lastName: profile.user.lastName,
    email: profile.user.email,
    avatarUrl: profile.user.avatarUrl,
    headline: profile.headline,
    summary: profile.summary,
    location: profile.location,
    phone: profile.phone,
    portfolioUrl: profile.portfolioUrl,
    linkedinUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl,
    totalExperience: profile.totalExperience,
    currentRole: profile.currentRole,
    highestEducation: profile.highestEducation,
    certifications: profile.certifications,
    skills: profile.skills.map((s) => ({
      id: s.id,
      skill: s.skill,
      normalizedSkill: s.normalizedSkill,
      proficiency: s.proficiency,
      yearsExperience: s.yearsExperience,
      source: s.source,
    })),
    experiences: profile.experiences.map((e) => ({
      id: e.id,
      company: e.company,
      title: e.title,
      description: e.description,
      startDate: isoOrNull(e.startDate),
      endDate: isoOrNull(e.endDate),
      current: e.current,
    })),
    education: profile.education.map((e) => ({
      id: e.id,
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      level: e.level,
      startDate: isoOrNull(e.startDate),
      endDate: isoOrNull(e.endDate),
      grade: e.grade,
    })),
    projects: profile.projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      technologies: p.technologies,
      url: p.url,
    })),
    resumes: profile.resumes.map(toResumeDto),
    profileCompleteness: profileCompleteness(profile),
    updatedAt: iso(profile.updatedAt),
  };
}

function matchStatus(row: { match: unknown; resume: { parsingStatus: string } | null }): ApplicationListItemDto['matchStatus'] {
  if (row.match) return 'READY';
  if (!row.resume || row.resume.parsingStatus === 'FAILED') return 'UNAVAILABLE';
  return 'PENDING';
}

export function toApplicationListItemDto(row: ApplicationListRow): ApplicationListItemDto {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    appliedAt: iso(row.appliedAt),
    updatedAt: iso(row.updatedAt),
    job: { id: row.job.id, title: row.job.title, slug: row.job.slug, status: row.job.status },
    candidate: {
      id: row.candidate.id,
      firstName: row.candidate.user.firstName,
      lastName: row.candidate.user.lastName,
      email: row.candidate.user.email,
      headline: row.candidate.headline,
      currentRole: row.candidate.currentRole,
      totalExperience: row.candidate.totalExperience,
    },
    overallScore: row.match?.overallScore ?? null,
    matchStatus: matchStatus(row),
    resumeParsingStatus: row.resume?.parsingStatus ?? null,
    interviewCount: row._count.interviews,
  };
}

export function toMatchDto(match: CandidateMatch): MatchDto {
  return {
    id: match.id,
    applicationId: match.applicationId,
    overallScore: match.overallScore,
    skillsScore: match.skillsScore,
    experienceScore: match.experienceScore,
    educationScore: match.educationScore,
    semanticScore: match.semanticScore,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    explanation: match.explanation,
    highlights: match.highlights,
    concerns: match.concerns,
    requirements: (Array.isArray(match.details) ? match.details : []) as unknown as RequirementBreakdown[],
    weights: parseWeights(match.weights),
    createdAt: iso(match.createdAt),
    updatedAt: iso(match.updatedAt),
  };
}

export function toInterviewDto(row: InterviewRow): InterviewDto {
  return {
    id: row.id,
    applicationId: row.applicationId,
    scheduledAt: iso(row.scheduledAt),
    duration: row.duration,
    type: row.type,
    status: row.status,
    meetingUrl: row.meetingUrl,
    location: row.location,
    notes: row.notes,
    feedback: row.feedback,
    rating: row.rating,
    interviewer: row.interviewer
      ? { id: row.interviewer.id, name: name(row.interviewer), email: row.interviewer.email }
      : null,
    candidate: {
      id: row.application.candidate.id,
      firstName: row.application.candidate.user.firstName,
      lastName: row.application.candidate.user.lastName,
    },
    job: { id: row.application.job.id, title: row.application.job.title },
    createdAt: iso(row.createdAt),
  };
}

export function toCandidateInterviewDto(row: InterviewRow): CandidateInterviewDto {
  return {
    id: row.id,
    scheduledAt: iso(row.scheduledAt),
    duration: row.duration,
    type: row.type,
    status: row.status,
    meetingUrl: row.meetingUrl,
    location: row.location,
    interviewerName: row.interviewer ? name(row.interviewer) : null,
    job: {
      id: row.application.job.id,
      title: row.application.job.title,
      organizationName: row.application.job.organization.name,
    },
  };
}

export function toQuestionDto(q: InterviewQuestion): InterviewQuestionDto {
  return {
    id: q.id,
    applicationId: q.applicationId,
    category: q.category,
    difficulty: q.difficulty,
    question: q.question,
    expectedSignals: q.expectedSignals,
    rationale: q.rationale,
    aiProvider: q.aiProvider,
    createdAt: iso(q.createdAt),
  };
}

export function toApplicationDetailDto(row: ApplicationDetailRow): ApplicationDetailDto {
  return {
    ...toApplicationListItemDto({
      ...row,
      match: row.match ? { overallScore: row.match.overallScore, matchedSkills: row.match.matchedSkills } : null,
      resume: row.resume ? { parsingStatus: row.resume.parsingStatus } : null,
    }),
    coverLetter: row.coverLetter,
    resume: row.resume ? toResumeDto(row.resume) : null,
    match: row.match ? toMatchDto(row.match) : null,
    notes: row.notes.map((n) => ({
      id: n.id,
      body: n.body,
      author: { id: n.author.id, name: name(n.author) },
      createdAt: iso(n.createdAt),
    })),
    history: row.statusEvents.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      changedBy: e.changedBy ? { id: e.changedBy.id, name: name(e.changedBy) } : null,
      createdAt: iso(e.createdAt),
    })),
    interviews: row.interviews.map(toInterviewDto),
    questions: row.questions.map(toQuestionDto),
  };
}

export function toCandidateApplicationDto(row: CandidateApplicationRow): CandidateApplicationDto {
  return {
    id: row.id,
    status: row.status,
    appliedAt: iso(row.appliedAt),
    updatedAt: iso(row.updatedAt),
    job: row.job,
    resume: row.resume,
    history: row.statusEvents.map((e) => ({ status: e.toStatus, at: iso(e.createdAt) })),
    upcomingInterviews: row.interviews
      .filter((i) => i.scheduledAt.getTime() > Date.now() - 3600_000)
      .map((i) => ({
        id: i.id,
        scheduledAt: iso(i.scheduledAt),
        duration: i.duration,
        type: i.type,
        status: i.status,
        meetingUrl: i.meetingUrl,
        location: i.location,
        interviewerName: i.interviewer ? name(i.interviewer) : null,
        job: { id: row.job.id, title: row.job.title, organizationName: row.job.organization.name },
      })),
  };
}

export function toAuditLogDto(row: AuditRow): AuditLogDto {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    user: row.user ? { id: row.user.id, name: name(row.user) } : null,
    createdAt: iso(row.createdAt),
  };
}

export { PIPELINE_STAGES };
