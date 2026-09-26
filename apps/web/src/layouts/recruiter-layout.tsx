import {
  ChartColumn,
  Bot,
  Briefcase,
  CalendarClock,
  SquareKanban,
  LayoutDashboard,
  Menu,
  Settings,
  Sparkles,
  Users,
  UsersRound,
} from 'lucide-react';
import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import type { Permission } from '@hireflow/shared';
import { Logo, ThemeToggle, UserMenu, VerifyEmailBanner } from '@/components/app-chrome';
import { Badge, Button, Dialog, DialogTitle, SheetContent, Tooltip } from '@/components/ui';
import { useAuthConfig } from '@/features/api/jobs';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, permission: 'analytics:read', end: true },
  { to: '/app/jobs', label: 'Jobs', icon: Briefcase, permission: 'jobs:read' },
  { to: '/app/candidates', label: 'Candidates', icon: UsersRound, permission: 'candidates:read' },
  { to: '/app/applications', label: 'Applications', icon: SquareKanban, permission: 'applications:read' },
  { to: '/app/interviews', label: 'Interviews', icon: CalendarClock, permission: 'interviews:read' },
  { to: '/app/analytics', label: 'Analytics', icon: ChartColumn, permission: 'analytics:read' },
  { to: '/app/copilot', label: 'AI Copilot', icon: Bot, permission: 'copilot:use' },
  { to: '/app/team', label: 'Team', icon: Users, permission: 'team:read' },
  { to: '/app/settings', label: 'Settings', icon: Settings, permission: 'org:read' },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can, membership } = useAuth();
  const { data: config } = useAuthConfig();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo to="/app" />
      </div>
      <div className="px-3 pb-3">
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">Organization</p>
          <p className="truncate text-sm font-medium">{membership?.organizationName}</p>
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.filter((item) => can(item.permission)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      {config?.aiIsHeuristic && (
        <div className="m-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <Sparkles className="size-3.5" /> Heuristic AI mode
          </p>
          <p className="mt-1 text-muted-foreground">No LLM key configured. Parsing, analysis and copilot use offline rules. Embeddings and matching are fully active.</p>
        </div>
      )}
    </div>
  );
}

export function RecruiterLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { membership } = useAuth();
  const { data: config } = useAuthConfig();
  const location = useLocation();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-sidebar lg:block">
        <SidebarNav />
      </aside>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <VerifyEmailBanner />
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <p className="truncate text-sm text-muted-foreground lg:hidden">{membership?.organizationName}</p>
          <div className="ml-auto flex items-center gap-2">
            {config && (
              <Tooltip content={config.aiIsHeuristic ? 'Offline heuristic AI (no LLM key configured)' : `AI provider: ${config.aiProvider}`}>
                <Badge variant={config.aiIsHeuristic ? 'warning' : 'default'} className="hidden cursor-default sm:inline-flex">
                  <Sparkles /> {config.aiIsHeuristic ? 'Heuristic AI' : 'Claude AI'}
                </Badge>
              </Tooltip>
            )}
            <ThemeToggle />
            <UserMenu settingsPath="/app/settings" />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
