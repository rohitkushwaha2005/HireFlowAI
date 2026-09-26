import type {
  ApplicationStatus,
  EducationLevel,
  JobStatus,
  QuestionCategory,
  QuestionDifficulty,
} from '@hireflow/shared';

/** JSON shapes returned by copilot tools. Shared by the tool implementations and the heuristic copilot. */

export interface CandidateSearchHit {
  candidateId: string;
  name: string;
  headline: string | null;
  totalExperience: number | null;
  topSkills: string[];
  similarity: number;
  reasons: string[];
  applications: Array<{
    applicationId: string;
    jobTitle: string;
    status: ApplicationStatus;
    score: number | null;
  }>;
}

export interface SkillCandidateHit {
  candidateId: string;
  name: string;
  headline: string | null;
  totalExperience: number | null;
  matchingSkills: Array<{ skill: string; yearsExperience: number | null }>;
  bestApplication: {
    applicationId: string;
    jobTitle: string;
    status: ApplicationStatus;
    score: number | null;
  } | null;
}

export interface MatchSummary {
  overallScore: number;
  skillsScore: number | null;
  experienceScore: number | null;
  educationScore: number | null;
  semanticScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  highlights: string[];
  concerns: string[];
}

export interface CandidateProfileSummary {
  candidateId: string;
  name: string;
  headline: string | null;
  currentRole: string | null;
  summary: string | null;
  totalExperience: number | null;
  highestEducation: EducationLevel | null;
  skills: Array<{ skill: string; yearsExperience: number | null }>;
  experience: Array<{ title: string; company: string; period: string; description: string | null }>;
  education: Array<{ degree: string | null; field: string | null; institution: string }>;
  projects: Array<{ name: string; description: string | null; technologies: string[] }>;
  certifications: string[];
  applications: Array<{
    applicationId: string;
    jobId: string;
    jobTitle: string;
    status: ApplicationStatus;
    appliedAt: string;
    match: MatchSummary | null;
  }>;
}

export interface CandidateComparison {
  job: { id: string; title: string } | null;
  sharedSkills: string[];
  candidates: Array<{
    candidateId: string;
    name: string;
    headline: string | null;
    totalExperience: number | null;
    highestEducation: EducationLevel | null;
    topSkills: string[];
    uniqueSkills: string[];
    match: (MatchSummary & { jobTitle: string; applicationId: string }) | null;
  }>;
}

export interface ApplicationSummary {
  applicationId: string;
  candidateId: string;
  name: string;
  jobId: string;
  jobTitle: string;
  status: ApplicationStatus;
  appliedAt: string;
  score: number | null;
  matchedSkills: string[];
  missingSkills: string[];
}

export interface JobSummary {
  jobId: string;
  title: string;
  status: JobStatus;
  applicationCount: number;
  requiredSkills: string[];
}

export interface PipelineSummary {
  jobTitle: string | null;
  total: number;
  stages: Array<{ status: ApplicationStatus; count: number }>;
}

export interface InterviewQuestionsResult {
  applicationId: string;
  generated: boolean;
  questions: Array<{
    category: QuestionCategory;
    difficulty: QuestionDifficulty;
    question: string;
    expectedSignals: string[];
  }>;
}
