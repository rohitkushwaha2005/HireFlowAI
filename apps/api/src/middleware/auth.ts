import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  hasPermission,
  isStaffRole,
  permissionsFor,
  type Permission,
  type UserRole,
} from '@hireflow/shared';
import type { PrismaClient } from '@hireflow/database';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import type { TokenService } from '../services/token.service';
import type { Actor, AuthContext, OrgContext, RequestMeta } from '../types/context';

export const ORG_HEADER = 'x-organization-id';

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/** Verifies the access token when present; never rejects. Used by public routes that personalize. */
export function optionalAuth(tokens: TokenService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (token) {
      const payload = await tokens.verifyAccessToken(token).catch(() => null);
      if (payload) req.auth = payload;
    }
    next();
  };
}

export function requireAuth(tokens: TokenService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) throw new UnauthorizedError();
    const payload = await tokens.verifyAccessToken(token).catch(() => null);
    if (!payload) throw new UnauthorizedError('Your session has expired. Please sign in again.');
    req.auth = payload;
    next();
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!roles.includes(req.auth.role)) throw new ForbiddenError();
    next();
  };
}

/**
 * Resolves the active organization from the `X-Organization-Id` header (or the user's first
 * membership) and verifies membership in the database on every request. The client can choose
 * among its own organizations but can never gain access to another one.
 */
export function requireOrganization(prisma: PrismaClient): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!isStaffRole(req.auth.role)) throw new ForbiddenError('This area is only available to hiring teams');

    const requested = req.header(ORG_HEADER)?.trim();
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: req.auth.userId, ...(requested ? { organizationId: requested } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { organizationId: true, role: true },
    });
    if (!membership) {
      throw new ForbiddenError(
        requested ? 'You are not a member of this organization' : 'Create or join an organization first',
      );
    }
    const org: OrgContext = {
      organizationId: membership.organizationId,
      role: membership.role,
      permissions: permissionsFor(membership.role),
    };
    req.org = org;
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.org) throw new ForbiddenError();
    if (!hasPermission(req.org.role, permission)) {
      throw new ForbiddenError(`Your role does not allow this action (${permission})`);
    }
    next();
  };
}

export function requestMeta(req: Request): RequestMeta {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.header('user-agent')?.slice(0, 300) ?? null,
  };
}

export function authOf(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}

/** Actor for org-scoped service calls. Only valid after `requireOrganization`. */
export function actorOf(req: Request): Actor {
  if (!req.auth || !req.org) throw new ForbiddenError();
  return {
    userId: req.auth.userId,
    organizationId: req.org.organizationId,
    orgRole: req.org.role,
    ipAddress: req.ip ?? null,
  };
}
