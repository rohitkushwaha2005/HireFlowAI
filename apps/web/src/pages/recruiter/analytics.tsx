import { format, parseISO } from 'date-fns';
import { APPLICATION_STATUS_LABELS } from '@hireflow/shared';
import { ChartCard, ColumnChart, FunnelBars, RankedBarChart, TrendChart } from '@/components/charts';
import { AIDisclaimer, CardsSkeleton, ErrorState, PageHeader, StatCard } from '@/components/common';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { ScoreBadge } from '@/components/domain';
import { useDashboard } from '@/features/api/misc';
import { RequirePermission } from '@/features/auth/guards';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/utils';

const pct = (value: number | null) => (value === null ? '—' : `${value}%`);

function AnalyticsContent() {
  const { data, isLoading, isError, error, refetch } = useDashboard();
  if (isLoading) return <CardsSkeleton count={8} />;
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const overTime = data.applicationsOverTime.map((d) => ({ label: format(parseISO(d.date), 'MMM d'), value: d.count }));
  const pipeline = data.pipeline.map((p) => ({ label: APPLICATION_STATUS_LABELS[p.status], value: p.count }));
  const skills = data.topSkills.map((s) => ({ label: s.skill, value: s.count }));
  const scores = data.scoreDistribution.map((s) => ({ label: s.bucket, value: s.count }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Application → interview" value={pct(data.conversion.applicationToInterview)} hint="Share of applications that reached an interview" />
        <StatCard label="Interview → offer" value={pct(data.conversion.interviewToOffer)} />
        <StatCard label="Offer → hire" value={pct(data.conversion.offerToHire)} />
        <StatCard label="Average match score" value={data.totals.averageMatchScore ?? '—'} hint="Across all scored applications" />
      </div>

      <ChartCard title="Application trend" description="Daily applications, last 30 days" unit="applications" labelHeader="Date" data={overTime}>
        <TrendChart unit="applications" data={overTime} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hiring funnel</CardTitle>
            <CardDescription>Furthest stage reached, with stage-to-stage conversion</CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelBars stages={data.funnel} />
          </CardContent>
        </Card>
        <ChartCard title="Candidates by stage" description="Current status of every application" unit="applications" labelHeader="Stage" data={pipeline}>
          <ColumnChart unit="applications" data={pipeline} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top candidate skills" description="Most common skills among applicants" unit="candidates" labelHeader="Skill" data={skills}>
          <RankedBarChart unit="candidates" data={skills} />
        </ChartCard>
        <ChartCard title="Match score distribution" description="How applicants score against their job" unit="applications" labelHeader="Score range" data={scores}>
          <ColumnChart unit="applications" data={scores} ramp />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job performance</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Applications</TableHead>
                <TableHead className="text-right">Avg. match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.applicationsPerJob.map((job) => (
                <TableRow key={job.jobId}>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell className="text-right tabular-nums">{job.count}</TableCell>
                  <TableCell className="text-right">
                    <ScoreBadge score={job.averageScore} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Computed with SQL aggregations · updated {formatDateTime(data.generatedAt)}</p>
      <AIDisclaimer />
    </div>
  );
}

export default function AnalyticsPage() {
  useDocumentTitle('Analytics');
  return (
    <div>
      <PageHeader title="Analytics" description="Hiring funnel, pipeline health and candidate insights." />
      <RequirePermission permission="analytics:read">
        <AnalyticsContent />
      </RequirePermission>
    </div>
  );
}
