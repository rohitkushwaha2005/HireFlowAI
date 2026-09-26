import {
  fullName,
  normalizeSkill,
  PIPELINE_STAGES,
  type CopilotAnswer,
  type CopilotChatInput,
  type CopilotCandidateReference,
  type CopilotConversationDto,
  type CopilotMessageDto,
} from '@hireflow/shared';
import type { Prisma, PrismaClient } from '@hireflow/database';
import type { AIService } from '../ai/ai-service';
import type {
  CopilotToolbox,
  CopilotToolInput,
  CopilotToolName,
  RetrievedCandidate,
} from '../ai/copilot/toolbox';
import type {
  ApplicationSummary,
  CandidateComparison,
  CandidateProfileSummary,
  CandidateSearchHit,
  InterviewQuestionsResult,
  JobSummary,
  MatchSummary,
  PipelineSummary,
  SkillCandidateHit,
} from '../ai/copilot/tool-results';
import { NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { VectorRepository } from '../repositories/vector.repository';
import type { Actor } from '../types/context';
import { explainSearchHit } from './candidate.service';
import type { InterviewService } from './interview.service';

const HISTORY_TURNS = 10;

type MatchRow = {
  overallScore: number;
  skillsScore: number | null;
  experienceScore: number | null;
  educationScore: number | null;
  semanticScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  highlights: string[];
  concerns: string[];
} | null;

function matchSummary(match: MatchRow): MatchSummary | null {
  return match
    ? {
        overallScore: match.overallScore,
        skillsScore: match.skillsScore,
        experienceScore: match.experienceScore,
        educationScore: match.educationScore,
        semanticScore: match.semanticScore,
        matchedSkills: match.matchedSkills,
        missingSkills: match.missingSkills,
        highlights: match.highlights,
        concerns: match.concerns,
      }
    : null;
}

function period(start: Date | null, end: Date | null, current: boolean): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 7);
  return `${start ? fmt(start) : '?'} – ${current ? 'present' : end ? fmt(end) : '?'}`;
}

/**
 * Tenant-scoped implementation of the copilot tools. Every query is filtered to candidates who
 * applied to the actor's organization; the toolbox tracks which candidates were returned so the
 * answer's references can be verified against retrieved data.
 */
class OrganizationToolbox implements CopilotToolbox {
  private readonly retrievedMap = new Map<string, RetrievedCandidate>();
  private readonly usedTools: CopilotToolName[] = [];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AIService,
    private readonly vectors: VectorRepository,
    private readonly interviews: InterviewService,
    private readonly actor: Actor,
  ) {}

  retrieved(): RetrievedCandidate[] {
    return [...this.retrievedMap.values()];
  }

  used(): CopilotToolName[] {
    return [...new Set(this.usedTools)];
  }

  private remember(candidate: RetrievedCandidate): void {
    const existing = this.retrievedMap.get(candidate.candidateId);
    if (!existing || (existing.score === null && candidate.score !== null)) {
      this.retrievedMap.set(candidate.candidateId, candidate);
    }
  }

  private get orgApplications(): Prisma.ApplicationWhereInput {
    return { job: { organizationId: this.actor.organizationId } };
  }

  async execute<K extends CopilotToolName>(name: K, input: CopilotToolInput<K>): Promise<unknown> {
    this.usedTools.push(name);
    switch (name) {
      case 'search_candidates':
        return this.searchCandidates(input as CopilotToolInput<'search_candidates'>);
      case 'find_candidates_by_skills':
        return this.findBySkills(input as CopilotToolInput<'find_candidates_by_skills'>);
      case 'find_candidates_missing_skill':
        return this.findMissingSkill(input as CopilotToolInput<'find_candidates_missing_skill'>);
      case 'get_candidate_profile':
        return this.getProfile(input as CopilotToolInput<'get_candidate_profile'>);
      case 'compare_candidates':
        return this.compare(input as CopilotToolInput<'compare_candidates'>);
      case 'list_applications':
        return this.listApplications(input as CopilotToolInput<'list_applications'>);
      case 'list_jobs':
        return this.listJobs(input as CopilotToolInput<'list_jobs'>);
      case 'get_pipeline_summary':
        return this.pipelineSummary(input as CopilotToolInput<'get_pipeline_summary'>);
      case 'get_interview_questions':
        return this.interviewQuestions(input as CopilotToolInput<'get_interview_questions'>);
      default:
        throw new Error(`Unknown tool ${String(name)}`);
    }
  }

  private async bestApplications(candidateIds: string[], jobId?: string) {
    const apps = await this.prisma.application.findMany({
      where: {
        candidateId: { in: candidateIds },
        ...this.orgApplications,
        ...(jobId ? { jobId } : {}),
      },
      select: {
        id: true,
        candidateId: true,
        status: true,
        job: { select: { title: true } },
        match: { select: { overallScore: true } },
      },
      orderBy: [{ match: { overallScore: 'desc' } }, { appliedAt: 'desc' }],
    });
    const byCandidate = new Map<string, typeof apps>();
    for (const app of apps)
      byCandidate.set(app.candidateId, [...(byCandidate.get(app.candidateId) ?? []), app]);
    return byCandidate;
  }

  private async searchCandidates(
    input: CopilotToolInput<'search_candidates'>,
  ): Promise<CandidateSearchHit[]> {
    const vector = await this.ai.embedQuery(input.query);
    const skills = (input.skills ?? [])
      .map((s) => normalizeSkill(s)?.key)
      .filter((k): k is string => !!k);
    const { hits } = await this.vectors.searchCandidates(
      vector,
      {
        organizationId: this.actor.organizationId,
        skills,
        ...(input.jobId ? { jobId: input.jobId } : {}),
      },
      input.limit ?? 8,
    );
    const ids = hits.map((h) => h.candidateId);
    const [profiles, apps] = await Promise.all([
      this.prisma.candidateProfile.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          headline: true,
          totalExperience: true,
          user: { select: { firstName: true, lastName: true } },
          skills: {
            select: { skill: true, normalizedSkill: true, yearsExperience: true },
            orderBy: { yearsExperience: { sort: 'desc', nulls: 'last' } },
          },
          experiences: { select: { title: true, company: true, description: true }, take: 5 },
        },
      }),
      this.bestApplications(ids, input.jobId),
    ]);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return hits.flatMap((hit) => {
      const p = byId.get(hit.candidateId);
      if (!p) return [];
      const candidateApps = apps.get(p.id) ?? [];
      const name = fullName(p.user);
      const best = candidateApps[0];
      this.remember({
        candidateId: p.id,
        name,
        applicationId: best?.id ?? null,
        jobTitle: best?.job.title ?? null,
        score: best?.match?.overallScore ?? null,
      });
      return [
        {
          candidateId: p.id,
          name,
          headline: p.headline,
          totalExperience: p.totalExperience,
          topSkills: p.skills.slice(0, 8).map((s) => s.skill),
          similarity: Math.round(hit.similarity * 1000) / 1000,
          reasons: explainSearchHit(input.query, p),
          applications: candidateApps.map((a) => ({
            applicationId: a.id,
            jobTitle: a.job.title,
            status: a.status,
            score: a.match?.overallScore ?? null,
          })),
        },
      ];
    });
  }

  private async findBySkills(
    input: CopilotToolInput<'find_candidates_by_skills'>,
  ): Promise<SkillCandidateHit[]> {
    const keys = [
      ...new Set(input.skills.map((s) => normalizeSkill(s)?.key).filter((k): k is string => !!k)),
    ];
    if (keys.length === 0) return [];
    const mode = input.mode ?? 'all';
    const skillFilter = (key: string): Prisma.CandidateProfileWhereInput => ({
      skills: {
        some: {
          normalizedSkill: key,
          ...(input.minYears !== undefined ? { yearsExperience: { gte: input.minYears } } : {}),
        },
      },
    });
    const profiles = await this.prisma.candidateProfile.findMany({
      where: {
        applications: {
          some: { ...this.orgApplications, ...(input.jobId ? { jobId: input.jobId } : {}) },
        },
        ...(mode === 'all' ? { AND: keys.map(skillFilter) } : { OR: keys.map(skillFilter) }),
      },
      select: {
        id: true,
        headline: true,
        totalExperience: true,
        user: { select: { firstName: true, lastName: true } },
        skills: {
          where: { normalizedSkill: { in: keys } },
          select: { skill: true, yearsExperience: true },
        },
      },
      take: 50,
    });
    const apps = await this.bestApplications(
      profiles.map((p) => p.id),
      input.jobId,
    );
    const ranked = profiles
      .map((p) => ({ p, years: p.skills.reduce((sum, s) => sum + (s.yearsExperience ?? 0), 0) }))
      .sort((a, b) => b.years - a.years || (b.p.totalExperience ?? 0) - (a.p.totalExperience ?? 0))
      .slice(0, input.limit ?? 10);
    return ranked.map(({ p }) => {
      const best = apps.get(p.id)?.[0];
      const name = fullName(p.user);
      this.remember({
        candidateId: p.id,
        name,
        applicationId: best?.id ?? null,
        jobTitle: best?.job.title ?? null,
        score: best?.match?.overallScore ?? null,
      });
      return {
        candidateId: p.id,
        name,
        headline: p.headline,
        totalExperience: p.totalExperience,
        matchingSkills: p.skills,
        bestApplication: best
          ? {
              applicationId: best.id,
              jobTitle: best.job.title,
              status: best.status,
              score: best.match?.overallScore ?? null,
            }
          : null,
      };
    });
  }

  private async findMissingSkill(input: CopilotToolInput<'find_candidates_missing_skill'>) {
    const normalized = normalizeSkill(input.skill);
    if (!normalized) return { skill: input.skill, candidates: [] };
    const apps = await this.prisma.application.findMany({
      where: {
        ...this.orgApplications,
        ...(input.jobId ? { jobId: input.jobId } : {}),
        status: { notIn: ['WITHDRAWN', 'REJECTED'] },
        candidate: { skills: { none: { normalizedSkill: normalized.key } } },
      },
      select: {
        id: true,
        status: true,
        candidateId: true,
        job: { select: { title: true } },
        match: { select: { overallScore: true } },
        candidate: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ match: { overallScore: 'desc' } }],
      take: input.limit ?? 15,
    });
    return {
      skill: normalized.name,
      candidates: apps.map((a) => {
        const name = fullName(a.candidate.user);
        this.remember({
          candidateId: a.candidateId,
          name,
          applicationId: a.id,
          jobTitle: a.job.title,
          score: a.match?.overallScore ?? null,
        });
        return {
          candidateId: a.candidateId,
          name,
          applicationId: a.id,
          jobTitle: a.job.title,
          status: a.status,
          score: a.match?.overallScore ?? null,
        };
      }),
    };
  }

  private async getProfile(
    input: CopilotToolInput<'get_candidate_profile'>,
  ): Promise<CandidateProfileSummary | { error: string }> {
    if (!input.candidateId && !input.name) return { error: 'Provide candidateId or name' };
    const nameParts = input.name?.trim().split(/\s+/).filter(Boolean) ?? [];
    const profile = await this.prisma.candidateProfile.findFirst({
      where: {
        applications: { some: this.orgApplications },
        ...(input.candidateId ? { id: input.candidateId } : {}),
        ...(nameParts.length
          ? {
              AND: nameParts.map((part) => ({
                user: {
                  OR: [
                    { firstName: { contains: part, mode: 'insensitive' as const } },
                    { lastName: { contains: part, mode: 'insensitive' as const } },
                  ],
                },
              })),
            }
          : {}),
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        skills: { orderBy: { yearsExperience: { sort: 'desc', nulls: 'last' } } },
        experiences: { orderBy: { startDate: { sort: 'desc', nulls: 'last' } } },
        education: true,
        projects: true,
        applications: {
          where: this.orgApplications,
          include: { job: { select: { id: true, title: true } }, match: true },
          orderBy: { appliedAt: 'desc' },
        },
      },
    });
    if (!profile)
      return { error: 'No candidate with that id or name has applied to this organization' };
    const name = fullName(profile.user);
    const best = [...profile.applications].sort(
      (a, b) => (b.match?.overallScore ?? -1) - (a.match?.overallScore ?? -1),
    )[0];
    this.remember({
      candidateId: profile.id,
      name,
      applicationId: best?.id ?? null,
      jobTitle: best?.job.title ?? null,
      score: best?.match?.overallScore ?? null,
    });
    return {
      candidateId: profile.id,
      name,
      headline: profile.headline,
      currentRole: profile.currentRole,
      summary: profile.summary,
      totalExperience: profile.totalExperience,
      highestEducation: profile.highestEducation,
      skills: profile.skills.map((s) => ({ skill: s.skill, yearsExperience: s.yearsExperience })),
      experience: profile.experiences.map((e) => ({
        title: e.title,
        company: e.company,
        period: period(e.startDate, e.endDate, e.current),
        description: e.description?.slice(0, 600) ?? null,
      })),
      education: profile.education.map((e) => ({
        degree: e.degree,
        field: e.field,
        institution: e.institution,
      })),
      projects: profile.projects.map((p) => ({
        name: p.name,
        description: p.description?.slice(0, 400) ?? null,
        technologies: p.technologies,
      })),
      certifications: profile.certifications,
      applications: profile.applications.map((a) => ({
        applicationId: a.id,
        jobId: a.job.id,
        jobTitle: a.job.title,
        status: a.status,
        appliedAt: a.appliedAt.toISOString(),
        match: matchSummary(a.match),
      })),
    };
  }

  private async compare(
    input: CopilotToolInput<'compare_candidates'>,
  ): Promise<CandidateComparison> {
    const job = input.jobId
      ? await this.prisma.job.findFirst({
          where: { id: input.jobId, organizationId: this.actor.organizationId },
          select: { id: true, title: true },
        })
      : null;
    const profiles = await this.prisma.candidateProfile.findMany({
      where: { id: { in: input.candidateIds }, applications: { some: this.orgApplications } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        skills: { orderBy: { yearsExperience: { sort: 'desc', nulls: 'last' } } },
        applications: {
          where: { ...this.orgApplications, ...(job ? { jobId: job.id } : {}) },
          include: { job: { select: { title: true } }, match: true },
          orderBy: { match: { overallScore: 'desc' } },
        },
      },
    });
    const skillSets = profiles.map((p) => new Set(p.skills.map((s) => s.skill)));
    const shared = profiles[0]
      ? [...skillSets[0]!].filter((s) => skillSets.every((set) => set.has(s)))
      : [];
    return {
      job,
      sharedSkills: shared,
      candidates: profiles.map((p, i) => {
        const name = fullName(p.user);
        const best = p.applications[0];
        this.remember({
          candidateId: p.id,
          name,
          applicationId: best?.id ?? null,
          jobTitle: best?.job.title ?? null,
          score: best?.match?.overallScore ?? null,
        });
        const others = skillSets.filter((_, j) => j !== i);
        return {
          candidateId: p.id,
          name,
          headline: p.headline,
          totalExperience: p.totalExperience,
          highestEducation: p.highestEducation,
          topSkills: p.skills
            .slice(0, 10)
            .map((s) => (s.yearsExperience ? `${s.skill} (${s.yearsExperience}y)` : s.skill)),
          uniqueSkills: p.skills
            .map((s) => s.skill)
            .filter((s) => others.every((set) => !set.has(s)))
            .slice(0, 8),
          match: best?.match
            ? { ...matchSummary(best.match)!, jobTitle: best.job.title, applicationId: best.id }
            : null,
        };
      }),
    };
  }

  private async listApplications(
    input: CopilotToolInput<'list_applications'>,
  ): Promise<ApplicationSummary[]> {
    const apps = await this.prisma.application.findMany({
      where: {
        ...this.orgApplications,
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...(input.status?.length ? { status: { in: input.status } } : {}),
        ...(input.minScore !== undefined
          ? { match: { overallScore: { gte: input.minScore } } }
          : {}),
      },
      include: {
        job: { select: { id: true, title: true } },
        match: { select: { overallScore: true, matchedSkills: true, missingSkills: true } },
        candidate: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ match: { overallScore: 'desc' } }, { appliedAt: 'desc' }],
      take: input.limit ?? 20,
    });
    return apps.map((a) => {
      const name = fullName(a.candidate.user);
      this.remember({
        candidateId: a.candidate.id,
        name,
        applicationId: a.id,
        jobTitle: a.job.title,
        score: a.match?.overallScore ?? null,
      });
      return {
        applicationId: a.id,
        candidateId: a.candidate.id,
        name,
        jobId: a.job.id,
        jobTitle: a.job.title,
        status: a.status,
        appliedAt: a.appliedAt.toISOString(),
        score: a.match?.overallScore ?? null,
        matchedSkills: a.match?.matchedSkills ?? [],
        missingSkills: a.match?.missingSkills ?? [],
      };
    });
  }

  private async listJobs(input: CopilotToolInput<'list_jobs'>): Promise<JobSummary[]> {
    const jobs = await this.prisma.job.findMany({
      where: {
        organizationId: this.actor.organizationId,
        ...(input.status?.length ? { status: { in: input.status } } : {}),
      },
      include: {
        _count: { select: { applications: true } },
        requirements: { where: { required: true }, select: { skill: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return jobs.map((j) => ({
      jobId: j.id,
      title: j.title,
      status: j.status,
      applicationCount: j._count.applications,
      requiredSkills: j.requirements.map((r) => r.skill),
    }));
  }

  private async pipelineSummary(
    input: CopilotToolInput<'get_pipeline_summary'>,
  ): Promise<PipelineSummary> {
    const job = input.jobId
      ? await this.prisma.job.findFirst({
          where: { id: input.jobId, organizationId: this.actor.organizationId },
          select: { title: true },
        })
      : null;
    const groups = await this.prisma.application.groupBy({
      by: ['status'],
      where: { ...this.orgApplications, ...(input.jobId ? { jobId: input.jobId } : {}) },
      _count: { _all: true },
    });
    const counts = new Map(groups.map((g) => [g.status, g._count._all]));
    return {
      jobTitle: job?.title ?? null,
      total: groups.reduce((sum, g) => sum + g._count._all, 0),
      stages: [...PIPELINE_STAGES, 'WITHDRAWN' as const].map((status) => ({
        status,
        count: counts.get(status) ?? 0,
      })),
    };
  }

  private async interviewQuestions(
    input: CopilotToolInput<'get_interview_questions'>,
  ): Promise<InterviewQuestionsResult> {
    let questions = await this.interviews.listQuestions(
      this.actor.organizationId,
      input.applicationId,
    );
    let generated = false;
    if (questions.length === 0 && input.generateIfMissing) {
      questions = await this.interviews.generateQuestions(this.actor, input.applicationId, {
        count: 8,
      });
      generated = true;
    }
    return {
      applicationId: input.applicationId,
      generated,
      questions: questions.map((q) => ({
        category: q.category,
        difficulty: q.difficulty,
        question: q.question,
        expectedSignals: q.expectedSignals,
      })),
    };
  }
}

/**
 * Keeps only references to candidates that were (a) retrieved by a tool this turn and (b) actually
 * named in the answer. This is the final guard against the answer citing anyone not in the data.
 */
export function verifyReferences(
  answer: string,
  retrieved: RetrievedCandidate[],
): CopilotCandidateReference[] {
  const text = answer.toLowerCase();
  return retrieved
    .filter((c) => text.includes(c.name.toLowerCase()))
    .map((c) => ({
      candidateId: c.candidateId,
      name: c.name,
      applicationId: c.applicationId,
      jobTitle: c.jobTitle,
      score: c.score,
    }));
}

export class CopilotService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AIService,
    private readonly vectors: VectorRepository,
    private readonly interviews: InterviewService,
    private readonly logger: Logger,
  ) {}

  async chat(actor: Actor, input: CopilotChatInput): Promise<CopilotAnswer> {
    const conversation = input.conversationId
      ? await this.prisma.copilotConversation.findFirst({
          where: {
            id: input.conversationId,
            organizationId: actor.organizationId,
            userId: actor.userId,
          },
        })
      : await this.prisma.copilotConversation.create({
          data: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            title: input.message.slice(0, 80),
          },
        });
    if (!conversation) throw new NotFoundError('Conversation');

    const focusJob = input.jobId
      ? await this.prisma.job.findFirst({
          where: { id: input.jobId, organizationId: actor.organizationId },
          select: { id: true, title: true },
        })
      : null;

    const previous = await this.prisma.copilotMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TURNS * 2,
      select: { role: true, content: true },
    });

    await this.prisma.copilotMessage.create({
      data: { conversationId: conversation.id, role: 'USER', content: input.message },
    });

    const toolbox = new OrganizationToolbox(
      this.prisma,
      this.ai,
      this.vectors,
      this.interviews,
      actor,
    );
    const started = Date.now();
    const result = await this.ai.answerHiringQuestion({
      question: input.message,
      history: previous.reverse(),
      toolbox,
      focusJob,
    });
    const references = verifyReferences(result.answer, toolbox.retrieved());

    const message = await this.prisma.copilotMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: result.answer,
        references: references as unknown as Prisma.InputJsonValue,
        toolsUsed: result.toolsUsed,
        provider: this.ai.providerName,
      },
    });
    await this.prisma.copilotConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    this.logger.info(
      {
        conversationId: conversation.id,
        tools: result.toolsUsed,
        references: references.length,
        durationMs: Date.now() - started,
      },
      'Copilot answered',
    );

    return {
      conversationId: conversation.id,
      messageId: message.id,
      answer: result.answer,
      references,
      toolsUsed: result.toolsUsed,
      provider: this.ai.providerName,
    };
  }

  async listConversations(actor: Actor): Promise<CopilotConversationDto[]> {
    const rows = await this.prisma.copilotConversation.findMany({
      where: { organizationId: actor.organizationId, userId: actor.userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async messages(actor: Actor, conversationId: string): Promise<CopilotMessageDto[]> {
    const conversation = await this.prisma.copilotConversation.findFirst({
      where: { id: conversationId, organizationId: actor.organizationId, userId: actor.userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundError('Conversation');
    return conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      references: (m.references as unknown as CopilotMessageDto['references'] | null) ?? [],
      toolsUsed: m.toolsUsed,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async deleteConversation(actor: Actor, conversationId: string): Promise<void> {
    const deleted = await this.prisma.copilotConversation.deleteMany({
      where: { id: conversationId, organizationId: actor.organizationId, userId: actor.userId },
    });
    if (deleted.count === 0) throw new NotFoundError('Conversation');
  }
}
