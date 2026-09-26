import { Prisma, type PrismaClient } from '@hireflow/database';
import type { ApplicationStatus } from '@hireflow/shared';

/**
 * Analytics aggregations executed in PostgreSQL. Nothing here loads rows into Node to count them.
 */

/** Ordinal of forward pipeline stages; terminal negative outcomes rank -1. */
const STAGE_RANK_SQL = (column: Prisma.Sql) => Prisma.sql`CASE ${column}::text
  WHEN 'APPLIED' THEN 0 WHEN 'SCREENING' THEN 1 WHEN 'SHORTLISTED' THEN 2
  WHEN 'INTERVIEW' THEN 3 WHEN 'OFFER' THEN 4 WHEN 'HIRED' THEN 5 ELSE -1 END`;

export interface FunnelCounts {
  applied: number;
  screening: number;
  shortlisted: number;
  interview: number;
  offer: number;
  hired: number;
}

export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async totals(organizationId: string) {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        active_jobs: bigint;
        candidates: bigint;
        applications: bigint;
        interviews: bigint;
        upcoming_interviews: bigint;
        hires: bigint;
        avg_score: number | null;
      }>
    >`
      SELECT
        (SELECT COUNT(*) FROM jobs WHERE "organizationId" = ${organizationId} AND status = 'PUBLISHED') AS active_jobs,
        (SELECT COUNT(DISTINCT a."candidateId") FROM applications a JOIN jobs j ON j.id = a."jobId"
          WHERE j."organizationId" = ${organizationId}) AS candidates,
        (SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a."jobId"
          WHERE j."organizationId" = ${organizationId}) AS applications,
        (SELECT COUNT(*) FROM interviews i JOIN applications a ON a.id = i."applicationId" JOIN jobs j ON j.id = a."jobId"
          WHERE j."organizationId" = ${organizationId} AND i.status <> 'CANCELLED') AS interviews,
        (SELECT COUNT(*) FROM interviews i JOIN applications a ON a.id = i."applicationId" JOIN jobs j ON j.id = a."jobId"
          WHERE j."organizationId" = ${organizationId} AND i.status = 'SCHEDULED' AND i."scheduledAt" >= NOW()) AS upcoming_interviews,
        (SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a."jobId"
          WHERE j."organizationId" = ${organizationId} AND a.status = 'HIRED') AS hires,
        (SELECT AVG(m."overallScore")::float8 FROM candidate_matches m JOIN applications a ON a.id = m."applicationId"
          JOIN jobs j ON j.id = a."jobId" WHERE j."organizationId" = ${organizationId}) AS avg_score`;
    return {
      activeJobs: Number(row?.active_jobs ?? 0),
      totalCandidates: Number(row?.candidates ?? 0),
      applications: Number(row?.applications ?? 0),
      interviews: Number(row?.interviews ?? 0),
      upcomingInterviews: Number(row?.upcoming_interviews ?? 0),
      hires: Number(row?.hires ?? 0),
      averageMatchScore:
        row?.avg_score === null || row?.avg_score === undefined ? null : Math.round(row.avg_score),
    };
  }

  async applicationsOverTime(organizationId: string, days: number) {
    const rows = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT d.day, COUNT(a.id) AS count
      FROM generate_series(
        date_trunc('day', NOW()) - make_interval(days => ${days - 1}::int),
        date_trunc('day', NOW()),
        interval '1 day'
      ) AS d(day)
      LEFT JOIN applications a ON date_trunc('day', a."appliedAt") = d.day
        AND a."jobId" IN (SELECT id FROM jobs WHERE "organizationId" = ${organizationId})
      GROUP BY d.day
      ORDER BY d.day`;
    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
  }

  async pipeline(organizationId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ status: ApplicationStatus; count: bigint }>>`
      SELECT a.status::text AS status, COUNT(*) AS count
      FROM applications a JOIN jobs j ON j.id = a."jobId"
      WHERE j."organizationId" = ${organizationId}
      GROUP BY a.status`;
    return new Map(rows.map((r) => [r.status, Number(r.count)]));
  }

  async applicationsPerJob(organizationId: string, limit: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; title: string; count: bigint; avg_score: number | null }>
    >`
      SELECT j.id, j.title, COUNT(a.id) AS count, AVG(m."overallScore")::float8 AS avg_score
      FROM jobs j
      LEFT JOIN applications a ON a."jobId" = j.id
      LEFT JOIN candidate_matches m ON m."applicationId" = a.id
      WHERE j."organizationId" = ${organizationId} AND j.status <> 'DRAFT'
      GROUP BY j.id, j.title
      ORDER BY count DESC, j.title
      LIMIT ${limit}`;
    return rows.map((r) => ({
      jobId: r.id,
      title: r.title,
      count: Number(r.count),
      averageScore: r.avg_score === null ? null : Math.round(r.avg_score),
    }));
  }

  async topSkills(organizationId: string, limit: number) {
    const rows = await this.prisma.$queryRaw<Array<{ skill: string; count: bigint }>>`
      SELECT MIN(s.skill) AS skill, COUNT(DISTINCT s."candidateId") AS count
      FROM candidate_skills s
      WHERE s."candidateId" IN (
        SELECT a."candidateId" FROM applications a JOIN jobs j ON j.id = a."jobId"
        WHERE j."organizationId" = ${organizationId})
      GROUP BY s."normalizedSkill"
      ORDER BY count DESC, skill
      LIMIT ${limit}`;
    return rows.map((r) => ({ skill: r.skill, count: Number(r.count) }));
  }

  /**
   * Funnel based on the furthest stage each application ever reached (status history), so a
   * candidate rejected after an interview still counts towards "interview".
   */
  async funnel(organizationId: string): Promise<FunnelCounts> {
    const [row] = await this.prisma.$queryRaw<Array<Record<keyof FunnelCounts, bigint>>>`
      WITH reached AS (
        SELECT a.id, GREATEST(${STAGE_RANK_SQL(Prisma.sql`a.status`)}, COALESCE(MAX(${STAGE_RANK_SQL(Prisma.sql`e."toStatus"`)}), 0)) AS max_rank
        FROM applications a
        JOIN jobs j ON j.id = a."jobId"
        LEFT JOIN application_status_events e ON e."applicationId" = a.id
        WHERE j."organizationId" = ${organizationId}
        GROUP BY a.id, a.status
      )
      SELECT
        COUNT(*) AS applied,
        COUNT(*) FILTER (WHERE max_rank >= 1) AS screening,
        COUNT(*) FILTER (WHERE max_rank >= 2) AS shortlisted,
        COUNT(*) FILTER (WHERE max_rank >= 3) AS interview,
        COUNT(*) FILTER (WHERE max_rank >= 4) AS offer,
        COUNT(*) FILTER (WHERE max_rank >= 5) AS hired
      FROM reached`;
    return {
      applied: Number(row?.applied ?? 0),
      screening: Number(row?.screening ?? 0),
      shortlisted: Number(row?.shortlisted ?? 0),
      interview: Number(row?.interview ?? 0),
      offer: Number(row?.offer ?? 0),
      hired: Number(row?.hired ?? 0),
    };
  }

  async scoreDistribution(organizationId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
      SELECT CASE
          WHEN m."overallScore" >= 80 THEN '80–100'
          WHEN m."overallScore" >= 60 THEN '60–79'
          WHEN m."overallScore" >= 40 THEN '40–59'
          ELSE '0–39' END AS bucket,
        COUNT(*) AS count
      FROM candidate_matches m
      JOIN applications a ON a.id = m."applicationId"
      JOIN jobs j ON j.id = a."jobId"
      WHERE j."organizationId" = ${organizationId}
      GROUP BY bucket`;
    const counts = new Map(rows.map((r) => [r.bucket, Number(r.count)]));
    return ['0–39', '40–59', '60–79', '80–100'].map((bucket) => ({
      bucket,
      count: counts.get(bucket) ?? 0,
    }));
  }
}
