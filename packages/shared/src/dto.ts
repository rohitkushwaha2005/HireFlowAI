/**
 * Response DTOs — the JSON shapes the API returns. Dates are ISO-8601 strings on the wire.
 * Server mappers (`apps/api/src/mappers`) are typed against these, so API and client agree.
 */
import type {
  AnalysisStatus,
  ApplicationSource,
  ApplicationStatus,
  AuditAction,
  EducationLevel,
  EmploymentType,
  ExperienceLevel,
  InterviewStatus,
  InterviewType,
  JobStatus,
  OrgRole,
  ParsingStatus,
  Proficiency,
  QuestionCategory,
  QuestionDifficulty,
  RemoteType,
  RequirementCategory,
  SkillSource,
  UserRole,
} from './enums';
import type { MatchingWeights, RequirementBreakdown } from './matching/scoring';
import type { Permission } from './permissions';

export type ISODate = string;

// ── Auth / users ──────────────────────────────────────────────────────────────
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: ISODate;
}

export interface MembershipDto {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
  permissions: Permission[];
}

export interface SessionDto {
  user: UserDto;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  memberships: MembershipDto[];
  candidateProfileId: string | null;
}

export interface MeDto {
  user: UserDto;
  memberships: MembershipDto[];
  candidateProfileId: string | null;
}

export interface AuthConfigDto {
  googleEnabled: boolean;
  aiProvider: string;
  aiIsHeuristic: boolean;
}

// ── Organizations ─────────────────────────────────────────────────────────────
export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  matchingWeights: MatchingWeights;
  createdAt: ISODate;
}

export interface MemberDto {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: OrgRole;
  emailVerified: boolean;
  joinedAt: ISODate;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────
export interface JobRequirementDto {
  id: string;
  skill: string;
  normalizedSkill: string;
  category: RequirementCategory;
  required: boolean;
  weight: number;
  minimumYears: number | null;
  aiGenerated: boolean;
}

export interface JobSummaryDto {
  id: string;
  title: string;
  slug: string;
  status: JobStatus;
  location: string | null;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  remoteType: RemoteType;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  publishedAt: ISODate | null;
  closedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  applicationCount: number;
  newApplicationCount: number;
  createdBy: { id: string; name: string } | null;
}

export interface JobDetailDto extends JobSummaryDto {
  description: string;
  responsibilities: string[];
  minYearsExperience: number | null;
  educationLevel: EducationLevel | null;
  requirements: JobRequirementDto[];
  analysisStatus: AnalysisStatus;
  analysisSummary: string | null;
  keywords: string[];
  analyzedAt: ISODate | null;
  pipeline: Record<ApplicationStatus, number>;
}

export interface PublicJobDto {
  id: string;
  title: string;
  slug: string;
  location: string | null;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  remoteType: RemoteType;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  publishedAt: ISODate | null;
  organization: { name: string; slug: string; logoUrl: string | null };
  skills: string[];
}

export interface PublicJobDetailDto extends PublicJobDto {
  description: string;
  responsibilities: string[];
  minYearsExperience: number | null;
  educationLevel: EducationLevel | null;
  requirements: Array<Pick<JobRequirementDto, 'skill' | 'required' | 'minimumYears' | 'category'>>;
  /** Present when the requester is a signed-in candidate who already applied. */
  viewerApplication: { id: string; status: ApplicationStatus } | null;
}

// ── Candidates ────────────────────────────────────────────────────────────────
export interface CandidateSkillDto {
  id: string;
  skill: string;
  normalizedSkill: string;
  proficiency: Proficiency | null;
  yearsExperience: number | null;
  source: SkillSource;
}

export interface WorkExperienceDto {
  id: string;
  company: string;
  title: string;
  description: string | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
  current: boolean;
}

export interface EducationDto {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  level: EducationLevel | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
  grade: string | null;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  technologies: string[];
  url: string | null;
}

export interface ResumeDto {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  parsingStatus: ParsingStatus;
  parsingError: string | null;
  parsedAt: ISODate | null;
  isPrimary: boolean;
  createdAt: ISODate;
  aiProvider: string | null;
}

export interface CandidateProfileDto {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  phone: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  totalExperience: number | null;
  currentRole: string | null;
  highestEducation: EducationLevel | null;
  certifications: string[];
  skills: CandidateSkillDto[];
  experiences: WorkExperienceDto[];
  education: EducationDto[];
  projects: ProjectDto[];
  resumes: ResumeDto[];
  profileCompleteness: number;
  updatedAt: ISODate;
}

export interface CandidateListItemDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  headline: string | null;
  currentRole: string | null;
  location: string | null;
  totalExperience: number | null;
  topSkills: string[];
  applicationCount: number;
  latestApplication: {
    id: string;
    jobId: string;
    jobTitle: string;
    status: ApplicationStatus;
    overallScore: number | null;
    appliedAt: ISODate;
  } | null;
  /** Semantic search only: cosine similarity 0–1 and reasons derived from data. */
  similarity: number | null;
  matchReasons: string[];
  createdAt: ISODate;
}

export interface CandidateDetailDto {
  profile: CandidateProfileDto;
  applications: ApplicationListItemDto[];
  interviews: InterviewDto[];
}

// ── Applications / matching ──────────────────────────────────────────────────
export interface MatchDto {
  id: string;
  applicationId: string;
  overallScore: number;
  skillsScore: number | null;
  experienceScore: number | null;
  educationScore: number | null;
  semanticScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
  highlights: string[];
  concerns: string[];
  requirements: RequirementBreakdown[];
  weights: MatchingWeights;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ApplicationListItemDto {
  id: string;
  status: ApplicationStatus;
  source: ApplicationSource;
  appliedAt: ISODate;
  updatedAt: ISODate;
  job: { id: string; title: string; slug: string; status: JobStatus };
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    headline: string | null;
    currentRole: string | null;
    totalExperience: number | null;
  };
  overallScore: number | null;
  matchStatus: 'PENDING' | 'READY' | 'UNAVAILABLE';
  resumeParsingStatus: ParsingStatus | null;
  interviewCount: number;
}

export interface ApplicationNoteDto {
  id: string;
  body: string;
  author: { id: string; name: string };
  createdAt: ISODate;
}

export interface ApplicationStatusEventDto {
  id: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  note: string | null;
  changedBy: { id: string; name: string } | null;
  createdAt: ISODate;
}

export interface ApplicationDetailDto extends ApplicationListItemDto {
  coverLetter: string | null;
  resume: ResumeDto | null;
  match: MatchDto | null;
  notes: ApplicationNoteDto[];
  history: ApplicationStatusEventDto[];
  interviews: InterviewDto[];
  questions: InterviewQuestionDto[];
}

/** Candidate-facing view: no scores, notes or internal data. */
export interface CandidateApplicationDto {
  id: string;
  status: ApplicationStatus;
  appliedAt: ISODate;
  updatedAt: ISODate;
  job: {
    id: string;
    title: string;
    slug: string;
    status: JobStatus;
    location: string | null;
    remoteType: RemoteType;
    organization: { name: string; logoUrl: string | null };
  };
  resume: { id: string; fileName: string } | null;
  history: Array<{ status: ApplicationStatus; at: ISODate }>;
  upcomingInterviews: CandidateInterviewDto[];
}

export interface PipelineCardDto {
  id: string;
  status: ApplicationStatus;
  appliedAt: ISODate;
  updatedAt: ISODate;
  candidate: { id: string; firstName: string; lastName: string; headline: string | null };
  job: { id: string; title: string };
  overallScore: number | null;
  matchedSkills: string[];
  interviewCount: number;
}

export interface PipelineDto {
  columns: Array<{ status: ApplicationStatus; cards: PipelineCardDto[]; total: number }>;
}

// ── Interviews ────────────────────────────────────────────────────────────────
export interface InterviewDto {
  id: string;
  applicationId: string;
  scheduledAt: ISODate;
  duration: number;
  type: InterviewType;
  status: InterviewStatus;
  meetingUrl: string | null;
  location: string | null;
  notes: string | null;
  feedback: string | null;
  rating: number | null;
  interviewer: { id: string; name: string; email: string } | null;
  candidate: { id: string; firstName: string; lastName: string };
  job: { id: string; title: string };
  createdAt: ISODate;
}

export interface CandidateInterviewDto {
  id: string;
  scheduledAt: ISODate;
  duration: number;
  type: InterviewType;
  status: InterviewStatus;
  meetingUrl: string | null;
  location: string | null;
  interviewerName: string | null;
  job: { id: string; title: string; organizationName: string };
}

export interface InterviewQuestionDto {
  id: string;
  applicationId: string;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  question: string;
  expectedSignals: string[];
  rationale: string | null;
  aiProvider: string | null;
  createdAt: ISODate;
}

// ── Audit ─────────────────────────────────────────────────────────────────────
export interface AuditLogDto {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  user: { id: string; name: string } | null;
  createdAt: ISODate;
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export interface DashboardAnalyticsDto {
  totals: {
    activeJobs: number;
    totalCandidates: number;
    applications: number;
    interviews: number;
    upcomingInterviews: number;
    hires: number;
    averageMatchScore: number | null;
  };
  applicationsOverTime: Array<{ date: string; count: number }>;
  pipeline: Array<{ status: ApplicationStatus; count: number }>;
  applicationsPerJob: Array<{ jobId: string; title: string; count: number; averageScore: number | null }>;
  topSkills: Array<{ skill: string; count: number }>;
  funnel: Array<{ stage: string; count: number; conversion: number | null }>;
  conversion: {
    applicationToInterview: number | null;
    interviewToOffer: number | null;
    offerToHire: number | null;
    applicationToHire: number | null;
  };
  scoreDistribution: Array<{ bucket: string; count: number }>;
  recentActivity: AuditLogDto[];
  generatedAt: ISODate;
}

export interface CandidateDashboardDto {
  profileCompleteness: number;
  applications: { total: number; active: number; interviews: number; offers: number };
  recentApplications: CandidateApplicationDto[];
  upcomingInterviews: CandidateInterviewDto[];
  primaryResume: ResumeDto | null;
  recommendedJobs: Array<PublicJobDto & { similarity: number | null }>;
}

// ── Copilot ───────────────────────────────────────────────────────────────────
export interface CopilotConversationDto {
  id: string;
  title: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CopilotMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  references: Array<{
    candidateId: string;
    name: string;
    applicationId: string | null;
    jobTitle: string | null;
    score: number | null;
  }>;
  toolsUsed: string[];
  createdAt: ISODate;
}
