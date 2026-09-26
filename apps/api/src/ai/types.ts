import type {
  EducationLevel,
  GeneratedInterviewQuestion,
  JobAnalysis,
  QuestionCategory,
  QuestionDifficulty,
  ResumeAnalysis,
} from '@hireflow/shared';
import type { CopilotToolbox } from './copilot/toolbox';

export interface ResumeInput {
  text: string;
}

export interface JobInput {
  title: string;
  description: string;
}

/**
 * Only job-relevant candidate data is passed to question generation. No name, contact details,
 * location or other personal attributes.
 */
export interface InterviewInput {
  job: {
    title: string;
    description: string;
    requirements: Array<{ skill: string; required: boolean; minimumYears: number | null }>;
  };
  candidate: {
    headline: string | null;
    summary: string | null;
    totalExperience: number | null;
    highestEducation: EducationLevel | null;
    skills: Array<{ skill: string; yearsExperience: number | null }>;
    experiences: Array<{ title: string; company: string; description: string | null }>;
    projects: Array<{ name: string; description: string | null; technologies: string[] }>;
  };
  match: { matchedSkills: string[]; missingSkills: string[]; concerns: string[] } | null;
  count: number;
  categories: QuestionCategory[];
  difficulty: QuestionDifficulty | null;
}

export interface CopilotHistoryItem {
  role: 'USER' | 'ASSISTANT';
  content: string;
}

export interface HiringQuestionInput {
  question: string;
  history: CopilotHistoryItem[];
  toolbox: CopilotToolbox;
  focusJob: { id: string; title: string } | null;
}

export interface HiringAnswer {
  answer: string;
  toolsUsed: string[];
}

/**
 * Provider-agnostic LLM contract. Business logic depends only on this interface; swapping Claude
 * for another model means adding one class. Embeddings are a separate `EmbeddingProvider`.
 */
export interface AIProvider {
  /** Stable identifier recorded next to AI-produced data (e.g. "anthropic:claude-opus-5"). */
  readonly name: string;
  /** True for the deterministic development fallback; surfaced in the UI. */
  readonly isHeuristic: boolean;
  parseResume(input: ResumeInput): Promise<ResumeAnalysis>;
  analyzeJob(input: JobInput): Promise<JobAnalysis>;
  generateInterviewQuestions(input: InterviewInput): Promise<GeneratedInterviewQuestion[]>;
  answerHiringQuestion(input: HiringQuestionInput): Promise<HiringAnswer>;
}
