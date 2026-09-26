import { Prisma, type PrismaClient } from '@hireflow/database';
import { toVectorLiteral } from '../ai/embeddings';

/**
 * All pgvector access. Prisma models vector columns as `Unsupported`, so reads and writes use
 * tagged-template raw SQL (fully parameterized). `<=>` is cosine distance; similarity = 1 - distance.
 */

/** Number of nearest profiles retrieved via the HNSW index before re-ranking. */
const RECALL_POOL = 200;

export interface CandidateVectorHit {
  candidateId: string;
  similarity: number;
}

export interface CandidateSearchFilters {
  organizationId: string;
  /** Normalized skill keys the candidate must all have. */
  skills?: string[];
  minExperience?: number;
  maxExperience?: number;
  location?: string;
  jobId?: string;
  statuses?: string[];
  /** Only candidates who applied to one of the organization's jobs (default true for recruiters). */
  appliedOnly?: boolean;
}

export class VectorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async setCandidateEmbedding(candidateId: string, vector: number[]): Promise<void> {
    const literal = toVectorLiteral(vector);
    await this.prisma.$executeRaw`
      UPDATE candidate_profiles SET embedding = ${literal}::vector, "embeddedAt" = NOW()
      WHERE id = ${candidateId}`;
  }

  async setResumeEmbedding(resumeId: string, vector: number[]): Promise<void> {
    const literal = toVectorLiteral(vector);
    await this.prisma.$executeRaw`
      UPDATE resumes SET embedding = ${literal}::vector, "embeddedAt" = NOW() WHERE id = ${resumeId}`;
  }

  async setJobEmbeddings(jobId: string, description: number[], requirements: number[] | null): Promise<void> {
    const desc = toVectorLiteral(description);
    const reqs = requirements ? toVectorLiteral(requirements) : null;
    await this.prisma.$executeRaw`
      UPDATE jobs SET embedding = ${desc}::vector,
        "requirementsEmbedding" = ${reqs}::vector,
        "embeddedAt" = NOW()
      WHERE id = ${jobId}`;
  }

  /**
   * Candidate ↔ job similarity. Uses the best of (profile vs description, profile vs requirements,
   * primary resume vs description) so neither a sparse profile nor a terse job description
   * artificially depresses the score. Returns null when embeddings are missing.
   */
  async candidateJobSimilarity(candidateId: string, jobId: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<Array<{ similarity: number | null }>>`
      SELECT GREATEST(
        1 - (cp.embedding <=> j.embedding),
        1 - (cp.embedding <=> j."requirementsEmbedding"),
        (SELECT 1 - (r.embedding <=> j.embedding) FROM resumes r
          WHERE r."candidateId" = cp.id AND r.embedding IS NOT NULL
          ORDER BY r."isPrimary" DESC, r."createdAt" DESC LIMIT 1)
      )::float8 AS similarity
      FROM candidate_profiles cp, jobs j
      WHERE cp.id = ${candidateId} AND j.id = ${jobId}
        AND cp.embedding IS NOT NULL AND j.embedding IS NOT NULL`;
    const value = rows[0]?.similarity;
    return value === null || value === undefined ? null : Number(value);
  }

  /**
   * Hybrid search: vector similarity combined with structured SQL filters and tenant scoping.
   *
   * Two stages in one statement: (1) the HNSW index retrieves the nearest RECALL_POOL profiles
   * that pass the filters; (2) those are re-ranked by the better of profile similarity and primary
   * resume similarity, so detail that only appears in the resume text (e.g. a specific project)
   * still surfaces. Candidates are visible to an organization only if they applied to one of its jobs.
   */
  async searchCandidates(
    query: number[],
    filters: CandidateSearchFilters,
    limit: number,
    offset = 0,
  ): Promise<{ hits: CandidateVectorHit[]; total: number }> {
    const literal = toVectorLiteral(query);
    const where = this.filterSql(filters);
    const recallPool = Math.max(RECALL_POOL, offset + limit);

    const hits = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
      WITH recalled AS (
        SELECT cp.id, cp.embedding <=> ${literal}::vector AS profile_distance
        FROM candidate_profiles cp
        JOIN users u ON u.id = cp."userId"
        WHERE cp.embedding IS NOT NULL ${where}
        ORDER BY cp.embedding <=> ${literal}::vector
        LIMIT ${recallPool}
      )
      SELECT r.id,
        GREATEST(
          1 - r.profile_distance,
          (SELECT 1 - (res.embedding <=> ${literal}::vector) FROM resumes res
            WHERE res."candidateId" = r.id AND res.embedding IS NOT NULL
            ORDER BY res."isPrimary" DESC, res."createdAt" DESC LIMIT 1)
        )::float8 AS similarity
      FROM recalled r
      ORDER BY similarity DESC
      LIMIT ${limit} OFFSET ${offset}`;

    const [count] = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total FROM candidate_profiles cp
      JOIN users u ON u.id = cp."userId"
      WHERE cp.embedding IS NOT NULL ${where}`;

    return {
      hits: hits.map((h) => ({ candidateId: h.id, similarity: Number(h.similarity) })),
      total: Number(count?.total ?? 0),
    };
  }

  /** Published jobs most similar to a candidate profile (candidate dashboard recommendations). */
  async recommendJobs(candidateId: string, limit: number): Promise<Array<{ jobId: string; similarity: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT j.id, (1 - (j.embedding <=> cp.embedding))::float8 AS similarity
      FROM jobs j, candidate_profiles cp
      WHERE cp.id = ${candidateId} AND cp.embedding IS NOT NULL AND j.embedding IS NOT NULL
        AND j.status = 'PUBLISHED'
        AND NOT EXISTS (SELECT 1 FROM applications a WHERE a."jobId" = j.id AND a."candidateId" = cp.id)
      ORDER BY j.embedding <=> cp.embedding
      LIMIT ${limit}`;
    return rows.map((r) => ({ jobId: r.id, similarity: Number(r.similarity) }));
  }

  private filterSql(filters: CandidateSearchFilters): Prisma.Sql {
    const clauses: Prisma.Sql[] = [];
    const appliedClauses: Prisma.Sql[] = [Prisma.sql`j."organizationId" = ${filters.organizationId}`];
    if (filters.jobId) appliedClauses.push(Prisma.sql`a."jobId" = ${filters.jobId}`);
    if (filters.statuses?.length) {
      appliedClauses.push(Prisma.sql`a.status::text IN (${Prisma.join(filters.statuses)})`);
    }
    if (filters.appliedOnly !== false) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM applications a JOIN jobs j ON j.id = a."jobId"
        WHERE a."candidateId" = cp.id AND ${Prisma.join(appliedClauses, ' AND ')})`);
    }
    for (const skill of filters.skills ?? []) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM candidate_skills s WHERE s."candidateId" = cp.id AND s."normalizedSkill" = ${skill})`);
    }
    if (filters.minExperience !== undefined) {
      clauses.push(Prisma.sql`cp."totalExperience" >= ${filters.minExperience}`);
    }
    if (filters.maxExperience !== undefined) {
      clauses.push(Prisma.sql`cp."totalExperience" <= ${filters.maxExperience}`);
    }
    if (filters.location) {
      clauses.push(Prisma.sql`cp.location ILIKE ${`%${filters.location}%`}`);
    }
    return clauses.length ? Prisma.sql`AND ${Prisma.join(clauses, ' AND ')}` : Prisma.empty;
  }
}
