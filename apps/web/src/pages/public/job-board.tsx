import { Briefcase, Building2, Clock, MapPin } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import {
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVEL_LABELS,
  EXPERIENCE_LEVELS,
  REMOTE_TYPE_LABELS,
  REMOTE_TYPES,
  type PublicJobDto,
} from '@hireflow/shared';
import { EmptyState, ErrorState, FilterPanel, ListSkeleton, PageHeader, Pagination, SearchInput } from '@/components/common';
import { SkillChips } from '@/components/domain';
import { Badge } from '@/components/ui';
import { usePublicJobs } from '@/features/api/jobs';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSearchParamsState } from '@/hooks/use-search-params-state';
import { cn, formatSalary, timeAgo } from '@/lib/utils';

const DEFAULTS = { search: '', location: '', remoteType: [] as string[], employmentType: [] as string[], experienceLevel: [] as string[], page: 1 };

const FILTERS = [
  { key: 'remoteType', label: 'Workplace', options: REMOTE_TYPES.map((v) => ({ value: v, label: REMOTE_TYPE_LABELS[v] })) },
  { key: 'employmentType', label: 'Employment', options: EMPLOYMENT_TYPES.map((v) => ({ value: v, label: EMPLOYMENT_TYPE_LABELS[v] })) },
  { key: 'experienceLevel', label: 'Level', options: EXPERIENCE_LEVELS.map((v) => ({ value: v, label: EXPERIENCE_LEVEL_LABELS[v] })) },
];

export function JobCard({ job, basePath }: { job: PublicJobDto; basePath: string }) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  return (
    <Link
      to={`${basePath}/${job.slug}`}
      className="group block rounded-xl border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold group-hover:text-primary">{job.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-3.5" /> {job.organization.name}
          </p>
        </div>
        <Badge variant="secondary">{REMOTE_TYPE_LABELS[job.remoteType]}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {job.location && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {job.location}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Briefcase className="size-3.5" /> {EMPLOYMENT_TYPE_LABELS[job.employmentType]} · {EXPERIENCE_LEVEL_LABELS[job.experienceLevel]}
        </span>
        {job.publishedAt && (
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" /> {timeAgo(job.publishedAt)}
          </span>
        )}
      </div>
      {job.skills.length > 0 && <SkillChips skills={job.skills} max={5} className="mt-4" />}
      {salary && <p className="mt-4 text-sm font-medium">{salary}</p>}
    </Link>
  );
}

export default function JobBoardPage() {
  const location = useLocation();
  const inPortal = location.pathname.startsWith('/portal');
  useDocumentTitle('Jobs');
  const [state, update] = useSearchParamsState(DEFAULTS);
  const { data, isLoading, isError, error, refetch, isFetching } = usePublicJobs(state);

  return (
    <div className={cn(!inPortal && 'mx-auto max-w-6xl px-4 py-10 sm:px-6')}>
      <PageHeader title={inPortal ? 'Find jobs' : 'Open positions'} description="Browse roles from companies hiring on HireFlow AI." />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="flex-1" value={state.search} onChange={(search) => update({ search })} placeholder="Search by title, skill or company" />
        <SearchInput className="sm:w-56" value={state.location} onChange={(loc) => update({ location: loc })} placeholder="Location" label="Location" />
        <FilterPanel
          groups={FILTERS}
          values={{ remoteType: state.remoteType, employmentType: state.employmentType, experienceLevel: state.experienceLevel }}
          onChange={(key, values) => update({ [key]: values })}
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data && data.items.length === 0 ? (
        <EmptyState title="No jobs match your search" description="Try removing filters or searching for a different skill." />
      ) : (
        <div className={cn('grid gap-4 md:grid-cols-2', isFetching && 'opacity-70')}>
          {data?.items.map((job) => <JobCard key={job.id} job={job} basePath={inPortal ? '/portal/jobs' : '/jobs'} />)}
        </div>
      )}
      <Pagination pagination={data?.pagination} onPageChange={(page) => update({ page })} />
    </div>
  );
}
