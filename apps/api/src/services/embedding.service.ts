import { buildCandidateEmbeddingText, buildJobEmbeddingText, buildJobRequirementsText } from '@hireflow/shared';
import type { PrismaClient } from '@hireflow/database';
import type { AIService } from '../ai/ai-service';
import type { Logger } from '../lib/logger';
import type { JobDispatcher } from '../jobs/definitions';
import type { VectorRepository } from '../repositories/vector.repository';

/**
 * Computes and stores embeddings, then triggers re-matching for affected applications. The text
 * that gets embedded is built by the shared builders, which exclude personal attributes.
 */
export class EmbeddingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AIService,
    private readonly vectors: VectorRepository,
    private readonly dispatcher: JobDispatcher,
    private readonly logger: Logger,
  ) {}

  async embedCandidate(candidateId: string): Promise<void> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: {
        skills: { select: { skill: true } },
        experiences: { select: { title: true, company: true, description: true }, orderBy: { startDate: { sort: 'desc', nulls: 'last' } } },
        education: { select: { degree: true, field: true } },
        projects: { select: { name: true, description: true, technologies: true } },
        resumes: {
          where: { parsingStatus: 'COMPLETED', extractedText: { not: null } },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: { id: true, extractedText: true },
        },
      },
    });
    if (!profile) return;

    const text = buildCandidateEmbeddingText({
      headline: profile.headline,
      summary: profile.summary,
      currentRole: profile.currentRole,
      skills: profile.skills.map((s) => s.skill),
      experiences: profile.experiences,
      education: profile.education,
      projects: profile.projects,
      certifications: profile.certifications,
    });

    if (text.length >= 20) {
      await this.vectors.setCandidateEmbedding(candidateId, await this.ai.generateEmbedding(text));
    }
    const resume = profile.resumes[0];
    if (resume?.extractedText) {
      await this.vectors.setResumeEmbedding(resume.id, await this.ai.generateEmbedding(resume.extractedText));
    }
    this.logger.info({ candidateId, chars: text.length }, 'Candidate embedded');
    await this.dispatcher.dispatch('matching.candidate', { candidateId }, { jobId: `match-candidate-${candidateId}-${Date.now()}` });
  }

  async embedJob(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { requirements: { select: { skill: true, required: true } } },
    });
    if (!job) return;

    const [description, requirements] = await this.ai.embeddings.embedDocuments([
      buildJobEmbeddingText({
        title: job.title,
        description: job.description,
        responsibilities: job.responsibilities,
        requirements: job.requirements,
      }),
      job.requirements.length ? `${job.title}\n${buildJobRequirementsText(job.requirements)}` : job.title,
    ]);
    if (!description) throw new Error('Embedding provider returned no vector');
    await this.vectors.setJobEmbeddings(jobId, description, job.requirements.length && requirements ? requirements : null);
    this.logger.info({ jobId }, 'Job embedded');
    await this.dispatcher.dispatch('matching.job', { jobId }, { jobId: `match-job-${jobId}-${Date.now()}` });
  }
}
