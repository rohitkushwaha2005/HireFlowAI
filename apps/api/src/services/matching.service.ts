import { computeMatch, type MatchDto, type MatchResult } from '@hireflow/shared';
import type { Prisma, PrismaClient } from '@hireflow/database';
import { NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { parseWeights, toMatchDto } from '../mappers';
import type { VectorRepository } from '../repositories/vector.repository';
import type { Actor } from '../types/context';
import type { AuditService } from './audit.service';

/**
 * Orchestrates the deterministic scoring function (`computeMatch` in @hireflow/shared) with data
 * loaded from the database and semantic similarity from pgvector. Only job-relevant fields are
 * loaded — the candidate's name, contact details and location never reach the scorer.
 */
export class MatchingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly vectors: VectorRepository,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {}

  /** Returns null when the match cannot be computed yet (resume still processing). */
  async computeForApplication(applicationId: string): Promise<MatchResult | null> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        candidateId: true,
        jobId: true,
        resume: { select: { parsingStatus: true } },
        job: {
          select: {
            minYearsExperience: true,
            educationLevel: true,
            organization: { select: { matchingWeights: true } },
            requirements: {
              select: { skill: true, normalizedSkill: true, required: true, weight: true, minimumYears: true },
              orderBy: { position: 'asc' },
            },
          },
        },
        candidate: {
          select: {
            totalExperience: true,
            highestEducation: true,
            skills: { select: { normalizedSkill: true, yearsExperience: true } },
          },
        },
      },
    });
    if (!application) return null;
    if (application.status === 'WITHDRAWN') return null;
    if (application.resume && ['PENDING', 'PROCESSING'].includes(application.resume.parsingStatus)) {
      return null;
    }

    const semanticSimilarity = await this.vectors.candidateJobSimilarity(application.candidateId, application.jobId);
    const result = computeMatch({
      job: {
        requirements: application.job.requirements,
        minYearsExperience: application.job.minYearsExperience,
        educationLevel: application.job.educationLevel,
      },
      candidate: {
        skills: application.candidate.skills,
        totalExperienceYears: application.candidate.totalExperience,
        highestEducation: application.candidate.highestEducation,
      },
      semanticSimilarity,
      weights: parseWeights(application.job.organization.matchingWeights),
    });

    const data = {
      overallScore: result.overallScore,
      skillsScore: result.skillsScore,
      experienceScore: result.experienceScore,
      educationScore: result.educationScore,
      semanticScore: result.semanticScore,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      explanation: result.explanation,
      highlights: result.highlights,
      concerns: result.concerns,
      details: result.requirements as unknown as Prisma.InputJsonValue,
      weights: result.appliedWeights as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.candidateMatch.upsert({
      where: { applicationId },
      create: { applicationId, ...data },
      update: data,
    });
    this.logger.info({ applicationId, score: result.overallScore }, 'Match computed');
    return result;
  }

  async computeForJob(jobId: string): Promise<number> {
    const applications = await this.prisma.application.findMany({
      where: { jobId, status: { not: 'WITHDRAWN' } },
      select: { id: true },
    });
    for (const app of applications) await this.computeForApplication(app.id);
    return applications.length;
  }

  async computeForCandidate(candidateId: string): Promise<number> {
    const applications = await this.prisma.application.findMany({
      where: { candidateId, status: { not: 'WITHDRAWN' } },
      select: { id: true },
    });
    for (const app of applications) await this.computeForApplication(app.id);
    return applications.length;
  }

  private async assertInOrganization(organizationId: string, applicationId: string): Promise<void> {
    const exists = await this.prisma.application.count({ where: { id: applicationId, job: { organizationId } } });
    if (!exists) throw new NotFoundError('Application');
  }

  async get(organizationId: string, applicationId: string): Promise<MatchDto | null> {
    await this.assertInOrganization(organizationId, applicationId);
    const match = await this.prisma.candidateMatch.findUnique({ where: { applicationId } });
    return match ? toMatchDto(match) : null;
  }

  /** Recruiter-triggered synchronous recalculation (scoring is cheap; embeddings already exist). */
  async recalculate(actor: Actor, applicationId: string): Promise<MatchDto | null> {
    await this.assertInOrganization(actor.organizationId, applicationId);
    const result = await this.computeForApplication(applicationId);
    await this.audit.record(actor, {
      action: 'MATCH_RECALCULATED',
      entityType: 'Application',
      entityId: applicationId,
      metadata: { overallScore: result?.overallScore ?? null },
    });
    const match = await this.prisma.candidateMatch.findUnique({ where: { applicationId } });
    return match ? toMatchDto(match) : null;
  }
}
