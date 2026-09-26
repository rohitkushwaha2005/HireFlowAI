import { SquareKanban, List } from 'lucide-react';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUSES } from '@hireflow/shared';
import { AIDisclaimer, EmptyState, ErrorState, FilterPanel, ListSkeleton, PageHeader, Pagination, SearchInput } from '@/components/common';
import { Card, Select, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { useApplications } from '@/features/api/applications';
import { useJobs } from '@/features/api/jobs';
import { ApplicationTable } from '@/features/pipeline/application-table';
import { KanbanBoard } from '@/features/pipeline/kanban';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSearchParamsState } from '@/hooks/use-search-params-state';
import { cn } from '@/lib/utils';

const DEFAULTS = { view: 'board', jobId: 'all', search: '', status: [] as string[], sort: 'score', page: 1 };
const STATUS_FILTER = [{ key: 'status', label: 'Stage', options: APPLICATION_STATUSES.map((s) => ({ value: s, label: APPLICATION_STATUS_LABELS[s] })) }];
const SORTS = [
  { value: 'score', label: 'Best match first' },
  { value: 'appliedAt', label: 'Newest first' },
  { value: 'updatedAt', label: 'Recently updated' },
];

export default function ApplicationsPage() {
  useDocumentTitle('Applications');
  const [state, update] = useSearchParamsState(DEFAULTS);
  const jobs = useJobs({ page: 1, pageSize: 100, status: ['PUBLISHED', 'PAUSED', 'CLOSED'] });
  const jobId = state.jobId === 'all' ? undefined : state.jobId;
  const list = useApplications({
    page: state.page,
    ...(jobId ? { jobId } : {}),
    search: state.search,
    status: state.status,
    sort: state.sort,
    order: 'desc',
  });

  const jobOptions = [{ value: 'all', label: 'All jobs' }, ...(jobs.data?.items ?? []).map((j) => ({ value: j.id, label: j.title }))];

  return (
    <div>
      <PageHeader title="Applications" description="Review applicants and move them through your hiring pipeline." />
      <Tabs value={state.view} onValueChange={(view) => update({ view })}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <TabsList>
            <TabsTrigger value="board"><SquareKanban /> Pipeline</TabsTrigger>
            <TabsTrigger value="list"><List /> List</TabsTrigger>
          </TabsList>
          <Select aria-label="Filter by job" className="lg:w-64" value={state.jobId} onValueChange={(v) => update({ jobId: v })} options={jobOptions} />
          {state.view === 'list' && (
            <>
              <SearchInput className="flex-1" value={state.search} onChange={(search) => update({ search })} placeholder="Search candidates" />
              <Select aria-label="Sort applications" className="lg:w-48" value={state.sort} onValueChange={(sort) => update({ sort })} options={SORTS} />
              <FilterPanel groups={STATUS_FILTER} values={{ status: state.status }} onChange={(_k, status) => update({ status })} />
            </>
          )}
        </div>
        <TabsContent value="board" className="mt-0">
          <KanbanBoard {...(jobId ? { jobId } : {})} />
        </TabsContent>
        <TabsContent value="list" className="mt-0">
          {list.isLoading ? (
            <ListSkeleton />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : !list.data?.items.length ? (
            <EmptyState title="No applications found" description="Applications appear here as candidates apply to your published jobs." />
          ) : (
            <Card className={cn('overflow-hidden', list.isFetching && 'opacity-70')}>
              <ApplicationTable items={list.data.items} showJob={!jobId} />
            </Card>
          )}
          <Pagination pagination={list.data?.pagination} onPageChange={(page) => update({ page })} />
        </TabsContent>
      </Tabs>
      <AIDisclaimer compact className="mt-6" />
    </div>
  );
}
