import { Briefcase, Building2, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { REMOTE_TYPE_LABELS } from '@hireflow/shared';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { ApplicationStatusBadge } from '@/components/domain';
import { Button, Card } from '@/components/ui';
import { useMyApplications } from '@/features/api/applications';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate } from '@/lib/utils';

export default function CandidateApplicationsPage() {
  useDocumentTitle('My applications');
  const { data, isLoading, isError, error, refetch } = useMyApplications();

  return (
    <div>
      <PageHeader title="My applications" description="Every application and where it stands." />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={Briefcase}
          title="You haven’t applied yet"
          description="Browse open roles and apply with your resume."
          action={
            <Button asChild>
              <Link to="/portal/jobs">Find jobs</Link>
            </Button>
          }
        />
      ) : (
        <Card className="divide-y overflow-hidden">
          {data.map((app) => (
            <Link
              key={app.id}
              to={`/portal/applications/${app.id}`}
              className="flex flex-col gap-2 p-4 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{app.job.title}</p>
                <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3.5" /> {app.job.organization.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />{' '}
                    {app.job.location ?? REMOTE_TYPE_LABELS[app.job.remoteType]}
                  </span>
                  <span>Applied {formatDate(app.appliedAt)}</span>
                </p>
              </div>
              <ApplicationStatusBadge status={app.status} className="self-start sm:self-auto" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
