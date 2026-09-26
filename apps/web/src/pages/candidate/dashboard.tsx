import { ArrowRight, Briefcase, CalendarClock, FileText, ListChecks, Sparkles, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { CardsSkeleton, EmptyState, ErrorState, PageHeader, StatCard } from '@/components/common';
import { ApplicationStatusBadge, ParsingStatusBadge } from '@/components/domain';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from '@/components/ui';
import { useCandidateDashboard } from '@/features/api/candidates';
import { useAuth } from '@/features/auth/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { JobCard } from '@/pages/public/job-board';

export default function CandidateDashboardPage() {
  useDocumentTitle('Dashboard');
  const { me } = useAuth();
  const { data, isLoading, isError, error, refetch } = useCandidateDashboard();

  if (isLoading) return <CardsSkeleton />;
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader title={`Hi ${me?.user.firstName ?? 'there'} 👋`} description="Track your applications and discover roles that fit your experience." />

      {data.profileCompleteness < 100 && (
        <Card className="border-primary/30 bg-accent/30">
          <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-2">
              <p className="font-medium">Your profile is {data.profileCompleteness}% complete</p>
              <Progress value={data.profileCompleteness} aria-label="Profile completeness" />
              <p className="text-sm text-muted-foreground">
                {data.primaryResume ? 'Add missing details so hiring teams see your full story.' : 'Upload your resume — we’ll fill in your profile automatically.'}
              </p>
            </div>
            <Button asChild>
              <Link to={data.primaryResume ? '/portal/profile' : '/portal/resume'}>{data.primaryResume ? 'Complete profile' : 'Upload resume'} <ArrowRight /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Applications" value={data.applications.total} icon={ListChecks} />
        <StatCard label="Active" value={data.applications.active} icon={Briefcase} />
        <StatCard label="Interviewing" value={data.applications.interviews} icon={CalendarClock} />
        <StatCard label="Offers" value={data.applications.offers} icon={Trophy} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent applications</CardTitle>
            <Button variant="link" size="sm" asChild><Link to="/portal/applications">View all</Link></Button>
          </CardHeader>
          <CardContent>
            {data.recentApplications.length === 0 ? (
              <EmptyState icon={Briefcase} title="No applications yet" description="Find a role you like and apply in a few clicks." action={<Button asChild><Link to="/portal/jobs">Browse jobs</Link></Button>} className="border-0 py-6" />
            ) : (
              <ul className="divide-y">
                {data.recentApplications.map((app) => (
                  <li key={app.id}>
                    <Link to={`/portal/applications/${app.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-primary">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{app.job.title}</p>
                        <p className="truncate text-sm text-muted-foreground">{app.job.organization.name} · applied {timeAgo(app.appliedAt)}</p>
                      </div>
                      <ApplicationStatusBadge status={app.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Upcoming interviews</CardTitle></CardHeader>
            <CardContent>
              {data.upcomingInterviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.upcomingInterviews.map((i) => (
                    <li key={i.id} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">{i.job.title}</p>
                      <p className="text-muted-foreground">{i.job.organizationName}</p>
                      <p className="mt-1 flex items-center gap-1.5"><CalendarClock className="size-4 text-primary" /> {formatDateTime(i.scheduledAt)}</p>
                      {i.meetingUrl && <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-primary hover:underline">Join meeting</a>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Resume</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.primaryResume ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0" /><span className="truncate">{data.primaryResume.fileName}</span></span>
                  <ParsingStatusBadge status={data.primaryResume.parsingStatus} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No resume uploaded.</p>
              )}
              <Button variant="outline" size="sm" className="w-full" asChild><Link to="/portal/resume">Manage resumes</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {data.recommendedJobs.length > 0 && (
        <section aria-labelledby="recommended">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recommended" className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-5 text-primary" /> Recommended for you
            </h2>
            {data.recommendedJobs[0]?.similarity === null && <Badge variant="muted">Upload a resume for personalized picks</Badge>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {data.recommendedJobs.map((job) => <JobCard key={job.id} job={job} basePath="/portal/jobs" />)}
          </div>
        </section>
      )}
    </div>
  );
}
