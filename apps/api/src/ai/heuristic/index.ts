import type { GeneratedInterviewQuestion, JobAnalysis, ResumeAnalysis } from '@hireflow/shared';
import type {
  AIProvider,
  HiringAnswer,
  HiringQuestionInput,
  InterviewInput,
  JobInput,
  ResumeInput,
} from '../types';
import { answerHeuristically } from './copilot';
import { generateQuestionsHeuristically } from './interview-generator';
import { analyzeJobHeuristically } from './job-analyzer';
import { parseResumeHeuristically } from './resume-parser';

/**
 * Development fallback used when no LLM API key is configured. Deterministic and offline.
 * It is labelled "heuristic" in every API response and in the UI, and is NOT equivalent to the
 * LLM provider: extraction relies on layout conventions and copilot answers are templated.
 */
export class HeuristicProvider implements AIProvider {
  readonly name = 'heuristic';
  readonly isHeuristic = true;

  async parseResume(input: ResumeInput): Promise<ResumeAnalysis> {
    return parseResumeHeuristically(input.text);
  }

  async analyzeJob(input: JobInput): Promise<JobAnalysis> {
    return analyzeJobHeuristically(input.title, input.description);
  }

  async generateInterviewQuestions(input: InterviewInput): Promise<GeneratedInterviewQuestion[]> {
    return generateQuestionsHeuristically(input);
  }

  answerHiringQuestion(input: HiringQuestionInput): Promise<HiringAnswer> {
    return answerHeuristically(input);
  }
}
