import { CheckCircle2, Sparkles } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { Logo, ThemeToggle } from '@/components/app-chrome';
import { Button } from '@/components/ui';
import { homePathFor, useAuth } from '@/features/auth/use-auth';

export function PublicLayout() {
  const { status, me } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Public" className="hidden items-center gap-1 sm:flex">
            <Button variant="ghost" asChild>
              <Link to="/jobs">Browse jobs</Link>
            </Button>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {status === 'authenticated' ? (
              <Button asChild>
                <Link to={homePathFor(me)}>Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild className="hidden sm:inline-flex">
                  <Link to="/register">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} HireFlow AI. Portfolio project.</p>
          <p>AI recommendations are decision support and always require human review.</p>
        </div>
      </footer>
    </div>
  );
}

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </main>
      </div>
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-center">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="relative max-w-md space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm">
            <Sparkles className="size-4" /> AI-assisted hiring, human decisions
          </p>
          <h2 className="text-3xl font-semibold leading-tight">Find the right people faster — and know exactly why they match.</h2>
          <ul className="space-y-3 text-primary-foreground/90">
            {[
              'Resumes parsed into structured profiles automatically',
              'Explainable match scores built from skills, experience and relevance',
              'Semantic search and a copilot grounded in your real candidate data',
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
