import { Briefcase, CalendarClock, FileText, Home, ListChecks, Menu, Settings, UserRound } from 'lucide-react';
import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Logo, ThemeToggle, UserMenu, VerifyEmailBanner } from '@/components/app-chrome';
import { Button, Dialog, DialogTitle, SheetContent } from '@/components/ui';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/portal', label: 'Dashboard', icon: Home, end: true },
  { to: '/portal/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/portal/applications', label: 'Applications', icon: ListChecks },
  { to: '/portal/profile', label: 'Profile', icon: UserRound },
  { to: '/portal/resume', label: 'Resume', icon: FileText },
  { to: '/portal/interviews', label: 'Interviews', icon: CalendarClock },
  { to: '/portal/settings', label: 'Settings', icon: Settings },
];

function NavItems({ vertical, onNavigate }: { vertical?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Candidate" className={cn(vertical ? 'flex flex-col gap-1 p-3' : 'hidden items-center gap-1 md:flex')}>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <item.icon className="size-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function CandidateLayout() {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();
  React.useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <VerifyEmailBanner />
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Logo to="/portal" />
          <div className="mx-auto hidden md:block">
            <NavItems />
          </div>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <ThemeToggle />
            <UserMenu settingsPath="/portal/settings" profilePath="/portal/profile" />
          </div>
        </div>
      </header>
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <div className="flex h-16 items-center px-5">
            <Logo to="/portal" />
          </div>
          <NavItems vertical onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Dialog>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
