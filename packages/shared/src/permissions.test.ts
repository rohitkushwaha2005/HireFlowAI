import { describe, expect, it } from 'vitest';
import { hasPermission, isStaffRole, PERMISSIONS, permissionsFor } from './permissions';

describe('permissions', () => {
  it('grants owners and admins every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission('OWNER', permission)).toBe(true);
      expect(hasPermission('ADMIN', permission)).toBe(true);
    }
  });

  it('prevents recruiters from managing the team or organization', () => {
    expect(hasPermission('RECRUITER', 'jobs:write')).toBe(true);
    expect(hasPermission('RECRUITER', 'applications:move')).toBe(true);
    expect(hasPermission('RECRUITER', 'team:manage')).toBe(false);
    expect(hasPermission('RECRUITER', 'org:update')).toBe(false);
  });

  it('keeps hiring managers read-mostly', () => {
    expect(hasPermission('HIRING_MANAGER', 'candidates:read')).toBe(true);
    expect(hasPermission('HIRING_MANAGER', 'interviews:write')).toBe(true);
    expect(hasPermission('HIRING_MANAGER', 'jobs:write')).toBe(false);
    expect(hasPermission('HIRING_MANAGER', 'applications:move')).toBe(false);
  });

  it('denies everything without a role', () => {
    expect(hasPermission(null, 'jobs:read')).toBe(false);
    expect(permissionsFor(undefined)).toEqual([]);
  });

  it('classifies staff roles', () => {
    expect(isStaffRole('RECRUITER')).toBe(true);
    expect(isStaffRole('CANDIDATE')).toBe(false);
  });
});
