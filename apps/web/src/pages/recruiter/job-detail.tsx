import {
  ArrowLeft,
  ChevronDown,
  GraduationCap,
  MapPin,
  Pencil,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  APPLICATION_STATUS_LABELS,
  EDUCATION_LEVEL_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  PIPELINE_STAGES,
  REMOTE_TYPE_LABELS,
  type JobDetailDto,
} from '@hireflow/shared';
import { ChartCard, ColumnChart } from '@/components/charts';
import {
  AIBadge,
  AIDisclaimer,
  DetailItem,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  PageLoader,
  Pagination,
  StatCard,
} from '@/components/common';
import { JobStatusBadge } from '@/components/domain';
import { Markdown } from '@/components/markdown';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { useJob, useJobApplications } from '@/features/api/jobs';
import { Can } from '@/features/auth/guards';
import { ApplicationTable } from '@/features/pipeline/application-table';
import { KanbanBoard } from '@/features/pipeline/kanban';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSearchParamsState } from '@/hooks/use-search-params-state';
import { formatDate, formatSalary } from '@/lib/utils';
import { JobActionsMenu } from './job-actions';

const DEFAULTS = { tab: 'overview', sort: 'score', page: 1 };

function Overview({ job }: { job: JobDetailDto }) {
  const required = job.requirements.filter((r) => r.required);
  const preferred = job.requirements.filter((r) => !r.required);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown content={job.description} />
          </CardContent>
        </Card>
        {job.responsibilities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Responsibilities</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {job.responsibilities.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Requirements</CardTitle>
            {job.analysisStatus === 'COMPLETED' && (
              <AIBadge provider={job.requirements.some((r) => r.aiGenerated) ? 'AI' : null} />
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {job.requirements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No requirements yet. Edit the job to add them.
              </p>
            ) : (
              <>
                {[
                  ['Required', required],
                  ['Nice to have', preferred],
                ].map(([label, list]) =>
                  (list as typeof required).length ? (
                    <div key={label as string}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {label as string}
                      </p>
                      <ul className="space-y-1.5">
                        {(list as typeof required).map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="flex items-center gap-1.5">
                              {r.skill}
                              {r.aiGenerated && (
                                <Sparkles
                                  className="size-3 text-primary"
                                  aria-label="Suggested by AI"
                                />
                              )}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {r.minimumYears ? `${r.minimumYears}+ yrs · ` : ''}
                              <span aria-label={`Importance ${r.weight} of 5`}>
                                {'●'.repeat(r.weight)}
                                <span className="opacity-30">{'●'.repeat(5 - r.weight)}</span>
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <DetailItem label="Workplace">{REMOTE_TYPE_LABELS[job.remoteType]}</DetailItem>
              <DetailItem label="Type">{EMPLOYMENT_TYPE_LABELS[job.employmentType]}</DetailItem>
              <DetailItem label="Seniority">
                {EXPERIENCE_LEVEL_LABELS[job.experienceLevel]}
              </DetailItem>
              <DetailItem label="Salary">
                {formatSalary(job.salaryMin, job.salaryMax, job.currency) ?? '—'}
              </DetailItem>
              <DetailItem label="Experience">
                <span className="flex items-center gap-1">
                  <Timer className="size-3.5" />
                  {job.minYearsExperience !== null ? `${job.minYearsExperience}+ yrs` : '—'}
                </span>
              </DetailItem>
              <DetailItem label="Education">
                <span className="flex items-center gap-1">
                  <GraduationCap className="size-3.5" />
                  {job.educationLevel ? EDUCATION_LEVEL_LABELS[job.educationLevel] : '—'}
                </span>
              </DetailItem>
              <DetailItem label="Created">{formatDate(job.createdAt)}</DetailItem>
              <DetailItem label="Published">{formatDate(job.publishedAt)}</DetailItem>
            </dl>
            {job.analysisSummary && (
              <div className="mt-4 rounded-lg bg-accent/50 p-3 text-xs text-accent-foreground">
                <p className="mb-1 flex items-center gap-1 font-medium">
                  <Sparkles className="size-3.5" /> AI summary
                </p>
                {job.analysisSummary}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function JobApplications({
  job,
  sort,
  page,
  onChange,
}: {
  job: JobDetailDto;
  sort: string;
  page: number;
  onChange: (patch: { sort?: string; page?: number }) => void;
}) {
  const { data, isLoading, isError, error, refetch } = useJobApplications(job.id, {
    page,
    sort,
    order: 'desc',
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {job.applicationCount} applicants{sort === 'score' ? ', ranked by match score' : ''}.
        </p>
        <Select
          aria-label="Sort applicants"
          className="w-48"
          value={sort}
          onValueChange={(s) => onChange({ sort: s })}
          options={[
            { value: 'score', label: 'Best match first' },
            { value: 'appliedAt', label: 'Newest first' },
          ]}
        />
      </div>
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.items.length ? (
        <EmptyState
          title="No applicants yet"
          description={
            job.status === 'PUBLISHED'
              ? 'Share the public job page to start receiving applications.'
              : 'Publish the job to start receiving applications.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ApplicationTable items={data.items} showJob={false} />
        </Card>
      )}
      <Pagination pagination={data?.pagination} onPageChange={(p) => onChange({ page: p })} />
      <AIDisclaimer compact />
    </div>
  );
}

function JobAnalytics({ job }: { job: JobDetailDto }) {
  const stages = PIPELINE_STAGES.map((s) => ({
    label: APPLICATION_STATUS_LABELS[s],
    value: job.pipeline[s],
  }));
  const active = PIPELINE_STAGES.filter((s) => !['HIRED', 'REJECTED'].includes(s)).reduce(
    (sum, s) => sum + job.pipeline[s],
    0,
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Applicants"
          value={job.applicationCount}
          hint={`${job.newApplicationCount} new this week`}
        />
        <StatCard label="In progress" value={active} />
        <StatCard label="Interviewing" value={job.pipeline.INTERVIEW} />
        <StatCard label="Hired" value={job.pipeline.HIRED} />
      </div>
      <ChartCard
        title="Applicants by stage"
        unit="applicants"
        labelHeader="Stage"
        data={stages}
        empty="No applicants yet"
      >
        <ColumnChart unit="applicants" data={stages} />
      </ChartCard>
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, update] = useSearchParamsState(DEFAULTS);
  const { data: job, isLoading, isError, error, refetch } = useJob(id);
  useDocumentTitle(job?.title);

  if (isLoading) return <PageLoader />;
  if (isError || !job) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/jobs" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-4" /> Jobs
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {job.title} <JobStatusBadge status={job.status} />
          </span>
        }
        description={
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {job.location ?? 'No location'} ·{' '}
            {REMOTE_TYPE_LABELS[job.remoteType]} · Created by {job.createdBy?.name ?? 'unknown'}
          </span>
        }
        actions={
          <>
            <Can permission="jobs:write">
              <Button variant="outline" asChild>
                <Link to={`/app/jobs/${job.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            </Can>
            <JobActionsMenu
              job={job}
              onDeleted={() => navigate('/app/jobs')}
              trigger={
                <Button variant="outline">
                  Actions <ChevronDown />
                </Button>
              }
            />
          </>
        }
      />
      <Tabs value={state.tab} onValueChange={(tab) => update({ tab })}>
        <TabsList>
          <TabsTrigger value="overview">Job information</TabsTrigger>
          <TabsTrigger value="applications">
            Applications{' '}
            <Badge variant="secondary" className="ml-1">
              {job.applicationCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview job={job} />
        </TabsContent>
        <TabsContent value="applications">
          <JobApplications job={job} sort={state.sort} page={state.page} onChange={update} />
        </TabsContent>
        <TabsContent value="pipeline">
          <KanbanBoard jobId={job.id} />
        </TabsContent>
        <TabsContent value="analytics">
          <JobAnalytics job={job} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
