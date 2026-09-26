import { format, parseISO } from 'date-fns';
import { Briefcase, CalendarClock, FileText, Plus, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router';
import { APPLICATION_STATUS_LABELS } from '@hireflow/shared';
import { describeAudit } from '@/lib/audit';
import { ChartCard, ColumnChart, FunnelBars, RankedBarChart, TrendChart } from '@/components/charts';
import { AIDisclaimer, CardsSkeleton, EmptyState, ErrorState, PageHeader, StatCard } from '@/components/common';
import { InterviewStatusBadge } from '@/components/domain';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { useDashboard, useInterviews } from '@/features/api/misc';
import { useAuth } from '@/features/auth/use-auth';
import { Can } from '@/features/auth/guards';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime, timeAgo } from '@/lib/utils';

export default function OverviewPage() {
  useDocumentTitle('Overview');
  const { me } = useAuth();
  const { data, isLoading, isError, error, refetch } = useDashboard();
  const upcoming = useInterviews({ page: 1, upcoming: true, status: ['SCHEDULED'] });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me?.user.firstName ?? ''}`}
        description="Here’s what’s happening across your hiring pipeline."
        actions={
          <Can permission="jobs:write">
            <Button asChild>
              <Link to="/app/jobs/new">
                <Plus /> New job
              </Link>
            </Button>
          </Can>
        }
      />

      {isLoading ? (
        <CardsSkeleton count={5} className="xl:grid-cols-5" />
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Active jobs" value={data.totals.activeJobs} icon={Briefcase} hint="Published and accepting applications" />
            <StatCard label="Candidates" value={data.totals.totalCandidates} icon={Users} hint="Unique applicants" />
            <StatCard label="Applications" value={data.totals.applications} icon={FileText} hint={data.totals.averageMatchScore !== null ? `Avg. match score ${data.totals.averageMatchScore}` : undefined} />
            <StatCard label="Interviews" value={data.totals.interviews} icon={CalendarClock} hint={`${data.totals.upcomingInterviews} upcoming`} />
            <StatCard label="Hires" value={data.totals.hires} icon={Trophy} hint={data.conversion.applicationToHire !== null ? `${data.conversion.applicationToHire}% of applications` : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="Applications over time"
              description="Daily applications, last 30 days"
              unit="applications"
              labelHeader="Date"
              data={data.applicationsOverTime.map((d) => ({ label: format(parseISO(d.date), 'MMM d'), value: d.count }))}
            >
              <TrendChart unit="applications" data={data.applicationsOverTime.map((d) => ({ label: format(parseISO(d.date), 'MMM d'), value: d.count }))} />
            </ChartCard>
            <Card>
              <CardHeader>
                <CardTitle>Hiring funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <FunnelBars stages={data.funnel} />
                <p className="mt-4 text-xs text-muted-foreground">Furthest stage each application reached. Percentages are stage-to-stage conversion.</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Candidate pipeline"
              description="Applications currently in each stage"
              unit="applications"
              labelHeader="Stage"
              data={data.pipeline.filter((p) => p.status !== 'WITHDRAWN').map((p) => ({ label: APPLICATION_STATUS_LABELS[p.status], value: p.count }))}
            >
              <ColumnChart unit="applications" data={data.pipeline.filter((p) => p.status !== 'WITHDRAWN').map((p) => ({ label: APPLICATION_STATUS_LABELS[p.status], value: p.count }))} />
            </ChartCard>
            <ChartCard
              title="Applications per job"
              unit="applications"
              labelHeader="Job"
              data={data.applicationsPerJob.map((j) => ({ label: j.title, value: j.count, ...(j.averageScore !== null ? { detail: `Avg. score ${j.averageScore}` } : {}) }))}
            >
              <RankedBarChart unit="applications" data={data.applicationsPerJob.map((j) => ({ label: j.title, value: j.count, ...(j.averageScore !== null ? { detail: `Avg. score ${j.averageScore}` } : {}) }))} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Upcoming interviews</CardTitle>
                <Button variant="link" size="sm" asChild>
                  <Link to="/app/interviews">View all</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {upcoming.isLoading ? (
                  <Skeleton className="h-24" />
                ) : !upcoming.data?.items.length ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No upcoming interviews.</p>
                ) : (
                  <ul className="divide-y">
                    {upcoming.data.items.slice(0, 5).map((interview) => (
                      <li key={interview.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <Link to={`/app/applications/${interview.applicationId}`} className="truncate text-sm font-medium hover:text-primary">
                            {interview.candidate.firstName} {interview.candidate.lastName}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {interview.job.title} · {formatDateTime(interview.scheduledAt)}
                          </p>
                        </div>
                        <InterviewStatusBadge status={interview.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentActivity.length === 0 ? (
                  <EmptyState title="No activity yet" className="border-0 py-6" />
                ) : (
                  <ul className="space-y-3">
                    {data.recentActivity.slice(0, 6).map((entry) => (
                      <li key={entry.id} className="flex gap-3 text-sm">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                        <p className="min-w-0 flex-1">
                          <span className="font-medium">{entry.user?.name ?? 'System'}</span> {describeAudit(entry)}
                          <span className="block text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <AIDisclaimer />
        </>
      )}
    </div>
  );
}
