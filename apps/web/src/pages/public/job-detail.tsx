import {
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  GraduationCap,
  MapPin,
  Timer,
  Upload,
} from 'lucide-react';
import * as React from 'react';
import { Link, useLocation, useParams } from 'react-router';
import {
  EDUCATION_LEVEL_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  REMOTE_TYPE_LABELS,
  type PublicJobDetailDto,
} from '@hireflow/shared';
import { ErrorState, PageLoader } from '@/components/common';
import { ApplicationStatusBadge, ParsingStatusBadge } from '@/components/domain';
import { FormError } from '@/components/forms';
import { Markdown } from '@/components/markdown';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Textarea,
} from '@/components/ui';
import { useApply } from '@/features/api/applications';
import { useMyResumes, useUploadResume } from '@/features/api/candidates';
import { usePublicJob } from '@/features/api/jobs';
import { useAuth } from '@/features/auth/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn, formatDate, formatSalary } from '@/lib/utils';

function ApplyPanel({ job }: { job: PublicJobDetailDto }) {
  const resumes = useMyResumes();
  const upload = useUploadResume();
  const apply = useApply(job.id);
  const [resumeId, setResumeId] = React.useState<string | null>(null);
  const [coverLetter, setCoverLetter] = React.useState('');
  const fileInput = React.useRef<HTMLInputElement>(null);

  const list = resumes.data ?? [];
  const selected = resumeId ?? list.find((r) => r.isPrimary)?.id ?? list[0]?.id ?? null;

  if (apply.isSuccess || job.viewerApplication) {
    const application = apply.data ?? job.viewerApplication!;
    return (
      <Card>
        <CardContent className="space-y-3 pt-5 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <p className="font-semibold">You applied to this job</p>
          <ApplicationStatusBadge status={application.status} />
          <Button variant="outline" className="w-full" asChild>
            <Link to={`/portal/applications/${application.id}`}>Track application</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply for this role</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Resume</legend>
          {resumes.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading resumes…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Upload a PDF resume to apply.</p>
          ) : (
            list.map((resume) => (
              <label
                key={resume.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm',
                  selected === resume.id && 'border-primary bg-accent/50',
                )}
              >
                <input
                  type="radio"
                  name="resume"
                  className="accent-[var(--primary)]"
                  checked={selected === resume.id}
                  onChange={() => setResumeId(resume.id)}
                />
                <span className="min-w-0 flex-1 truncate">{resume.fileName}</span>
                <ParsingStatusBadge status={resume.parsingStatus} />
              </label>
            ))
          )}
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="Upload resume PDF"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate({ file }, { onSuccess: (resume) => setResumeId(resume.id) });
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            loading={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload /> Upload new resume (PDF)
          </Button>
          <FormError error={upload.error} />
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="coverLetter">Cover letter (optional)</Label>
          <Textarea
            id="coverLetter"
            rows={4}
            maxLength={5000}
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
          />
        </div>
        <FormError error={apply.error} />
        <Button
          className="w-full"
          disabled={!selected}
          loading={apply.isPending}
          onClick={() =>
            selected &&
            apply.mutate({
              resumeId: selected,
              ...(coverLetter.trim() ? { coverLetter: coverLetter.trim() } : {}),
            })
          }
        >
          Submit application
        </Button>
        <p className="text-xs text-muted-foreground">
          Your application is reviewed by the hiring team. AI tools help summarize profiles; they
          never make decisions on their own.
        </p>
      </CardContent>
    </Card>
  );
}

function ApplyCallToAction({ job }: { job: PublicJobDetailDto }) {
  const { status, isCandidate } = useAuth();
  const target = `/portal/jobs/${job.slug}`;
  if (status === 'authenticated' && isCandidate) {
    return (
      <Button className="w-full" size="lg" asChild>
        <Link to={target}>{job.viewerApplication ? 'View your application' : 'Apply now'}</Link>
      </Button>
    );
  }
  if (status === 'authenticated') {
    return (
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        Signed in as a hiring team member. Candidates apply from their own accounts.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button className="w-full" size="lg" asChild>
        <Link to={`/register?next=${encodeURIComponent(target)}`}>Apply now</Link>
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link
          to={`/login?next=${encodeURIComponent(target)}`}
          className="text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function JobDetailPage() {
  const { slug } = useParams();
  const location = useLocation();
  const inPortal = location.pathname.startsWith('/portal');
  const { data: job, isLoading, isError, error, refetch } = usePublicJob(slug);
  useDocumentTitle(job?.title);

  if (isLoading) return <PageLoader />;
  if (isError || !job)
    return (
      <div className="mx-auto max-w-4xl p-6">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  const required = job.requirements.filter((r) => r.required);
  const preferred = job.requirements.filter((r) => !r.required);

  return (
    <div className={cn(!inPortal && 'mx-auto max-w-6xl px-4 py-10 sm:px-6')}>
      <Link
        to={inPortal ? '/portal/jobs' : '/jobs'}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All jobs
      </Link>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <article className="min-w-0 space-y-8">
          <header className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">{job.title}</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building2 className="size-4" /> {job.organization.name}
              </span>
              {job.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" /> {job.location}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Briefcase className="size-4" /> {EMPLOYMENT_TYPE_LABELS[job.employmentType]}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{REMOTE_TYPE_LABELS[job.remoteType]}</Badge>
              <Badge variant="secondary">{EXPERIENCE_LEVEL_LABELS[job.experienceLevel]}</Badge>
              {salary && <Badge variant="success">{salary}</Badge>}
            </div>
          </header>

          <section aria-labelledby="about">
            <h2 id="about" className="mb-3 text-lg font-semibold">
              About the role
            </h2>
            <Markdown content={job.description} className="text-muted-foreground" />
          </section>

          {job.responsibilities.length > 0 && (
            <section aria-labelledby="responsibilities">
              <h2 id="responsibilities" className="mb-3 text-lg font-semibold">
                Responsibilities
              </h2>
              <ul className="space-y-2">
                {job.responsibilities.map((item) => (
                  <li key={item} className="flex gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="requirements" className="space-y-4">
            <h2 id="requirements" className="text-lg font-semibold">
              Requirements
            </h2>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {job.minYearsExperience !== null && (
                <span className="flex items-center gap-1.5">
                  <Timer className="size-4" /> {job.minYearsExperience}+ years of experience
                </span>
              )}
              {job.educationLevel && job.educationLevel !== 'NONE' && (
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="size-4" /> {EDUCATION_LEVEL_LABELS[job.educationLevel]}
                </span>
              )}
            </div>
            {required.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Required skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {required.map((r) => (
                    <Badge key={r.skill}>
                      {r.skill}
                      {r.minimumYears ? ` · ${r.minimumYears}+ yrs` : ''}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {preferred.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Nice to have</p>
                <div className="flex flex-wrap gap-1.5">
                  {preferred.map((r) => (
                    <Badge key={r.skill} variant="outline">
                      {r.skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </section>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {inPortal ? (
            <ApplyPanel job={job} />
          ) : (
            <Card>
              <CardContent className="space-y-3 pt-5">
                <p className="text-sm text-muted-foreground">
                  Posted {formatDate(job.publishedAt)}
                </p>
                <ApplyCallToAction job={job} />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
