import { Briefcase, MapPin, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { JOB_STATUSES, REMOTE_TYPE_LABELS } from '@hireflow/shared';
import { EmptyState, ErrorState, FilterPanel, ListSkeleton, PageHeader, Pagination, SearchInput } from '@/components/common';
import { JobStatusBadge } from '@/components/domain';
import { Badge, Button, Card, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { useJobs } from '@/features/api/jobs';
import { Can } from '@/features/auth/guards';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSearchParamsState } from '@/hooks/use-search-params-state';
import { cn, formatDate } from '@/lib/utils';
import { JobActionsMenu } from './job-actions';

const DEFAULTS = { search: '', status: [] as string[], sort: 'createdAt', page: 1 };
const STATUS_FILTER = [{ key: 'status', label: 'Status', options: JOB_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) }];
const SORTS = [
  { value: 'createdAt', label: 'Newest' },
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'title', label: 'Title (A–Z)' },
];

export default function JobsPage() {
  useDocumentTitle('Jobs');
  const navigate = useNavigate();
  const [state, update] = useSearchParamsState(DEFAULTS);
  const { data, isLoading, isError, error, refetch, isFetching } = useJobs({
    page: state.page,
    search: state.search,
    status: state.status,
    sort: state.sort,
    order: state.sort === 'title' ? 'asc' : 'desc',
  });

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Create, publish and manage your open positions."
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="flex-1" value={state.search} onChange={(search) => update({ search })} placeholder="Search jobs by title or location" />
        <Select aria-label="Sort jobs" className="sm:w-48" value={state.sort} onValueChange={(sort) => update({ sort })} options={SORTS} />
        <FilterPanel groups={STATUS_FILTER} values={{ status: state.status }} onChange={(_k, status) => update({ status })} />
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={Briefcase}
          title={state.search || state.status.length ? 'No jobs match your filters' : 'No jobs yet'}
          description={state.search || state.status.length ? 'Try a different search.' : 'Create your first job and let AI extract the requirements.'}
          action={
            <Can permission="jobs:write">
              <Button asChild>
                <Link to="/app/jobs/new"><Plus /> Create a job</Link>
              </Button>
            </Can>
          }
        />
      ) : (
        <Card className={cn('overflow-hidden', isFetching && 'opacity-70')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Applicants</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((job) => (
                <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(`/app/jobs/${job.id}`)}>
                  <TableCell>
                    <Link to={`/app/jobs/${job.id}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
                      {job.title}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {job.location ?? 'No location'} · {REMOTE_TYPE_LABELS[job.remoteType]}
                    </p>
                  </TableCell>
                  <TableCell><JobStatusBadge status={job.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {job.applicationCount}
                    {job.newApplicationCount > 0 && <Badge variant="success" className="ml-2">+{job.newApplicationCount} new</Badge>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(job.createdAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <JobActionsMenu job={job} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination pagination={data?.pagination} onPageChange={(page) => update({ page })} />
    </div>
  );
}
