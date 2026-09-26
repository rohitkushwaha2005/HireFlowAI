import { ShieldAlert } from 'lucide-react';
import * as React from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import type { Permission } from '@hireflow/shared';
import { EmptyState, PageLoader } from '@/components/common';
import { homePathFor, safeNextPath, useAuth } from './use-auth';

/**
 * Route guards mirror the API's authorization so users are not shown screens they cannot use.
 * They are a UX convenience only — every request is authorized again on the server.
 */

export function RequireAuth({ role }: { role: 'staff' | 'candidate' }) {
  const { status, me, isStaff, isCandidate, membership } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoader />;
  if (status === 'anonymous') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (role === 'staff' && !isStaff) return <Navigate to={homePathFor(me)} replace />;
  if (role === 'candidate' && !isCandidate) return <Navigate to={homePathFor(me)} replace />;
  if (role === 'staff' && !membership) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/**
 * Auth pages (login/register) are for signed-out users. Once a session exists — including the
 * moment sign-in succeeds — the user is sent to a safe same-origin `next` path or their home.
 */
export function GuestOnly() {
  const { status, me } = useAuth();
  const [params] = useSearchParams();
  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated') return <Navigate to={safeNextPath(params.get('next')) ?? homePathFor(me)} replace />;
  return <Outlet />;
}

/** Hides a screen (or shows a friendly notice) when the org role lacks a permission. */
export function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You don’t have access to this page"
        description="Ask an organization admin to change your role if you need access."
      />
    );
  }
  return <>{children}</>;
}

export function Can({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : null;
}
