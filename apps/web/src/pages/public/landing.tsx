import { ArrowRight, Bot, FileSearch, SquareKanban, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/use-document-title';

const FEATURES = [
  { icon: FileSearch, title: 'Resume parsing', text: 'PDF resumes become structured profiles — skills, experience, education and projects — in seconds.' },
  { icon: Scale, title: 'Explainable matching', text: 'Every score breaks down into skills, experience, education and semantic fit. No black boxes.' },
  { icon: Sparkles, title: 'Semantic search', text: 'Find “React developers who built real-time apps” with vector search over your talent pool.' },
  { icon: Bot, title: 'Grounded copilot', text: 'Ask questions about your candidates. Answers come only from your data, with cited candidates.' },
  { icon: SquareKanban, title: 'Visual pipeline', text: 'Drag candidates through stages with a full audit trail and automatic candidate updates.' },
  { icon: ShieldCheck, title: 'Fair by design', text: 'Scoring ignores protected characteristics. AI suggests; people decide.' },
];

export default function LandingPage() {
  useDocumentTitle(undefined);
  return (
    <div>
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_60%)]" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground shadow-xs">
            <Sparkles className="size-4 text-primary" /> AI-powered applicant tracking
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Hire the right people faster — <span className="text-primary">with AI you can explain</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            HireFlow AI parses resumes, analyzes job descriptions and ranks candidates with transparent scores, so your team spends time on people instead of paperwork.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/register?role=recruiter">
                Start hiring <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/jobs">Browse open jobs</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Everything a modern hiring team needs</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border bg-card p-6 shadow-xs">
              <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Looking for your next role?</h2>
          <p className="max-w-xl text-muted-foreground">Create a profile once, upload your resume and apply to jobs in a click. Track every application in one place.</p>
          <Button variant="soft" size="lg" asChild>
            <Link to="/register">Create a candidate profile</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
