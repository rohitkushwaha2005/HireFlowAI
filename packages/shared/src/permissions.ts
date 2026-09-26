import type { OrgRole, UserRole } from './enums';

/**
 * Organization-scoped permissions. The API enforces these with `requirePermission()`; the web app
 * uses the same map to decide which actions to render. The server is always the source of truth.
 */
export const PERMISSIONS = [
  'org:read',
  'org:update',
  'team:read',
  'team:manage',
  'jobs:read',
  'jobs:write',
  'jobs:publish',
  'jobs:delete',
  'candidates:read',
  'applications:read',
  'applications:move',
  'matching:run',
  'interviews:read',
  'interviews:write',
  'copilot:use',
  'analytics:read',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const RECRUITER_PERMISSIONS: readonly Permission[] = [
  'org:read',
  'team:read',
  'jobs:read',
  'jobs:write',
  'jobs:publish',
  'jobs:delete',
  'candidates:read',
  'applications:read',
  'applications:move',
  'matching:run',
  'interviews:read',
  'interviews:write',
  'copilot:use',
  'analytics:read',
  'audit:read',
];

const HIRING_MANAGER_PERMISSIONS: readonly Permission[] = [
  'org:read',
  'team:read',
  'jobs:read',
  'candidates:read',
  'applications:read',
  'interviews:read',
  'interviews:write',
  'copilot:use',
  'analytics:read',
];

export const ORG_ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  RECRUITER: RECRUITER_PERMISSIONS,
  HIRING_MANAGER: HIRING_MANAGER_PERMISSIONS,
};

export function hasPermission(role: OrgRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ORG_ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: OrgRole | null | undefined): Permission[] {
  return role ? [...ORG_ROLE_PERMISSIONS[role]] : [];
}

/** Global roles that may use the recruiter application (subject to org membership). */
export const STAFF_ROLES: readonly UserRole[] = ['ADMIN', 'RECRUITER', 'HIRING_MANAGER'];

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

/** Org roles that may be assigned by someone holding `team:manage`. OWNER is transferred, not assigned. */
export const ASSIGNABLE_ORG_ROLES = [
  'ADMIN',
  'RECRUITER',
  'HIRING_MANAGER',
] as const satisfies readonly OrgRole[];
