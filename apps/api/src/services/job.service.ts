import {
  buildPagination,
  normalizeSkill,
  slugify,
  type AnalyzeJobInput,
  type ApplicationStatus,
  type AuditAction,
  type CreateJobData,
  type JobAnalysis,
  type JobDetailDto,
  type JobListQuery,
  type JobRequirementInput,
  type JobStatus,
  type JobSummaryDto,
  type JobTransition,
  type Paginated,
  type PublicJobDetailDto,
  type PublicJobDto,
  type PublicJobListQuery,
  type UpdateJobData,
} from '@hireflow/shared';
import type { Prisma, PrismaClient } from '@hireflow/database';
import type { AIService } from '../ai/ai-service';
import { randomToken } from '../lib/crypto';
import { InvalidStateError, NotFoundError, ValidationError } from '../lib/errors';
import type { JobDispatcher } from '../jobs/definitions';
import {
  emptyPipeline,
  toJobDetailDto,
  toJobSummaryDto,
  toPublicJobDetailDto,
  toPublicJobDto,
} from '../mappers';
import { jobDetailInclude, jobSummaryInclude, publicJobInclude } from '../repositories/includes';
import type { Actor, AuthContext } from '../types/context';
import type { AuditService } from './audit.service';

/** Allowed lifecycle transitions: action → (from statuses, to status, audit action). */
const TRANSITIONS: Record<JobTransition, { from: JobStatus[]; to: JobStatus; audit: AuditAction }> =
  {
    publish: { from: ['DRAFT', 'PAUSED'], to: 'PUBLISHED', audit: 'JOB_PUBLISHED' },
    pause: { from: ['PUBLISHED'], to: 'PAUSED', audit: 'JOB_PAUSED' },
    close: { from: ['DRAFT', 'PUBLISHED', 'PAUSED'], to: 'CLOSED', audit: 'JOB_CLOSED' },
    reopen: { from: ['CLOSED'], to: 'PUBLISHED', audit: 'JOB_PUBLISHED' },
  };

const RECENT_APPLICATION_MS = 7 * 86_400_000;

export interface JobAnalysisResult {
  analysis: JobAnalysis;
  provider: string;
  isHeuristic: boolean;
}

/** Normalizes, de-duplicates and orders requirements for persistence. */
export function prepareRequirements(requirements: readonly JobRequirementInput[]) {
  const seen = new Set<string>();
  const rows: Array<Omit<Prisma.JobRequirementCreateManyInput, 'jobId'>> = [];
  requirements.forEach((req) => {
    const normalized = normalizeSkill(req.skill);
    if (!normalized || seen.has(normalized.key)) return;
    seen.add(normalized.key);
    rows.push({
      skill: req.skill.trim(),
      normalizedSkill: normalized.key,
      category: req.category === 'OTHER' && normalized.known ? normalized.category : req.category,
      required: req.required,
      weight: req.weight,
      minimumYears: req.minimumYears,
      aiGenerated: req.aiGenerated,
      position: rows.length,
    });
  });
  return rows;
}

export class JobService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AIService,
    private readonly audit: AuditService,
    private readonly dispatcher: JobDispatcher,
  ) {}

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title, 60);
    for (let i = 0; i < 10; i++) {
      const suffix = randomToken(4)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 5);
      const slug = `${base}-${suffix || i}`;
      const exists = await this.prisma.job.findUnique({ where: { slug }, select: { id: true } });
      if (!exists) return slug;
    }
    return `${base}-${Date.now()}`;
  }

  private async findOwned(organizationId: string, id: string) {
    const job = await this.prisma.job.findFirst({ where: { id, organizationId } });
    if (!job) throw new NotFoundError('Job');
    return job;
  }

  private async pipelineCounts(jobId: string): Promise<Record<ApplicationStatus, number>> {
    const groups = await this.prisma.application.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    });
    const pipeline = emptyPipeline();
    for (const g of groups) pipeline[g.status] = g._count._all;
    return pipeline;
  }

  private async newApplicationCounts(jobIds: string[]): Promise<Map<string, number>> {
    if (jobIds.length === 0) return new Map();
    const groups = await this.prisma.application.groupBy({
      by: ['jobId'],
      where: {
        jobId: { in: jobIds },
        status: 'APPLIED',
        appliedAt: { gte: new Date(Date.now() - RECENT_APPLICATION_MS) },
      },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.jobId, g._count._all]));
  }

  // ── Recruiter ─────────────────────────────────────────────────────────────

  async list(organizationId: string, query: JobListQuery): Promise<Paginated<JobSummaryDto>> {
    const where: Prisma.JobWhereInput = {
      organizationId,
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, jobs] = await this.prisma.$transaction([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        include: jobSummaryInclude,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const recent = await this.newApplicationCounts(jobs.map((j) => j.id));
    return {
      items: jobs.map((job) => toJobSummaryDto(job, recent.get(job.id) ?? 0)),
      pagination: buildPagination(query.page, query.pageSize, total),
    };
  }

  async get(organizationId: string, id: string): Promise<JobDetailDto> {
    const job = await this.prisma.job.findFirst({
      where: { id, organizationId },
      include: jobDetailInclude,
    });
    if (!job) throw new NotFoundError('Job');
    const [pipeline, recent] = await Promise.all([
      this.pipelineCounts(id),
      this.newApplicationCounts([id]),
    ]);
    return toJobDetailDto(job, pipeline, recent.get(id) ?? 0);
  }

  async create(actor: Actor, data: CreateJobData): Promise<JobDetailDto> {
    const requirements = prepareRequirements(data.requirements);
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          organizationId: actor.organizationId,
          createdById: actor.userId,
          title: data.title,
          slug: await this.uniqueSlug(data.title),
          description: data.description,
          responsibilities: data.responsibilities,
          location: data.location,
          employmentType: data.employmentType,
          experienceLevel: data.experienceLevel,
          remoteType: data.remoteType,
          salaryMin: data.salaryMin,
          salaryMax: data.salaryMax,
          currency: data.currency,
          minYearsExperience: data.minYearsExperience,
          educationLevel: data.educationLevel,
          analysisSummary: data.analysisSummary,
          keywords: data.keywords,
          ...(data.analysisSummary || requirements.some((r) => r.aiGenerated)
            ? {
                analysisStatus: 'COMPLETED' as const,
                analyzedAt: new Date(),
                aiProvider: this.ai.providerName,
              }
            : {}),
          requirements: { createMany: { data: requirements } },
        },
      });
      await this.audit.record(
        actor,
        {
          action: 'JOB_CREATED',
          entityType: 'Job',
          entityId: created.id,
          metadata: { title: created.title },
        },
        tx,
      );
      return created;
    });
    await this.dispatcher.dispatch(
      'embedding.job',
      { jobId: job.id },
      { jobId: `embed-job-${job.id}-${Date.now()}` },
    );
    return this.get(actor.organizationId, job.id);
  }

  async update(actor: Actor, id: string, data: UpdateJobData): Promise<JobDetailDto> {
    const existing = await this.findOwned(actor.organizationId, id);
    if (data.salaryMin !== undefined || data.salaryMax !== undefined) {
      const min = data.salaryMin !== undefined ? data.salaryMin : existing.salaryMin;
      const max = data.salaryMax !== undefined ? data.salaryMax : existing.salaryMax;
      if (min !== null && max !== null && min > max) {
        throw new ValidationError('Maximum salary must be greater than or equal to minimum salary');
      }
    }

    const { requirements, ...fields } = data;
    const changed = Object.keys(data).filter((k) => data[k as keyof UpdateJobData] !== undefined);
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: {
          ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
          ...(data.analysisSummary
            ? {
                analysisStatus: 'COMPLETED',
                analyzedAt: new Date(),
                aiProvider: this.ai.providerName,
              }
            : {}),
        },
      });
      if (requirements) {
        await tx.jobRequirement.deleteMany({ where: { jobId: id } });
        await tx.jobRequirement.createMany({
          data: prepareRequirements(requirements).map((r) => ({ ...r, jobId: id })),
        });
      }
      await this.audit.record(
        actor,
        { action: 'JOB_UPDATED', entityType: 'Job', entityId: id, metadata: { fields: changed } },
        tx,
      );
    });

    const contentChanged = ['title', 'description', 'responsibilities', 'requirements'].some((f) =>
      changed.includes(f),
    );
    const scoringChanged = ['minYearsExperience', 'educationLevel'].some((f) =>
      changed.includes(f),
    );
    if (contentChanged) {
      await this.dispatcher.dispatch(
        'embedding.job',
        { jobId: id },
        { jobId: `embed-job-${id}-${Date.now()}` },
      );
    } else if (scoringChanged) {
      await this.dispatcher.dispatch(
        'matching.job',
        { jobId: id },
        { jobId: `match-job-${id}-${Date.now()}` },
      );
    }
    return this.get(actor.organizationId, id);
  }

  async transition(actor: Actor, id: string, action: JobTransition): Promise<JobDetailDto> {
    const job = await this.findOwned(actor.organizationId, id);
    const rule = TRANSITIONS[action];
    if (!rule.from.includes(job.status)) {
      throw new InvalidStateError(
        `A ${job.status.toLowerCase()} job cannot be ${action === 'reopen' ? 'reopened' : `${action}ed`}`,
      );
    }
    if (rule.to === 'PUBLISHED') {
      const requirementCount = await this.prisma.jobRequirement.count({ where: { jobId: id } });
      if (requirementCount === 0) {
        throw new InvalidStateError(
          'Add at least one requirement before publishing (run AI analysis or add them manually)',
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: {
          status: rule.to,
          ...(rule.to === 'PUBLISHED'
            ? { publishedAt: job.publishedAt ?? new Date(), closedAt: null }
            : {}),
          ...(rule.to === 'CLOSED' ? { closedAt: new Date() } : {}),
        },
      });
      await this.audit.record(
        actor,
        {
          action: rule.audit,
          entityType: 'Job',
          entityId: id,
          metadata: { from: job.status, to: rule.to },
        },
        tx,
      );
    });
    return this.get(actor.organizationId, id);
  }

  async duplicate(actor: Actor, id: string): Promise<JobDetailDto> {
    const source = await this.prisma.job.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { requirements: true },
    });
    if (!source) throw new NotFoundError('Job');
    const title = `${source.title} (copy)`.slice(0, 120);
    const copy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          organizationId: source.organizationId,
          createdById: actor.userId,
          title,
          slug: await this.uniqueSlug(title),
          description: source.description,
          responsibilities: source.responsibilities,
          location: source.location,
          employmentType: source.employmentType,
          experienceLevel: source.experienceLevel,
          remoteType: source.remoteType,
          salaryMin: source.salaryMin,
          salaryMax: source.salaryMax,
          currency: source.currency,
          minYearsExperience: source.minYearsExperience,
          educationLevel: source.educationLevel,
          analysisStatus: source.analysisStatus,
          analysisSummary: source.analysisSummary,
          keywords: source.keywords,
          analyzedAt: source.analyzedAt,
          aiProvider: source.aiProvider,
          requirements: {
            createMany: {
              data: source.requirements.map((r) => ({
                skill: r.skill,
                normalizedSkill: r.normalizedSkill,
                category: r.category,
                required: r.required,
                weight: r.weight,
                minimumYears: r.minimumYears,
                aiGenerated: r.aiGenerated,
                position: r.position,
              })),
            },
          },
        },
      });
      await this.audit.record(
        actor,
        {
          action: 'JOB_DUPLICATED',
          entityType: 'Job',
          entityId: created.id,
          metadata: { sourceJobId: id },
        },
        tx,
      );
      return created;
    });
    await this.dispatcher.dispatch(
      'embedding.job',
      { jobId: copy.id },
      { jobId: `embed-job-${copy.id}` },
    );
    return this.get(actor.organizationId, copy.id);
  }

  /** Jobs with applicants are closed, not deleted, so candidate history is never lost. */
  async delete(actor: Actor, id: string): Promise<void> {
    const job = await this.findOwned(actor.organizationId, id);
    const applications = await this.prisma.application.count({ where: { jobId: id } });
    if (applications > 0) {
      throw new InvalidStateError('This job has applications. Close it instead of deleting it.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.job.delete({ where: { id } });
      await this.audit.record(
        actor,
        { action: 'JOB_DELETED', entityType: 'Job', entityId: id, metadata: { title: job.title } },
        tx,
      );
    });
  }

  async analyze(input: AnalyzeJobInput): Promise<JobAnalysisResult> {
    const analysis = await this.ai.analyzeJob(input);
    return { analysis, provider: this.ai.providerName, isHeuristic: this.ai.isHeuristic };
  }

  // ── Public job board ──────────────────────────────────────────────────────

  async listPublic(query: PublicJobListQuery): Promise<Paginated<PublicJobDto>> {
    const where: Prisma.JobWhereInput = {
      status: 'PUBLISHED',
      ...(query.remoteType?.length ? { remoteType: { in: query.remoteType } } : {}),
      ...(query.employmentType?.length ? { employmentType: { in: query.employmentType } } : {}),
      ...(query.experienceLevel?.length ? { experienceLevel: { in: query.experienceLevel } } : {}),
      ...(query.location ? { location: { contains: query.location, mode: 'insensitive' } } : {}),
      ...(query.organization ? { organization: { slug: query.organization } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { organization: { name: { contains: query.search, mode: 'insensitive' } } },
              {
                requirements: { some: { skill: { contains: query.search, mode: 'insensitive' } } },
              },
            ],
          }
        : {}),
    };
    const [total, jobs] = await this.prisma.$transaction([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        include: publicJobInclude,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: jobs.map(toPublicJobDto),
      pagination: buildPagination(query.page, query.pageSize, total),
    };
  }

  async getPublic(slug: string, viewer: AuthContext | undefined): Promise<PublicJobDetailDto> {
    const job = await this.prisma.job.findFirst({
      where: { slug, status: { in: ['PUBLISHED', 'PAUSED', 'CLOSED'] } },
      include: publicJobInclude,
    });
    if (!job || (job.status !== 'PUBLISHED' && !viewer)) throw new NotFoundError('Job');

    let viewerApplication: PublicJobDetailDto['viewerApplication'] = null;
    if (viewer?.role === 'CANDIDATE') {
      const application = await this.prisma.application.findFirst({
        where: { jobId: job.id, candidate: { userId: viewer.userId } },
        select: { id: true, status: true },
      });
      viewerApplication = application;
    }
    if (job.status !== 'PUBLISHED' && !viewerApplication) throw new NotFoundError('Job');
    return toPublicJobDetailDto(job, viewerApplication);
  }
}
