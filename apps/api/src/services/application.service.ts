import {
  buildPagination,
  fullName,
  PIPELINE_STAGES,
  type AddApplicationNoteInput,
  type ApplicationDetailDto,
  type ApplicationListItemDto,
  type ApplicationListQuery,
  type ApplicationNoteDto,
  type ApplicationStatus,
  type AuditAction,
  type CandidateApplicationDto,
  type CreateApplicationInput,
  type Paginated,
  type PipelineDto,
  type PipelineQuery,
  type UpdateApplicationStatusInput,
} from '@hireflow/shared';
import type { Prisma, PrismaClient } from '@hireflow/database';
import type { AppConfig } from '../config/env';
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';
import { emailJob, type JobDispatcher } from '../jobs/definitions';
import {
  toApplicationDetailDto,
  toApplicationListItemDto,
  toCandidateApplicationDto,
} from '../mappers';
import {
  applicationDetailInclude,
  applicationListInclude,
  candidateApplicationInclude,
} from '../repositories/includes';
import type { Actor } from '../types/context';
import type { AuditService } from './audit.service';

/** Statuses the candidate is notified about. */
const NOTIFY_CANDIDATE: ReadonlySet<ApplicationStatus> = new Set(['SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']);
const CLOSED_STATUSES: ReadonlySet<ApplicationStatus> = new Set(['HIRED', 'REJECTED', 'WITHDRAWN']);
const PIPELINE_CARD_LIMIT = 100;

function auditActionFor(status: ApplicationStatus): AuditAction {
  if (status === 'SHORTLISTED') return 'CANDIDATE_SHORTLISTED';
  if (status === 'REJECTED') return 'CANDIDATE_REJECTED';
  return 'APPLICATION_STATUS_CHANGED';
}

export class ApplicationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly dispatcher: JobDispatcher,
    private readonly config: AppConfig,
  ) {}

  // ── Candidate side ────────────────────────────────────────────────────────

  async apply(userId: string, jobId: string, input: CreateApplicationInput): Promise<CandidateApplicationDto> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!profile) throw new ForbiddenError('Only candidates can apply to jobs');

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        organization: {
          select: {
            name: true,
            members: {
              where: { role: { in: ['OWNER', 'ADMIN', 'RECRUITER'] } },
              select: { user: { select: { email: true, firstName: true } } },
            },
          },
        },
      },
    });
    if (!job || job.status !== 'PUBLISHED') throw new NotFoundError('Job');

    const resume = await this.prisma.resume.findFirst({ where: { id: input.resumeId, candidateId: profile.id } });
    if (!resume) throw new ValidationError('Select one of your uploaded resumes');

    const existing = await this.prisma.application.findUnique({
      where: { jobId_candidateId: { jobId, candidateId: profile.id } },
    });
    if (existing && existing.status !== 'WITHDRAWN') throw new ConflictError('You have already applied to this job');

    const application = await this.prisma.$transaction(async (tx) => {
      const app = existing
        ? await tx.application.update({
            where: { id: existing.id },
            data: { status: 'APPLIED', resumeId: resume.id, coverLetter: input.coverLetter ?? null, appliedAt: new Date() },
          })
        : await tx.application.create({
            data: {
              jobId,
              candidateId: profile.id,
              resumeId: resume.id,
              coverLetter: input.coverLetter ?? null,
              source: 'JOB_BOARD',
            },
          });
      await tx.applicationStatusEvent.create({
        data: { applicationId: app.id, fromStatus: existing?.status ?? null, toStatus: 'APPLIED', changedById: userId },
      });
      return app;
    });

    // Matching runs now if the resume is already parsed; otherwise it runs after parsing.
    await this.dispatcher.dispatch('matching.application', { applicationId: application.id }, { jobId: `match-app-${application.id}-${Date.now()}` });
    await this.dispatcher.dispatch(
      'email.send',
      emailJob(profile.user.email, 'applicationReceived', {
        firstName: profile.user.firstName,
        jobTitle: job.title,
        organizationName: job.organization.name,
        url: `${this.config.webUrl}/portal/applications/${application.id}`,
      }),
    );
    for (const member of job.organization.members) {
      await this.dispatcher.dispatch(
        'email.send',
        emailJob(member.user.email, 'newApplicationForRecruiter', {
          recruiterFirstName: member.user.firstName,
          candidateName: fullName(profile.user),
          jobTitle: job.title,
          url: `${this.config.webUrl}/app/applications/${application.id}`,
        }),
      );
    }
    return this.getForCandidate(userId, application.id);
  }

  async listForCandidate(userId: string): Promise<CandidateApplicationDto[]> {
    const rows = await this.prisma.application.findMany({
      where: { candidate: { userId } },
      include: candidateApplicationInclude,
      orderBy: { appliedAt: 'desc' },
    });
    return rows.map(toCandidateApplicationDto);
  }

  async getForCandidate(userId: string, applicationId: string): Promise<CandidateApplicationDto> {
    const row = await this.prisma.application.findFirst({
      where: { id: applicationId, candidate: { userId } },
      include: candidateApplicationInclude,
    });
    if (!row) throw new NotFoundError('Application');
    return toCandidateApplicationDto(row);
  }

  async withdraw(userId: string, applicationId: string): Promise<CandidateApplicationDto> {
    const app = await this.prisma.application.findFirst({ where: { id: applicationId, candidate: { userId } } });
    if (!app) throw new NotFoundError('Application');
    if (CLOSED_STATUSES.has(app.status)) throw new InvalidStateError('This application can no longer be withdrawn');
    await this.prisma.$transaction([
      this.prisma.application.update({ where: { id: app.id }, data: { status: 'WITHDRAWN' } }),
      this.prisma.applicationStatusEvent.create({
        data: { applicationId: app.id, fromStatus: app.status, toStatus: 'WITHDRAWN', changedById: userId },
      }),
      this.prisma.interview.updateMany({
        where: { applicationId: app.id, status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      }),
    ]);
    return this.getForCandidate(userId, applicationId);
  }

  // ── Recruiter side ────────────────────────────────────────────────────────

  async list(organizationId: string, query: ApplicationListQuery): Promise<Paginated<ApplicationListItemDto>> {
    const where: Prisma.ApplicationWhereInput = {
      job: { organizationId },
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.minScore !== undefined ? { match: { overallScore: { gte: query.minScore } } } : {}),
      ...(query.search
        ? {
            OR: [
              { candidate: { user: { firstName: { contains: query.search, mode: 'insensitive' } } } },
              { candidate: { user: { lastName: { contains: query.search, mode: 'insensitive' } } } },
              { candidate: { user: { email: { contains: query.search, mode: 'insensitive' } } } },
              { candidate: { headline: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ApplicationOrderByWithRelationInput[] =
      query.sort === 'score'
        ? [{ match: { overallScore: query.order } }, { appliedAt: 'desc' }]
        : [{ [query.sort]: query.order }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        include: applicationListInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toApplicationListItemDto), pagination: buildPagination(query.page, query.pageSize, total) };
  }

  async get(organizationId: string, applicationId: string): Promise<ApplicationDetailDto> {
    const row = await this.prisma.application.findFirst({
      where: { id: applicationId, job: { organizationId } },
      include: applicationDetailInclude,
    });
    if (!row) throw new NotFoundError('Application');
    return toApplicationDetailDto(row);
  }

  async pipeline(organizationId: string, query: PipelineQuery): Promise<PipelineDto> {
    const base: Prisma.ApplicationWhereInput = { job: { organizationId }, ...(query.jobId ? { jobId: query.jobId } : {}) };
    const columns = await Promise.all(
      PIPELINE_STAGES.map(async (status) => {
        const where = { ...base, status };
        const [total, rows] = await this.prisma.$transaction([
          this.prisma.application.count({ where }),
          this.prisma.application.findMany({
            where,
            include: {
              candidate: { select: { id: true, headline: true, user: { select: { firstName: true, lastName: true } } } },
              job: { select: { id: true, title: true } },
              match: { select: { overallScore: true, matchedSkills: true } },
              _count: { select: { interviews: true } },
            },
            orderBy: [{ match: { overallScore: 'desc' } }, { appliedAt: 'desc' }],
            take: PIPELINE_CARD_LIMIT,
          }),
        ]);
        return {
          status,
          total,
          cards: rows.map((r) => ({
            id: r.id,
            status: r.status,
            appliedAt: r.appliedAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            candidate: {
              id: r.candidate.id,
              firstName: r.candidate.user.firstName,
              lastName: r.candidate.user.lastName,
              headline: r.candidate.headline,
            },
            job: r.job,
            overallScore: r.match?.overallScore ?? null,
            matchedSkills: r.match?.matchedSkills.slice(0, 3) ?? [],
            interviewCount: r._count.interviews,
          })),
        };
      }),
    );
    return { columns };
  }

  /**
   * Moves an application to another pipeline stage. The status change, the status event and the
   * audit entry commit atomically. `fromStatus` provides optimistic concurrency for the Kanban.
   * AI scores never trigger transitions — every move is a human action.
   */
  async updateStatus(actor: Actor, applicationId: string, input: UpdateApplicationStatusInput): Promise<ApplicationDetailDto> {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, job: { organizationId: actor.organizationId } },
      include: {
        job: { select: { title: true, organization: { select: { name: true } } } },
        candidate: { select: { user: { select: { email: true, firstName: true } } } },
      },
    });
    if (!app) throw new NotFoundError('Application');
    if (app.status === 'WITHDRAWN') throw new InvalidStateError('The candidate withdrew this application');
    if (input.fromStatus && input.fromStatus !== app.status) {
      throw new ConflictError('This application was moved by someone else. Refresh to see the latest state.', {
        currentStatus: app.status,
      });
    }
    if (app.status === input.status) return this.get(actor.organizationId, applicationId);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.application.updateMany({
        where: { id: app.id, status: app.status },
        data: { status: input.status },
      });
      if (updated.count !== 1) throw new ConflictError('This application was just updated. Refresh and try again.');
      await tx.applicationStatusEvent.create({
        data: {
          applicationId: app.id,
          fromStatus: app.status,
          toStatus: input.status,
          note: input.note ?? null,
          changedById: actor.userId,
        },
      });
      await this.audit.record(
        actor,
        {
          action: auditActionFor(input.status),
          entityType: 'Application',
          entityId: app.id,
          metadata: { from: app.status, to: input.status, jobTitle: app.job.title },
        },
        tx,
      );
    });

    if (NOTIFY_CANDIDATE.has(input.status)) {
      await this.dispatcher.dispatch(
        'email.send',
        {
          ...emailJob(app.candidate.user.email, 'applicationStatusUpdated', {
            firstName: app.candidate.user.firstName,
            jobTitle: app.job.title,
            organizationName: app.job.organization.name,
            status: input.status,
            url: `${this.config.webUrl}/portal/applications/${app.id}`,
          }),
          onlyIfStatus: { applicationId: app.id, status: input.status },
        },
        // Delay so an accidental drag that is immediately undone never reaches the candidate.
        { jobId: `status-email-${app.id}-${input.status}-${Date.now()}`, delayMs: this.config.isTest ? 0 : 60_000 },
      );
    }
    await this.dispatcher.dispatch('analytics.refresh', { organizationId: actor.organizationId }, { jobId: `analytics-${actor.organizationId}` });
    return this.get(actor.organizationId, applicationId);
  }

  async addNote(actor: Actor, applicationId: string, input: AddApplicationNoteInput): Promise<ApplicationNoteDto> {
    const exists = await this.prisma.application.count({ where: { id: applicationId, job: { organizationId: actor.organizationId } } });
    if (!exists) throw new NotFoundError('Application');
    const note = await this.prisma.applicationNote.create({
      data: { applicationId, authorId: actor.userId, body: input.body },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    return {
      id: note.id,
      body: note.body,
      author: { id: note.author.id, name: fullName(note.author) },
      createdAt: note.createdAt.toISOString(),
    };
  }
}
