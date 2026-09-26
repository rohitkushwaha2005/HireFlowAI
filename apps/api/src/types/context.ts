import type { OrgRole, Permission, UserRole } from '@hireflow/shared';

/** Authenticated principal, derived from a verified access token. */
export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
}

/** Active organization for staff requests, resolved from membership (never trusted from the client). */
export interface OrgContext {
  organizationId: string;
  role: OrgRole;
  permissions: readonly Permission[];
}

/** What services need to attribute and authorize an action. */
export interface Actor {
  userId: string;
  organizationId: string;
  orgRole: OrgRole;
  ipAddress: string | null;
}

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}
