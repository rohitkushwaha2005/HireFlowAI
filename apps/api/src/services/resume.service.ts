import {
  EDUCATION_LEVELS,
  normalizeSkill,
  totalExperienceYears,
  type EducationLevel,
  type ResumeAnalysis,
  type ResumeDto,
} from '@hireflow/shared';
import type { Prisma, PrismaClient } from '@hireflow/database';
import type { AIService } from '../ai/ai-service';
import { partialDateToDate } from '../ai/heuristic/resume-parser';
import { randomToken, sha256 } from '../lib/crypto';
import { ForbiddenError, InvalidStateError, NotFoundError, errorMessage } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { extractPdfText } from '../lib/pdf';
import type { StorageProvider } from '../lib/storage';
import type { JobDispatcher } from '../jobs/definitions';
import { toResumeDto } from '../mappers';
import { resumeSelect } from '../repositories/includes';
import { sanitizeFileName } from '../middleware/upload';
import type { AuthContext } from '../types/context';
import type { AuditService } from './audit.service';

export const MAX_PARSING_ATTEMPTS = 4;
const MIN_TEXT_LENGTH = 80;

export interface ResumeDownload {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

/** Non-retryable processing failure (bad input rather than a transient outage). */
export class ResumeProcessingError extends Error {}

export class ResumeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageProvider,
    private readonly ai: AIService,
    private readonly audit: AuditService,
    private readonly dispatcher: JobDispatcher,
    private readonly logger: Logger,
  ) {}

  private async profileFor(userId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new ForbiddenError('Only candidates can manage resumes');
    return profile;
  }

  private async ownedResume(userId: string, resumeId: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, candidate: { userId } },
      select: { ...resumeSelect, fileUrl: true },
    });
    if (!resume) throw new NotFoundError('Resume');
    return resume;
  }

  // ── Candidate operations ──────────────────────────────────────────────────

  /**
   * Stores the validated PDF, records it as PENDING and queues parsing. Returns immediately;
   * parsing happens in the worker. The newest upload becomes the primary resume.
   */
  async upload(
    userId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ): Promise<ResumeDto> {
    const profile = await this.profileFor(userId);
    const checksum = sha256(file.buffer);

    const duplicate = await this.prisma.resume.findFirst({
      where: { candidateId: profile.id, checksum },
      select: resumeSelect,
    });
    if (duplicate) {
      await this.setPrimary(userId, duplicate.id);
      return toResumeDto({ ...duplicate, isPrimary: true });
    }

    const key = `resumes/${profile.id}/${randomToken(16)}.pdf`;
    await this.storage.put(key, file.buffer, 'application/pdf');

    const resume = await this.prisma.$transaction(async (tx) => {
      await tx.resume.updateMany({
        where: { candidateId: profile.id, isPrimary: true },
        data: { isPrimary: false },
      });
      return tx.resume.create({
        data: {
          candidateId: profile.id,
          fileName: sanitizeFileName(file.originalname),
          fileUrl: key,
          mimeType: 'application/pdf',
          fileSize: file.size,
          checksum,
          isPrimary: true,
        },
        select: resumeSelect,
      });
    });

    await this.dispatcher.dispatch(
      'resume.process',
      { resumeId: resume.id },
      { jobId: `resume-${resume.id}` },
    );
    this.logger.info({ resumeId: resume.id, size: file.size }, 'Resume uploaded and queued');
    return toResumeDto(resume);
  }

  async list(userId: string): Promise<ResumeDto[]> {
    const profile = await this.profileFor(userId);
    const resumes = await this.prisma.resume.findMany({
      where: { candidateId: profile.id },
      select: resumeSelect,
      orderBy: { createdAt: 'desc' },
    });
    return resumes.map(toResumeDto);
  }

  async get(auth: AuthContext, resumeId: string): Promise<ResumeDto> {
    await this.assertCanRead(auth, resumeId);
    const resume = await this.prisma.resume.findUniqueOrThrow({
      where: { id: resumeId },
      select: resumeSelect,
    });
    return toResumeDto(resume);
  }

  async setPrimary(userId: string, resumeId: string): Promise<ResumeDto> {
    const resume = await this.ownedResume(userId, resumeId);
    await this.prisma.$transaction([
      this.prisma.resume.updateMany({
        where: { candidateId: resume.candidateId, isPrimary: true },
        data: { isPrimary: false },
      }),
      this.prisma.resume.update({ where: { id: resumeId }, data: { isPrimary: true } }),
    ]);
    if (resume.parsingStatus === 'COMPLETED') {
      await this.dispatcher.dispatch(
        'resume.process',
        { resumeId },
        { jobId: `resume-primary-${resumeId}-${Date.now()}` },
      );
    }
    return toResumeDto({ ...resume, isPrimary: true });
  }

  async retry(userId: string, resumeId: string): Promise<ResumeDto> {
    const resume = await this.ownedResume(userId, resumeId);
    if (resume.parsingStatus !== 'FAILED')
      throw new InvalidStateError('Only failed resumes can be retried');
    const updated = await this.prisma.resume.update({
      where: { id: resumeId },
      data: { parsingStatus: 'PENDING', parsingError: null, parsingAttempts: 0 },
      select: resumeSelect,
    });
    await this.dispatcher.dispatch(
      'resume.process',
      { resumeId },
      { jobId: `resume-retry-${resumeId}-${Date.now()}` },
    );
    return toResumeDto(updated);
  }

  async delete(userId: string, resumeId: string): Promise<void> {
    const resume = await this.ownedResume(userId, resumeId);
    const activeApplications = await this.prisma.application.count({
      where: { resumeId, status: { notIn: ['REJECTED', 'WITHDRAWN', 'HIRED'] } },
    });
    if (activeApplications > 0) {
      throw new InvalidStateError(
        'This resume is attached to an active application and cannot be deleted',
      );
    }
    await this.prisma.resume.delete({ where: { id: resumeId } });
    await this.storage
      .delete(resume.fileUrl)
      .catch((error: unknown) =>
        this.logger.warn({ err: error, resumeId }, 'Failed to delete resume object'),
      );
    if (resume.isPrimary) {
      const next = await this.prisma.resume.findFirst({
        where: { candidateId: resume.candidateId },
        orderBy: { createdAt: 'desc' },
      });
      if (next)
        await this.prisma.resume.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }

  /**
   * A resume is readable by its owner, and by staff of an organization it was submitted to.
   * Returns the organization id for staff access (for auditing).
   */
  private async assertCanRead(auth: AuthContext, resumeId: string): Promise<string | null> {
    if (auth.role === 'CANDIDATE') {
      const own = await this.prisma.resume.count({
        where: { id: resumeId, candidate: { userId: auth.userId } },
      });
      if (!own) throw new NotFoundError('Resume');
      return null;
    }
    // Staff may only read resumes the candidate actually submitted to their organization.
    const access = await this.prisma.application.findFirst({
      where: {
        resumeId,
        job: { organization: { members: { some: { userId: auth.userId } } } },
      },
      select: { job: { select: { organizationId: true } } },
    });
    if (!access) throw new NotFoundError('Resume');
    return access.job.organizationId;
  }

  async download(
    auth: AuthContext,
    resumeId: string,
    ipAddress: string | null,
  ): Promise<ResumeDownload> {
    const organizationId = await this.assertCanRead(auth, resumeId);
    const resume = await this.prisma.resume.findUniqueOrThrow({ where: { id: resumeId } });
    const buffer = await this.storage.get(resume.fileUrl);
    if (organizationId) {
      const membership = await this.prisma.organizationMember.findFirstOrThrow({
        where: { organizationId, userId: auth.userId },
      });
      await this.audit.recordQuietly(
        { userId: auth.userId, organizationId, orgRole: membership.role, ipAddress },
        {
          action: 'RESUME_VIEWED',
          entityType: 'Resume',
          entityId: resumeId,
          metadata: { candidateId: resume.candidateId },
        },
      );
    }
    return { buffer, fileName: resume.fileName, mimeType: resume.mimeType };
  }

  // ── Worker pipeline ───────────────────────────────────────────────────────

  /**
   * download → extract text → AI structured extraction → normalize → persist → queue embedding.
   * Idempotent: safe to run again for the same resume. Transient AI failures are rethrown so the
   * queue retries with backoff; permanent failures mark the resume FAILED with a readable reason.
   */
  async process(resumeId: string): Promise<void> {
    const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
    if (!resume) {
      this.logger.warn({ resumeId }, 'Resume no longer exists; skipping');
      return;
    }
    const attempts = resume.parsingAttempts + 1;
    await this.prisma.resume.update({
      where: { id: resumeId },
      data: { parsingStatus: 'PROCESSING', parsingAttempts: attempts, parsingError: null },
    });

    try {
      const text = resume.extractedText ?? (await this.extractText(resume.fileUrl));
      const analysis = await this.ai.parseResume({ text });

      await this.prisma.$transaction(async (tx) => {
        await tx.resume.update({
          where: { id: resumeId },
          data: {
            extractedText: text,
            parsedData: analysis as unknown as Prisma.InputJsonValue,
            parsingStatus: 'COMPLETED',
            parsedAt: new Date(),
            aiProvider: this.ai.providerName,
          },
        });
        const isPrimary =
          resume.isPrimary ||
          (await tx.resume.count({ where: { candidateId: resume.candidateId } })) === 1;
        if (isPrimary) await applyAnalysisToProfile(tx, resume.candidateId, analysis);
      });

      this.logger.info(
        { resumeId, provider: this.ai.providerName, skills: analysis.skills.length },
        'Resume parsed',
      );
      await this.dispatcher.dispatch(
        'embedding.candidate',
        { candidateId: resume.candidateId },
        { jobId: `embed-candidate-${resume.candidateId}-${Date.now()}` },
      );
    } catch (error) {
      // Bad input fails immediately; outages (AI, storage) are retried with backoff.
      const retryable =
        !(error instanceof ResumeProcessingError) && attempts < MAX_PARSING_ATTEMPTS;
      await this.prisma.resume.update({
        where: { id: resumeId },
        data: retryable
          ? { parsingStatus: 'PENDING', parsingError: `Retrying: ${errorMessage(error)}` }
          : { parsingStatus: 'FAILED', parsingError: errorMessage(error).slice(0, 500) },
      });
      this.logger.warn(
        { resumeId, attempts, retryable, err: errorMessage(error) },
        'Resume processing failed',
      );
      if (retryable) throw error;
      // Matching can still run on whatever profile data exists.
      const applications = await this.prisma.application.findMany({
        where: { resumeId },
        select: { id: true },
      });
      for (const app of applications) {
        await this.dispatcher.dispatch(
          'matching.application',
          { applicationId: app.id },
          { jobId: `match-app-${app.id}-${Date.now()}` },
        );
      }
    }
  }

  private async extractText(key: string): Promise<string> {
    const buffer = await this.storage.get(key);
    let text: string;
    try {
      text = (await extractPdfText(buffer)).text;
    } catch (error) {
      throw new ResumeProcessingError(`The PDF could not be read (${errorMessage(error)})`);
    }
    if (text.replace(/\s/g, '').length < MIN_TEXT_LENGTH) {
      throw new ResumeProcessingError(
        'No readable text was found. Scanned/image-only PDFs are not supported yet — please upload a text-based PDF.',
      );
    }
    return text;
  }
}

function maxEducation(levels: Array<EducationLevel | null>): EducationLevel | null {
  const ranks = levels
    .filter((l): l is EducationLevel => l !== null)
    .map((l) => EDUCATION_LEVELS.indexOf(l));
  return ranks.length ? EDUCATION_LEVELS[Math.max(...ranks)]! : null;
}

/**
 * Replaces resume-sourced profile data with the new analysis while preserving anything the
 * candidate entered manually. Contact/profile fields are only filled when empty.
 */
export async function applyAnalysisToProfile(
  tx: Prisma.TransactionClient,
  candidateId: string,
  analysis: ResumeAnalysis,
): Promise<void> {
  const profile = await tx.candidateProfile.findUniqueOrThrow({
    where: { id: candidateId },
    include: { skills: { where: { source: 'MANUAL' }, select: { normalizedSkill: true } } },
  });
  const manualSkillKeys = new Set(profile.skills.map((s) => s.normalizedSkill));

  await tx.candidateSkill.deleteMany({ where: { candidateId, source: 'RESUME' } });
  await tx.workExperience.deleteMany({ where: { candidateId, source: 'RESUME' } });
  await tx.education.deleteMany({ where: { candidateId, source: 'RESUME' } });
  await tx.candidateProject.deleteMany({ where: { candidateId, source: 'RESUME' } });

  const seen = new Set<string>();
  const skills: Prisma.CandidateSkillCreateManyInput[] = [];
  for (const skill of analysis.skills) {
    const normalized = normalizeSkill(skill.name);
    if (!normalized || seen.has(normalized.key) || manualSkillKeys.has(normalized.key)) continue;
    seen.add(normalized.key);
    skills.push({
      candidateId,
      skill: normalized.known ? normalized.name : skill.name,
      normalizedSkill: normalized.key,
      proficiency: skill.proficiency,
      yearsExperience: skill.yearsExperience,
      source: 'RESUME',
    });
  }
  if (skills.length) await tx.candidateSkill.createMany({ data: skills });

  const experiences = analysis.workExperience.map((w) => ({
    candidateId,
    company: w.company,
    title: w.title,
    description: w.description,
    startDate: partialDateToDate(w.startDate),
    endDate: w.current ? null : partialDateToDate(w.endDate),
    current: w.current,
    source: 'RESUME' as const,
  }));
  if (experiences.length) await tx.workExperience.createMany({ data: experiences });

  if (analysis.education.length) {
    await tx.education.createMany({
      data: analysis.education.map((e) => ({
        candidateId,
        institution: e.institution,
        degree: e.degree,
        field: e.field,
        level: e.level,
        startDate: partialDateToDate(e.startDate),
        endDate: partialDateToDate(e.endDate),
        grade: e.grade,
        source: 'RESUME' as const,
      })),
    });
  }
  if (analysis.projects.length) {
    await tx.candidateProject.createMany({
      data: analysis.projects.map((p) => ({
        candidateId,
        name: p.name,
        description: p.description,
        technologies: p.technologies,
        url: p.url,
        source: 'RESUME' as const,
      })),
    });
  }

  const allExperience = await tx.workExperience.findMany({
    where: { candidateId },
    select: { startDate: true, endDate: true, current: true },
  });
  const allEducation = await tx.education.findMany({
    where: { candidateId },
    select: { level: true },
  });
  const computedYears = totalExperienceYears(allExperience);
  const latest = analysis.workExperience.find((w) => w.current) ?? null;

  const fill = <T>(current: T | null, next: T | null): T | null => current ?? next;
  await tx.candidateProfile.update({
    where: { id: candidateId },
    data: {
      headline: fill(profile.headline, analysis.headline),
      summary: fill(profile.summary, analysis.summary),
      location: fill(profile.location, analysis.location),
      phone: fill(profile.phone, analysis.phone),
      linkedinUrl: fill(profile.linkedinUrl, analysis.links.linkedin),
      githubUrl: fill(profile.githubUrl, analysis.links.github),
      portfolioUrl: fill(profile.portfolioUrl, analysis.links.portfolio),
      currentRole: analysis.currentRole ?? latest?.title ?? profile.currentRole,
      totalExperience:
        computedYears > 0
          ? computedYears
          : (analysis.totalExperienceYears ?? profile.totalExperience),
      highestEducation: maxEducation(allEducation.map((e) => e.level)) ?? profile.highestEducation,
      certifications: [...new Set([...profile.certifications, ...analysis.certifications])].slice(
        0,
        40,
      ),
    },
  });
}
