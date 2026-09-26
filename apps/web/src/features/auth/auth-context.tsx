import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import {
  hasPermission,
  isStaffRole,
  type LoginInput,
  type MeDto,
  type MembershipDto,
  type Permission,
  type RegisterInput,
  type SessionDto,
} from '@hireflow/shared';
import { post, refreshSession, session } from '@/lib/api';
import { AuthContext } from './use-auth';

type Status = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: Status;
  me: MeDto | null;
  membership: MembershipDto | null;
  isStaff: boolean;
  isCandidate: boolean;
  can: (permission: Permission) => boolean;
  login: (input: LoginInput) => Promise<SessionDto>;
  register: (input: RegisterInput) => Promise<SessionDto>;
  logout: () => Promise<void>;
  applySession: (session: SessionDto) => void;
  reload: () => Promise<void>;
  switchOrganization: (organizationId: string) => void;
}

const ORG_KEY = 'hireflow-org';

function pickMembership(me: MeDto): MembershipDto | null {
  let preferred: string | null = null;
  try {
    preferred = localStorage.getItem(ORG_KEY);
  } catch {
    // storage unavailable (private mode) — fall back to the first membership
  }
  return me.memberships.find((m) => m.organizationId === preferred) ?? me.memberships[0] ?? null;
}

/**
 * Non-sensitive marker that this browser has (had) a session. The real credential is the
 * httpOnly refresh cookie; the hint only decides whether trying to restore it is worthwhile.
 */
const SESSION_HINT_KEY = 'hireflow-has-session';

function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

function setSessionHint(value: boolean): void {
  try {
    if (value) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // storage unavailable — the refresh attempt simply always runs
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<Status>('loading');
  const [me, setMe] = React.useState<MeDto | null>(null);
  const [membership, setMembership] = React.useState<MembershipDto | null>(null);

  const applySession = React.useCallback((next: SessionDto) => {
    const { accessToken, expiresIn: _expiresIn, ...profile } = next;
    const active = pickMembership(profile);
    session.set(accessToken, active?.organizationId ?? null);
    setSessionHint(true);
    setMe(profile);
    setMembership(active);
    setStatus('authenticated');
  }, []);

  const clear = React.useCallback(() => {
    session.clear();
    setSessionHint(false);
    setMe(null);
    setMembership(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from the httpOnly refresh cookie on first load. The hint avoids a
  // guaranteed-401 refresh call for visitors who never signed in on this browser.
  React.useEffect(() => {
    let cancelled = false;
    if (!hasSessionHint()) {
      setStatus('anonymous');
      return;
    }
    void refreshSession().then((restored) => {
      if (cancelled) return;
      if (restored) applySession(restored);
      else setStatus('anonymous');
    });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  React.useEffect(() => {
    return session.onExpired(clear);
  }, [clear]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      membership,
      isStaff: !!me && isStaffRole(me.user.role),
      isCandidate: me?.user.role === 'CANDIDATE',
      can: (permission) => hasPermission(membership?.role, permission),
      login: async (input) => {
        const next = await post<SessionDto>('/auth/login', input);
        queryClient.clear();
        applySession(next);
        return next;
      },
      register: async (input) => {
        const next = await post<SessionDto>('/auth/register', input);
        queryClient.clear();
        applySession(next);
        return next;
      },
      logout: async () => {
        try {
          await post('/auth/logout');
        } finally {
          clear();
        }
      },
      applySession,
      reload: async () => {
        const next = await refreshSession();
        if (next) applySession(next);
      },
      switchOrganization: (organizationId) => {
        const target = me?.memberships.find((m) => m.organizationId === organizationId);
        if (!target) return;
        try {
          localStorage.setItem(ORG_KEY, organizationId);
        } catch {
          // ignore
        }
        session.setOrganization(organizationId);
        setMembership(target);
        queryClient.clear();
      },
    }),
    [status, me, membership, applySession, clear, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
