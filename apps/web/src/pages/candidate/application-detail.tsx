import { ArrowLeft, CalendarClock, Check, ExternalLink } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@hireflow/shared';
import { ErrorState, PageHeader, PageLoader } from '@/components/common';
import { ApplicationStatusBadge } from '@/components/domain';
import { ConfirmDialog } from '@/components/forms';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useMyApplication, useWithdraw } from '@/features/api/applications';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

const JOURNEY: ApplicationStatus[] = [
  'APPLIED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
];

export default function CandidateApplicationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: app, isLoading, isError, error, refetch } = useMyApplication(id);
  const withdraw = useWithdraw();
  const [confirm, setConfirm] = React.useState(false);
  useDocumentTitle(app?.job.title ?? 'Application');

  if (isLoading) return <PageLoader />;
  if (isError || !app) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const ended = ['REJECTED', 'WITHDRAWN'].includes(app.status);
  const currentIndex = JOURNEY.indexOf(app.status);
  const reachedAt = new Map(app.history.map((h) => [h.status, h.at]));

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link
            to="/portal/applications"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> My applications
          </Link>
        }
        title={app.job.title}
        description={`${app.job.organization.name} · applied ${formatDate(app.appliedAt)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/portal/jobs/${app.job.slug}`}>
                <ExternalLink /> View job
              </Link>
            </Button>
            {!ended && app.status !== 'HIRED' && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirm(true)}
              >
                Withdraw
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Application status</CardTitle>
            <ApplicationStatusBadge status={app.status} />
          </CardHeader>
          <CardContent>
            {ended ? (
              <p className="text-sm text-muted-foreground">
                {app.status === 'WITHDRAWN'
                  ? 'You withdrew this application.'
                  : 'The team decided not to move forward with this application. Thank you for applying — we encourage you to apply to other roles.'}
              </p>
            ) : (
              <ol className="space-y-4" aria-label="Application progress">
                {JOURNEY.map((status, index) => {
                  const done = index <= currentIndex;
                  return (
                    <li
                      key={status}
                      className="flex items-center gap-3"
                      aria-current={index === currentIndex ? 'step' : undefined}
                    >
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                          done
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        {done ? (
                          <Check className="size-4" />
                        ) : (
                          <span className="text-xs">{index + 1}</span>
                        )}
                      </span>
                      <div>
                        <p className={cn('text-sm font-medium', !done && 'text-muted-foreground')}>
                          {APPLICATION_STATUS_LABELS[status]}
                        </p>
                        {reachedAt.get(status) && (
                          <p className="text-xs text-muted-foreground">
                            {formatDate(reachedAt.get(status))}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Interviews</CardTitle>
            </CardHeader>
            <CardContent>
              {app.upcomingInterviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No interviews scheduled yet. You’ll get an email when one is.
                </p>
              ) : (
                <ul className="space-y-3">
                  {app.upcomingInterviews.map((i) => (
                    <li key={i.id} className="rounded-lg border p-3 text-sm">
                      <p className="flex items-center gap-1.5 font-medium">
                        <CalendarClock className="size-4 text-primary" />{' '}
                        {formatDateTime(i.scheduledAt)}
                      </p>
                      <p className="text-muted-foreground">
                        {i.duration} min · {i.type.toLowerCase()}
                        {i.interviewerName ? ` with ${i.interviewerName}` : ''}
                      </p>
                      {i.meetingUrl && (
                        <a
                          href={i.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Join meeting
                        </a>
                      )}
                      {i.location && <p className="text-muted-foreground">{i.location}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Submitted resume</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {app.resume?.fileName ?? 'No resume'}
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Withdraw this application?"
        description="The hiring team will be informed and any scheduled interviews will be cancelled. You can apply again later while the job is open."
        confirmLabel="Withdraw"
        destructive
        loading={withdraw.isPending}
        onConfirm={() =>
          withdraw.mutate(app.id, {
            onSuccess: () => {
              setConfirm(false);
              navigate('/portal/applications');
            },
          })
        }
      />
    </div>
  );
}
