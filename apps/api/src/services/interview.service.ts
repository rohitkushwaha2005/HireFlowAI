import {
  buildPagination,
  QUESTION_CATEGORIES,
  type CandidateInterviewDto,
  type CreateInterviewInput,
  type GenerateQuestionsInput,
  type InterviewDto,
  type InterviewListQuery,
  type InterviewQuestionDto,
  type Paginated,
  type UpdateInterviewInput,
  createInterviewSchema,
  generateQuestionsSchema,
  updateInterviewSchema,
} from '@hireflow/shared';
import type { Prisma, PrismaClient } from '@hireflow/database';
import type { AIService } from '../ai/ai-service';
import type { AppConfig } from '../config/env';
import { InvalidStateError, NotFoundError, ValidationError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { emailJob, type JobDispatcher } from '../jobs/definitions';
import { toCandidateInterviewDto, toInterviewDto, toQuestionDto } from '../mappers';
import { interviewInclude } from '../repositories/includes';
import type { Actor } from '../types/context';
import type { AuditService } from './audit.service';

const REMINDER_WINDOW_MS = 24 * 3600_000;
/** Earlier stages that are automatically advanced to INTERVIEW when an interview is scheduled. */
const PRE_INTERVIEW = ['APPLIED', 'SCREENING', 'SHORTLISTED'] as const;

function formatWhen(date: Date): string {
  return `${date.toUTCString().replace(/:\d\d GMT$/, '')} UTC`;
}

export class InterviewService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AIService,
    private readonly audit: AuditService,
    private readonly dispatcher: JobDispatcher,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  private async applicationInOrg(organizationId: string, applicationId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, job: { organizationId } },
      include: {
        job: { include: { requirements: { orderBy: { position: 'asc' } }, organization: { select: { name: true } } } },
        candidate: {
          include: {
            user: { select: { email: true, firstName: true } },
            skills: { orderBy: { yearsExperience: { sort: 'desc', nulls: 'last' } } },
            experiences: { orderBy: { startDate: { sort: 'desc', nulls: 'last' } } },
            projects: true,
          },
        },
        match: true,
      },
    });
    if (!app) throw new NotFoundError('Application');
    return app;
  }

  async create(actor: Actor, raw: CreateInterviewInput): Promise<InterviewDto> {
    const input = createInterviewSchema.parse(raw);
    const app = await this.applicationInOrg(actor.organizationId, input.applicationId);
    if (['REJECTED', 'WITHDRAWN', 'HIRED'].includes(app.status)) {
      throw new InvalidStateError(`Cannot schedule an interview for a ${app.status.toLowerCase()} application`);
    }
    const interviewer = await this.prisma.organizationMember.findFirst({
      where: { organizationId: actor.organizationId, userId: input.interviewerId },
    });
    if (!interviewer) throw new ValidationError('The interviewer must be a member of your organization');

    const interview = await this.prisma.$transaction(async (tx) => {
      const created = await tx.interview.create({
        data: {
          applicationId: app.id,
          interviewerId: input.interviewerId,
          scheduledAt: input.scheduledAt,
          duration: input.duration,
          type: input.type,
          meetingUrl: input.meetingUrl ?? null,
          location: input.location ?? null,
          notes: input.notes ?? null,
        },
        include: interviewInclude,
      });
      if ((PRE_INTERVIEW as readonly string[]).includes(app.status)) {
        await tx.application.update({ where: { id: app.id }, data: { status: 'INTERVIEW' } });
        await tx.applicationStatusEvent.create({
          data: { applicationId: app.id, fromStatus: app.status, toStatus: 'INTERVIEW', note: 'Interview scheduled', changedById: actor.userId },
        });
        await this.audit.record(
          actor,
          { action: 'APPLICATION_STATUS_CHANGED', entityType: 'Application', entityId: app.id, metadata: { from: app.status, to: 'INTERVIEW' } },
          tx,
        );
      }
      await this.audit.record(
        actor,
        {
          action: 'INTERVIEW_CREATED',
          entityType: 'Interview',
          entityId: created.id,
          metadata: { applicationId: app.id, scheduledAt: input.scheduledAt.toISOString(), type: input.type },
        },
        tx,
      );
      return created;
    });

    await this.dispatcher.dispatch(
      'email.send',
      emailJob(app.candidate.user.email, 'interviewScheduled', {
        firstName: app.candidate.user.firstName,
        jobTitle: app.job.title,
        organizationName: app.job.organization.name,
        when: formatWhen(interview.scheduledAt),
        duration: interview.duration,
        type: interview.type,
        meetingUrl: interview.meetingUrl,
        location: interview.location,
        url: `${this.config.webUrl}/portal/interviews`,
      }),
    );
    return toInterviewDto(interview);
  }

  async update(actor: Actor, id: string, raw: UpdateInterviewInput): Promise<InterviewDto> {
    const input = updateInterviewSchema.parse(raw);
    const existing = await this.prisma.interview.findFirst({
      where: { id, application: { job: { organizationId: actor.organizationId } } },
    });
    if (!existing) throw new NotFoundError('Interview');
    if (input.interviewerId) {
      const member = await this.prisma.organizationMember.findFirst({
        where: { organizationId: actor.organizationId, userId: input.interviewerId },
      });
      if (!member) throw new ValidationError('The interviewer must be a member of your organization');
    }
    const data: Prisma.InterviewUncheckedUpdateInput = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    );
    if (input.scheduledAt && input.scheduledAt.getTime() !== existing.scheduledAt.getTime()) data.reminderSentAt = null;

    const interview = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.interview.update({ where: { id }, data, include: interviewInclude });
      await this.audit.record(
        actor,
        { action: 'INTERVIEW_UPDATED', entityType: 'Interview', entityId: id, metadata: { fields: Object.keys(data) } },
        tx,
      );
      return updated;
    });
    return toInterviewDto(interview);
  }

  async list(organizationId: string, userId: string, query: InterviewListQuery): Promise<Paginated<InterviewDto>> {
    const where: Prisma.InterviewWhereInput = {
      application: { job: { organizationId } },
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.upcoming ? { scheduledAt: { gte: new Date(Date.now() - 3600_000) } } : {}),
      ...(query.mine ? { interviewerId: userId } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.interview.count({ where }),
      this.prisma.interview.findMany({
        where,
        include: interviewInclude,
        orderBy: { scheduledAt: query.upcoming ? 'asc' : 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toInterviewDto), pagination: buildPagination(query.page, query.pageSize, total) };
  }

  async listForCandidate(userId: string): Promise<CandidateInterviewDto[]> {
    const rows = await this.prisma.interview.findMany({
      where: { application: { candidate: { userId } }, status: { in: ['SCHEDULED', 'COMPLETED'] } },
      include: interviewInclude,
      orderBy: { scheduledAt: 'desc' },
    });
    return rows.map(toCandidateInterviewDto);
  }

  // ── AI interview questions ────────────────────────────────────────────────

  async listQuestions(organizationId: string, applicationId: string): Promise<InterviewQuestionDto[]> {
    await this.applicationInOrg(organizationId, applicationId);
    const questions = await this.prisma.interviewQuestion.findMany({
      where: { applicationId },
      orderBy: { position: 'asc' },
    });
    return questions.map(toQuestionDto);
  }

  /**
   * Generates candidate-specific questions from job-relevant data only (skills, experience,
   * projects, requirements, match gaps). Personal attributes are never sent to the model.
   */
  async generateQuestions(actor: Actor, applicationId: string, raw: GenerateQuestionsInput): Promise<InterviewQuestionDto[]> {
    const input = generateQuestionsSchema.parse(raw);
    const app = await this.applicationInOrg(actor.organizationId, applicationId);
    const questions = await this.ai.generateInterviewQuestions({
      job: {
        title: app.job.title,
        description: app.job.description.slice(0, 6000),
        requirements: app.job.requirements.map((r) => ({ skill: r.skill, required: r.required, minimumYears: r.minimumYears })),
      },
      candidate: {
        headline: app.candidate.headline,
        summary: app.candidate.summary,
        totalExperience: app.candidate.totalExperience,
        highestEducation: app.candidate.highestEducation,
        skills: app.candidate.skills.slice(0, 40).map((s) => ({ skill: s.skill, yearsExperience: s.yearsExperience })),
        experiences: app.candidate.experiences.slice(0, 8).map((e) => ({ title: e.title, company: e.company, description: e.description?.slice(0, 1200) ?? null })),
        projects: app.candidate.projects.slice(0, 6).map((p) => ({ name: p.name, description: p.description?.slice(0, 800) ?? null, technologies: p.technologies })),
      },
      match: app.match
        ? { matchedSkills: app.match.matchedSkills, missingSkills: app.match.missingSkills, concerns: app.match.concerns }
        : null,
      count: input.count,
      categories: input.categories ?? [...QUESTION_CATEGORIES],
      difficulty: input.difficulty ?? null,
    });

    await this.prisma.$transaction(async (tx) => {
      const offset = input.replace ? 0 : await tx.interviewQuestion.count({ where: { applicationId } });
      if (input.replace) await tx.interviewQuestion.deleteMany({ where: { applicationId } });
      await tx.interviewQuestion.createMany({
        data: questions.map((q, i) => ({
          applicationId,
          category: q.category,
          difficulty: q.difficulty,
          question: q.question,
          expectedSignals: q.expectedSignals,
          rationale: q.rationale,
          aiProvider: this.ai.providerName,
          position: offset + i,
        })),
      });
      await this.audit.record(
        actor,
        {
          action: 'INTERVIEW_QUESTIONS_GENERATED',
          entityType: 'Application',
          entityId: applicationId,
          metadata: { count: questions.length, provider: this.ai.providerName },
        },
        tx,
      );
    });
    return this.listQuestions(actor.organizationId, applicationId);
  }

  // ── Scheduled job ─────────────────────────────────────────────────────────

  async sendReminders(): Promise<number> {
    const due = await this.prisma.interview.findMany({
      where: {
        status: 'SCHEDULED',
        reminderSentAt: null,
        scheduledAt: { gte: new Date(), lte: new Date(Date.now() + REMINDER_WINDOW_MS) },
      },
      include: interviewInclude,
    });
    for (const interview of due) {
      const candidate = interview.application.candidate.user;
      await this.dispatcher.dispatch(
        'email.send',
        emailJob(candidate.email, 'interviewReminder', {
          firstName: candidate.firstName,
          jobTitle: interview.application.job.title,
          when: formatWhen(interview.scheduledAt),
          meetingUrl: interview.meetingUrl,
          url: `${this.config.webUrl}/portal/interviews`,
        }),
      );
      await this.prisma.interview.update({ where: { id: interview.id }, data: { reminderSentAt: new Date() } });
    }
    if (due.length) this.logger.info({ count: due.length }, 'Interview reminders queued');
    return due.length;
  }
}
