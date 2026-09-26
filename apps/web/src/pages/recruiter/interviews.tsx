import { CalendarClock, Video } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Pagination } from '@/components/common';
import { InterviewStatusBadge } from '@/components/domain';
import { Card, Switch, Label, Tabs, TabsList, TabsTrigger, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { useInterviews } from '@/features/api/misc';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSearchParamsState } from '@/hooks/use-search-params-state';
import { formatDateTime } from '@/lib/utils';

const DEFAULTS = { view: 'upcoming', mine: '', page: 1 };

export default function InterviewsPage() {
  useDocumentTitle('Interviews');
  const [state, update] = useSearchParamsState(DEFAULTS);
  const upcoming = state.view === 'upcoming';
  const { data, isLoading, isError, error, refetch } = useInterviews({
    page: state.page,
    upcoming,
    mine: state.mine === 'true',
    ...(upcoming ? { status: ['SCHEDULED'] } : {}),
  });

  return (
    <div>
      <PageHeader title="Interviews" description="Upcoming and past interviews across your jobs. Schedule new interviews from an application." />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Tabs value={state.view} onValueChange={(view) => update({ view })}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="all">All interviews</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Switch id="mine" checked={state.mine === 'true'} onCheckedChange={(v) => update({ mine: v ? 'true' : '' })} />
          <Label htmlFor="mine" className="font-normal">Only mine</Label>
        </div>
      </div>
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.items.length ? (
        <EmptyState icon={CalendarClock} title={upcoming ? 'No upcoming interviews' : 'No interviews yet'} description="Open an application and choose “Schedule” to set one up." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Interviewer</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link to={`/app/applications/${i.applicationId}`} className="font-medium hover:text-primary">{i.candidate.firstName} {i.candidate.lastName}</Link>
                    <p className="text-xs text-muted-foreground">{i.job.title}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(i.scheduledAt)}<p className="text-xs text-muted-foreground">{i.duration} min</p></TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="flex items-center gap-1.5 text-sm">
                      {i.meetingUrl && <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" aria-label="Join meeting" className="text-primary"><Video className="size-4" /></a>}
                      {i.type.charAt(0) + i.type.slice(1).toLowerCase()}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{i.interviewer?.name ?? '—'}</TableCell>
                  <TableCell><InterviewStatusBadge status={i.status} /></TableCell>
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
