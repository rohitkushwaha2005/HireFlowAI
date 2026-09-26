import { LogOut, Moon, Settings, Sun, User } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/use-auth';
import { post } from '@/lib/api';
import { cn, initialsOf } from '@/lib/utils';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui';

export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)} aria-label="HireFlow AI home">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path d="M9 22V10h3v4.8h8V10h3v12h-3v-4.6h-8V22z" fill="currentColor" />
          <circle cx="24.5" cy="8" r="2.5" fill="currentColor" opacity=".6" />
        </svg>
      </span>
      <span>
        HireFlow <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}

function useTheme() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  const toggle = React.useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem('hireflow-theme', next ? 'dark' : 'light');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);
  return { dark, toggle };
}

export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function UserMenu({ settingsPath, profilePath }: { settingsPath: string; profilePath?: string }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const { user } = me;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 hover:bg-muted" aria-label="Account menu">
          <Avatar src={user.avatarUrl} fallback={initialsOf(user.firstName, user.lastName)} className="size-8" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-foreground">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profilePath && (
          <DropdownMenuItem onSelect={() => navigate(profilePath)}>
            <User /> Profile
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate(settingsPath)}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            navigate('/login');
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VerifyEmailBanner() {
  const { me } = useAuth();
  const [sent, setSent] = React.useState(false);
  if (!me || me.user.emailVerified) return null;
  return (
    <div className="border-b bg-warning/15 px-4 py-2 text-center text-sm">
      Please verify your email address ({me.user.email}).{' '}
      <button
        className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
        disabled={sent}
        onClick={async () => {
          await post('/auth/resend-verification');
          setSent(true);
        }}
      >
        {sent ? 'Email sent' : 'Resend link'}
      </button>
    </div>
  );
}
