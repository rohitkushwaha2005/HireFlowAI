import { CalendarClock, MapPin, Video } from 'lucide-react';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { InterviewStatusBadge } from '@/components/domain';
import { Card } from '@/components/ui';
import { useMyInterviews } from '@/features/api/misc';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/utils';

export default function CandidateInterviewsPage() {
  useDocumentTitle('Interviews');
  const { data, isLoading, isError, error, refetch } = useMyInterviews();
  const now = Date.now();
  const upcoming = (data ?? []).filter((i) => i.status === 'SCHEDULED' && new Date(i.scheduledAt).getTime() > now - 3600_000);
  const past = (data ?? []).filter((i) => !upcoming.includes(i));

  const List = ({ items }: { items: typeof upcoming }) => (
    <Card className="divide-y overflow-hidden">
      {items.map((i) => (
        <div key={i.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{i.job.title}</p>
            <p className="text-sm text-muted-foreground">{i.job.organizationName}{i.interviewerName ? ` · with ${i.interviewerName}` : ''}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm"><CalendarClock className="size-4 text-primary" /> {formatDateTime(i.scheduledAt)} · {i.duration} min</p>
            {i.meetingUrl && <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Video className="size-4" /> Join meeting</a>}
            {i.location && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" /> {i.location}</p>}
          </div>
          <InterviewStatusBadge status={i.status} />
        </div>
      ))}
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Interviews" description="Your scheduled and past interviews." />
      {isLoading ? <ListSkeleton rows={2} /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">Upcoming</h2>
            {upcoming.length ? <List items={upcoming} /> : <EmptyState icon={CalendarClock} title="No upcoming interviews" description="When a team schedules an interview you’ll see it here and get an email." />}
          </section>
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold">Past</h2>
              <List items={past} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
