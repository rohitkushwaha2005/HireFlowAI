import { PIPELINE_STAGES, type DashboardAnalyticsDto } from '@hireflow/shared';
import type { Cache } from '../lib/redis';
import type { AnalyticsRepository } from '../repositories/analytics.repository';
import type { AuditService } from './audit.service';

const CACHE_TTL_SECONDS = 60;
const cacheKey = (organizationId: string) => `analytics:dashboard:${organizationId}`;

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Dashboard analytics. Aggregations run in SQL (AnalyticsRepository); the combined result is cached
 * in Redis for a minute and invalidated by the `analytics.refresh` job after pipeline changes.
 */
export class AnalyticsService {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly audit: AuditService,
    private readonly cache: Cache,
  ) {}

  dashboard(organizationId: string): Promise<DashboardAnalyticsDto> {
    return this.cache.wrap(cacheKey(organizationId), CACHE_TTL_SECONDS, () =>
      this.compute(organizationId),
    );
  }

  async refresh(organizationId: string): Promise<void> {
    await this.cache.delete(cacheKey(organizationId));
    await this.dashboard(organizationId);
  }

  private async compute(organizationId: string): Promise<DashboardAnalyticsDto> {
    const [totals, overTime, pipeline, perJob, topSkills, funnel, scores, recentActivity] =
      await Promise.all([
        this.repository.totals(organizationId),
        this.repository.applicationsOverTime(organizationId, 30),
        this.repository.pipeline(organizationId),
        this.repository.applicationsPerJob(organizationId, 8),
        this.repository.topSkills(organizationId, 10),
        this.repository.funnel(organizationId),
        this.repository.scoreDistribution(organizationId),
        this.audit.list(organizationId, { limit: 10 }),
      ]);

    const stages = [
      { stage: 'Applied', count: funnel.applied },
      { stage: 'Screening', count: funnel.screening },
      { stage: 'Shortlisted', count: funnel.shortlisted },
      { stage: 'Interview', count: funnel.interview },
      { stage: 'Offer', count: funnel.offer },
      { stage: 'Hired', count: funnel.hired },
    ];

    return {
      totals,
      applicationsOverTime: overTime,
      pipeline: [...PIPELINE_STAGES, 'WITHDRAWN' as const].map((status) => ({
        status,
        count: pipeline.get(status) ?? 0,
      })),
      applicationsPerJob: perJob,
      topSkills,
      funnel: stages.map((s, i) => ({
        ...s,
        conversion: i === 0 ? null : rate(s.count, stages[i - 1]!.count),
      })),
      conversion: {
        applicationToInterview: rate(funnel.interview, funnel.applied),
        interviewToOffer: rate(funnel.offer, funnel.interview),
        offerToHire: rate(funnel.hired, funnel.offer),
        applicationToHire: rate(funnel.hired, funnel.applied),
      },
      scoreDistribution: scores,
      recentActivity,
      generatedAt: new Date().toISOString(),
    };
  }
}
