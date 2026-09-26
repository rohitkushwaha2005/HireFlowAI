import {
  normalizeSkill,
  QUESTION_CATEGORIES,
  type GeneratedInterviewQuestion,
  type JobAnalysis,
  type ResumeAnalysis,
} from '@hireflow/shared';
import type { AppConfig } from '../config/env';
import type { Logger } from '../lib/logger';
import { AnthropicProvider } from './anthropic-provider';
import { LocalEmbeddingProvider, type EmbeddingProvider } from './embeddings';
import { HeuristicProvider } from './heuristic';
import type {
  AIProvider,
  HiringAnswer,
  HiringQuestionInput,
  InterviewInput,
  JobInput,
  ResumeInput,
} from './types';

/**
 * Facade used by services and workers. It owns the provider choice and applies post-processing
 * that must hold regardless of provider: length limits, de-duplication and sanitation of
 * AI-produced data before it can reach the database.
 */
export class AIService {
  constructor(
    readonly provider: AIProvider,
    readonly embeddings: EmbeddingProvider,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  get isHeuristic(): boolean {
    return this.provider.isHeuristic;
  }

  async parseResume(input: ResumeInput): Promise<ResumeAnalysis> {
    return sanitizeResumeAnalysis(await this.provider.parseResume(input));
  }

  async analyzeJob(input: JobInput): Promise<JobAnalysis> {
    return sanitizeJobAnalysis(await this.provider.analyzeJob(input));
  }

  async generateInterviewQuestions(input: InterviewInput): Promise<GeneratedInterviewQuestion[]> {
    const categories = input.categories.length ? input.categories : [...QUESTION_CATEGORIES];
    const questions = await this.provider.generateInterviewQuestions({ ...input, categories });
    return questions
      .filter((q) => q.question.trim().length > 10)
      .map((q) => ({
        ...q,
        question: q.question.trim().slice(0, 1000),
        rationale: q.rationale.trim().slice(0, 500),
        expectedSignals: q.expectedSignals
          .map((s) => s.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 6),
      }))
      .slice(0, input.count);
  }

  answerHiringQuestion(input: HiringQuestionInput): Promise<HiringAnswer> {
    return this.provider.answerHiringQuestion(input);
  }

  generateEmbedding(text: string): Promise<number[]> {
    return this.embeddings.embedDocuments([text]).then(([vector]) => {
      if (!vector) throw new Error('Embedding provider returned no vector');
      return vector;
    });
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }
}

const cap = (value: string | null, max: number): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const finiteOrNull = (value: number | null, min: number, max: number): number | null =>
  value !== null && Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value * 10) / 10
    : null;

export function sanitizeResumeAnalysis(analysis: ResumeAnalysis): ResumeAnalysis {
  const seen = new Set<string>();
  const skills = analysis.skills.filter((skill) => {
    const normalized = normalizeSkill(skill.name);
    if (!normalized || seen.has(normalized.key)) return false;
    seen.add(normalized.key);
    return true;
  });

  return {
    name: cap(analysis.name, 120),
    email: cap(analysis.email, 254),
    phone: cap(analysis.phone, 40),
    location: cap(analysis.location, 120),
    headline: cap(analysis.headline, 160),
    summary: cap(analysis.summary, 3000),
    currentRole: cap(analysis.currentRole, 120),
    totalExperienceYears: finiteOrNull(analysis.totalExperienceYears, 0, 60),
    skills: skills.slice(0, 80).map((s) => ({
      name: s.name.trim().slice(0, 80),
      proficiency: s.proficiency,
      yearsExperience: finiteOrNull(s.yearsExperience, 0, 50),
    })),
    workExperience: analysis.workExperience.slice(0, 30).map((w) => ({
      company: w.company.trim().slice(0, 120) || 'Unknown',
      title: w.title.trim().slice(0, 120) || 'Unknown',
      description: cap(w.description, 4000),
      startDate: cap(w.startDate, 10),
      endDate: cap(w.endDate, 10),
      current: w.current,
    })),
    education: analysis.education.slice(0, 15).map((e) => ({
      institution: e.institution.trim().slice(0, 160) || 'Unknown',
      degree: cap(e.degree, 120),
      field: cap(e.field, 120),
      level: e.level,
      startDate: cap(e.startDate, 10),
      endDate: cap(e.endDate, 10),
      grade: cap(e.grade, 40),
    })),
    projects: analysis.projects.slice(0, 20).map((p) => ({
      name: p.name.trim().slice(0, 120) || 'Project',
      description: cap(p.description, 2000),
      technologies: [...new Set(p.technologies.map((t) => t.trim()).filter(Boolean))].slice(0, 20),
      url: cap(p.url, 500),
    })),
    certifications: [...new Set(analysis.certifications.map((c) => c.trim()).filter(Boolean))]
      .map((c) => c.slice(0, 160))
      .slice(0, 30),
    links: {
      portfolio: cap(analysis.links.portfolio, 500),
      linkedin: cap(analysis.links.linkedin, 500),
      github: cap(analysis.links.github, 500),
      other: analysis.links.other
        .map((l) => l.trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 10),
    },
  };
}

export function sanitizeJobAnalysis(analysis: JobAnalysis): JobAnalysis {
  const seen = new Set<string>();
  const clean = (items: JobAnalysis['requiredSkills']) =>
    items
      .filter((item) => {
        const normalized = normalizeSkill(item.skill);
        if (!normalized || seen.has(normalized.key)) return false;
        seen.add(normalized.key);
        return true;
      })
      .map((item) => ({
        skill: item.skill.trim().slice(0, 80),
        category: item.category,
        weight: Math.min(5, Math.max(1, Math.round(item.weight))),
        minimumYears: finiteOrNull(item.minimumYears, 0, 30),
      }));

  const requiredSkills = clean(analysis.requiredSkills).slice(0, 25);
  const preferredSkills = clean(analysis.preferredSkills).slice(0, 15);
  return {
    ...analysis,
    summary: analysis.summary.trim().slice(0, 600),
    requiredSkills,
    preferredSkills,
    minYearsExperience: finiteOrNull(analysis.minYearsExperience, 0, 40),
    responsibilities: analysis.responsibilities
      .map((r) => r.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 20),
    keywords: [...new Set(analysis.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 15),
    location: cap(analysis.location, 120),
  };
}

export function createAIService(config: AppConfig['ai'], logger: Logger): AIService {
  const provider: AIProvider =
    config.provider === 'anthropic'
      ? new AnthropicProvider(config.apiKey, config.model, logger)
      : new HeuristicProvider();
  const embeddings = new LocalEmbeddingProvider(config.embeddingCacheDir);
  return new AIService(provider, embeddings);
}
