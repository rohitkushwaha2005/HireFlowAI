import * as React from 'react';
import type { MeDto } from '@hireflow/shared';
import type { AuthContextValue } from './auth-context';

export const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Accepts only same-origin relative paths as redirect targets (prevents open redirects). */
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

/** Where a signed-in user lands by default. */
export function homePathFor(me: MeDto | null): string {
  if (!me) return '/login';
  return me.user.role === 'CANDIDATE' ? '/portal' : '/app';
}
