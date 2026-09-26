import type { RequestHandler } from 'express';
import type { Permission } from '@hireflow/shared';
import type { DocumentedHandler } from '../lib/http';

/**
 * Who may call a route:
 * - public:    anyone
 * - optional:  anyone; the user is identified when a valid token is present
 * - user:      any signed-in user
 * - candidate: signed-in users with the CANDIDATE role
 * - staff:     members of an organization, with `permission` checked against their org role
 */
export type RouteAccess = 'public' | 'optional' | 'user' | 'candidate' | 'staff';

export interface RouteDef {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Express path relative to /api, e.g. "/jobs/:id". */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  access: RouteAccess;
  permission?: Permission;
  /** Extra middleware (rate limiters, upload parsing) run after auth. */
  middleware?: RequestHandler[];
  handler: DocumentedHandler;
  /** Documented success status (default 200). */
  status?: number;
  /** Response content type when not the JSON envelope (e.g. PDF download, redirects). */
  produces?: string;
  multipart?: boolean;
}
