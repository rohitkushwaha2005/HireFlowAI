import { ArrowLeft, CalendarPlus, CheckCircle2, FileText, History, MessageSquare, Send, Star, UserRound, XCircle } from 'lucide-react';
import * as React from 'react';
import { Link, useParams } from 'react-router';
import {
  APPLICATION_STATUS_LABELS,
  PIPELINE_STAGES,
  type ApplicationDetailDto,
  type InterviewDto,
  type PipelineStage,
} from '@hireflow/shared';
import { ErrorState, PageHeader, PageLoader } from '@/components/common';
import { ApplicationStatusBadge, InterviewStatusBadge, ParsingStatusBadge } from '@/components/domain';
import { ConfirmDialog } from '@/components/forms';
import { Markdown } from '@/components/markdown';
import { Button, Card, CardContent, CardHeader, CardTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { useAddNote, useApplication, useMoveApplication } from '@/features/api/applications';
import { openResume, useCandidate } from '@/features/api/candidates';
import { useUpdateInterview } from '@/features/api/misc';
import { MatchPanel } from '@/features/applications/match-panel';
import { useAuth } from '@/features/auth/use-auth';
import { Can } from '@/features/auth/guards';
import { ContactLinks, EducationCard, ExperienceCard, ProjectsCard, SkillsCard } from '@/features/candidates/profile-sections';
import { QuestionsPanel } from '@/features/interviews/questions-panel';
import { ScheduleInterviewDialog } from '@/features/interviews/schedule-dialog';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatBytes, formatDateTime, timeAgo } from '@/lib/utils';

function StageControls({ application }: { application: ApplicationDetailDto }) {
  const move = useMoveApplication();
  const [confirm, setConfirm] = React.useState<PipelineStage | null>(null);
  if (application.status === 'WITHDRAWN') return <p className="text-sm text-muted-foreground">The candidate withdrew this application.</p>;

  const request = (to: PipelineStage) => {
    if (['REJECTED', 'OFFER', 'HIRED'].includes(to)) setConfirm(to);
    else move.mutate({ id: application.id, from: application.status, to });
  };
  const next: Partial<Record<string, PipelineStage>> = { APPLIED: 'SCREENING', SCREENING: 'SHORTLISTED', SHORTLISTED: 'INTERVIEW', INTERVIEW: 'OFFER', OFFER: 'HIRED' };
  const nextStage = next[application.status];

  return (
    <Can permission="applications:move">
      <div className="flex flex-wrap gap-2">
        {nextStage && (
          <Button onClick={() => request(nextStage)} loading={move.isPending}>
            <CheckCircle2 /> {nextStage === 'SHORTLISTED' ? 'Shortlist' : `Move to ${APPLICATION_STATUS_LABELS[nextStage]}`}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Change stage</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {PIPELINE_STAGES.filter((s) => s !== application.status).map((stage) => (
              <DropdownMenuItem key={stage} destructive={stage === 'REJECTED'} onSelect={() => request(stage)}>
                {APPLICATION_STATUS_LABELS[stage]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {application.status !== 'REJECTED' && (
          <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => request('REJECTED')}>
            <XCircle /> Reject
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? `Move to ${APPLICATION_STATUS_LABELS[confirm]}?` : ''}
        description={
          confirm === 'REJECTED'
            ? 'The candidate will be notified. Please confirm this decision was reviewed by a person — AI scores are never a reason to reject on their own.'
            : 'The candidate will be notified by email.'
        }
        destructive={confirm === 'REJECTED'}
        confirmLabel="Confirm"
        onConfirm={() => {
          if (confirm) move.mutate({ id: application.id, from: application.status, to: confirm });
          setConfirm(null);
        }}
      />
    </Can>
  );
}

function InterviewItem({ interview }: { interview: InterviewDto }) {
  const update = useUpdateInterview();
  const [feedback, setFeedback] = React.useState(interview.feedback ?? '');
  const [rating, setRating] = React.useState(interview.rating ?? 0);
  const [editing, setEditing] = React.useState(false);
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{interview.type.charAt(0) + interview.type.slice(1).toLowerCase()} interview · {interview.duration} min</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(interview.scheduledAt)} · with {interview.interviewer?.name ?? 'TBD'}</p>
        </div>
        <InterviewStatusBadge status={interview.status} />
      </div>
      {interview.meetingUrl && <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">{interview.meetingUrl}</a>}
      {interview.feedback && !editing && <p className="rounded-md bg-muted/60 p-2 text-sm">“{interview.feedback}” {interview.rating ? <span className="text-warning">{'★'.repeat(interview.rating)}</span> : null}</p>}
      <Can permission="interviews:write">
        {editing ? (
          <div className="space-y-2">
            <Textarea rows={3} aria-label="Interview feedback" placeholder="Feedback and recommendation" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)} className="p-0.5">
                  <Star className={n <= rating ? 'size-5 fill-warning text-warning' : 'size-5 text-muted-foreground'} />
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button
                  size="sm"
                  loading={update.isPending}
                  onClick={() =>
                    update.mutate(
                      { id: interview.id, status: 'COMPLETED', feedback: feedback || null, rating: rating || null },
                      { onSuccess: () => setEditing(false) },
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : (
          interview.status === 'SCHEDULED' && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Record feedback</Button>
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: interview.id, status: 'CANCELLED' })}>Cancel interview</Button>
            </div>
          )
        )}
      </Can>
    </li>
  );
}

function NotesAndHistory({ application }: { application: ApplicationDetailDto }) {
  const addNote = useAddNote(application.id);
  const [body, setBody] = React.useState('');
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="size-4" /> Team notes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) addNote.mutate(body.trim(), { onSuccess: () => setBody('') });
            }}
            className="space-y-2"
          >
            <Textarea rows={3} aria-label="Add a note" placeholder="Add a private note for your team…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
            <div className="flex justify-end">
              <Button size="sm" type="submit" loading={addNote.isPending} disabled={!body.trim()}><Send /> Add note</Button>
            </div>
          </form>
          {application.notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet. Notes are never visible to the candidate.</p>
          ) : (
            <ul className="space-y-3">
              {application.notes.map((note) => (
                <li key={note.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note.author.name} · {timeAgo(note.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> Status history</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative space-y-4 border-l pl-5">
            {application.history.map((event) => (
              <li key={event.id} className="relative text-sm">
                <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
                <p>
                  {event.fromStatus ? <>{APPLICATION_STATUS_LABELS[event.fromStatus]} → </> : 'Applied as '}
                  <span className="font-medium">{APPLICATION_STATUS_LABELS[event.toStatus]}</span>
                </p>
                <p className="text-xs text-muted-foreground">{event.changedBy?.name ?? 'Candidate'} · {formatDateTime(event.createdAt)}</p>
                {event.note && <p className="mt-1 text-xs italic text-muted-foreground">{event.note}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: application, isLoading, isError, error, refetch } = useApplication(id);
  const candidate = useCandidate(application?.candidate.id);
  const [scheduling, setScheduling] = React.useState(false);
  const name = application ? `${application.candidate.firstName} ${application.candidate.lastName}` : '';
  useDocumentTitle(name || 'Application');

  if (isLoading) return <PageLoader />;
  if (isError || !application) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const profile = candidate.data?.profile;

  return (
    <div>
      <PageHeader
        breadcrumb={<Link to="/app/applications" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Applications</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{name} <ApplicationStatusBadge status={application.status} /></span>}
        description={
          <>
            {application.candidate.headline ?? 'Candidate'} · applied to{' '}
            <Link to={`/app/jobs/${application.job.id}`} className="text-primary hover:underline">{application.job.title}</Link> {timeAgo(application.appliedAt)}
          </>
        }
        actions={<StageControls application={application} />}
      />

      <Tabs defaultValue="match">
        <TabsList>
          <TabsTrigger value="match">Match</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
          <TabsTrigger value="activity">Notes & history</TabsTrigger>
        </TabsList>

        <TabsContent value="match">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <MatchPanel application={application} />
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" /> Resume</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {application.resume ? (
                    <>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{application.resume.fileName}</span>
                        <ParsingStatusBadge status={application.resume.parsingStatus} />
                      </div>
                      <p className="text-xs text-muted-foreground">{formatBytes(application.resume.fileSize)} · uploaded {timeAgo(application.resume.createdAt)}</p>
                      <Button variant="outline" className="w-full" onClick={() => void openResume(application.resume!.id)}>
                        <FileText /> Open resume
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No resume attached.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-4" /> Candidate</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {profile ? <ContactLinks profile={profile} /> : <p className="text-muted-foreground">{application.candidate.email}</p>}
                  <Button variant="link" className="h-auto p-0" asChild>
                    <Link to={`/app/candidates/${application.candidate.id}`}>View full candidate profile →</Link>
                  </Button>
                </CardContent>
              </Card>
              {application.coverLetter && (
                <Card>
                  <CardHeader><CardTitle>Cover letter</CardTitle></CardHeader>
                  <CardContent><Markdown content={application.coverLetter} className="text-muted-foreground" /></CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="profile">
          {!profile ? (
            candidate.isError ? <ErrorState error={candidate.error} /> : <PageLoader />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <div className="space-y-6">
                {profile.summary && (
                  <Card><CardHeader><CardTitle>Summary</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{profile.summary}</CardContent></Card>
                )}
                <ExperienceCard profile={profile} />
                <ProjectsCard profile={profile} />
              </div>
              <div className="space-y-6">
                <SkillsCard profile={profile} />
                <EducationCard profile={profile} />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="interviews">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <QuestionsPanel applicationId={application.id} questions={application.questions} />
            <Card className="self-start">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Scheduled interviews</CardTitle>
                {can('interviews:write') && !['REJECTED', 'HIRED', 'WITHDRAWN'].includes(application.status) && (
                  <Button size="sm" onClick={() => setScheduling(true)}><CalendarPlus /> Schedule</Button>
                )}
              </CardHeader>
              <CardContent>
                {application.interviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No interviews scheduled yet.</p>
                ) : (
                  <ul className="space-y-3">{application.interviews.map((i) => <InterviewItem key={i.id} interview={i} />)}</ul>
                )}
              </CardContent>
            </Card>
          </div>
          <ScheduleInterviewDialog open={scheduling} onOpenChange={setScheduling} applicationId={application.id} candidateName={name} />
        </TabsContent>

        <TabsContent value="activity">
          <NotesAndHistory application={application} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
