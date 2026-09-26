import { ArrowLeft, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ErrorState, PageHeader, PageLoader } from '@/components/common';
import { ApplicationStatusBadge, InterviewStatusBadge, ParsingStatusBadge, ScoreBadge } from '@/components/domain';
import { Avatar, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { openResume, useCandidate } from '@/features/api/candidates';
import { ContactLinks, EducationCard, ExperienceCard, ProjectsCard, SkillsCard } from '@/features/candidates/profile-sections';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate, formatDateTime, initialsOf } from '@/lib/utils';

export default function CandidateDetailPage() {
  const { id } = useParams();
  const { data, isLoading, isError, error, refetch } = useCandidate(id);
  const profile = data?.profile;
  useDocumentTitle(profile ? `${profile.firstName} ${profile.lastName}` : 'Candidate');

  if (isLoading) return <PageLoader />;
  if (isError || !data || !profile) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        breadcrumb={<Link to="/app/candidates" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Candidates</Link>}
        title={
          <span className="flex items-center gap-3">
            <Avatar src={profile.avatarUrl} fallback={initialsOf(profile.firstName, profile.lastName)} className="size-10" />
            {profile.firstName} {profile.lastName}
          </span>
        }
        description={profile.headline ?? undefined}
      />
      <div className="mb-6"><ContactLinks profile={profile} /></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {profile.summary && <Card><CardHeader><CardTitle>Summary</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{profile.summary}</CardContent></Card>}
          <ExperienceCard profile={profile} />
          <ProjectsCard profile={profile} />
          <EducationCard profile={profile} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Applications</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.applications.map((app) => (
                <Link key={app.id} to={`/app/applications/${app.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{app.job.title}</p>
                    <p className="text-xs text-muted-foreground">Applied {formatDate(app.appliedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ApplicationStatusBadge status={app.status} />
                    <ScoreBadge score={app.overallScore} pending={app.matchStatus === 'PENDING'} />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <SkillsCard profile={profile} />
          <Card>
            <CardHeader><CardTitle>Resumes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {profile.resumes.length === 0 ? <p className="text-sm text-muted-foreground">No resumes.</p> : profile.resumes.map((resume) => (
                <div key={resume.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{resume.fileName}</span>
                  <div className="flex items-center gap-2">
                    <ParsingStatusBadge status={resume.parsingStatus} />
                    <Button variant="ghost" size="icon-sm" onClick={() => void openResume(resume.id)} aria-label={`Open ${resume.fileName}`}><FileText /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Interview history</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.interviews.length === 0 ? <p className="text-sm text-muted-foreground">No interviews yet.</p> : data.interviews.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{i.job.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(i.scheduledAt)}</p>
                  </div>
                  <InterviewStatusBadge status={i.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
