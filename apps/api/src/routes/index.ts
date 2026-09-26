import { Router, type RequestHandler } from 'express';
import type { Container } from '../container';
import { createApplicationController } from '../controllers/application.controller';
import { createAuthController } from '../controllers/auth.controller';
import { createCandidateController } from '../controllers/candidate.controller';
import { createJobController } from '../controllers/job.controller';
import {
  createAnalyticsController,
  createCopilotController,
  createHealthController,
  createInterviewController,
} from '../controllers/misc.controller';
import { createOrganizationController } from '../controllers/organization.controller';
import { createResumeController } from '../controllers/resume.controller';
import {
  optionalAuth,
  requireAuth,
  requireOrganization,
  requirePermission,
  requireRole,
} from '../middleware/auth';
import type { RateLimiters } from '../middleware/rate-limit';
import { resumeUpload } from '../middleware/upload';
import type { RouteDef } from './route-table';

/**
 * The complete API surface. Order matters where paths overlap (static segments such as
 * `/applications/mine` are declared before `/applications/:id`).
 */
export function buildRouteTable(container: Container, limiters: RateLimiters): RouteDef[] {
  const auth = createAuthController(container);
  const orgs = createOrganizationController(container);
  const jobs = createJobController(container);
  const candidates = createCandidateController(container);
  const resumes = createResumeController(container);
  const applications = createApplicationController(container);
  const interviews = createInterviewController(container);
  const copilot = createCopilotController(container);
  const analytics = createAnalyticsController(container);
  const health = createHealthController(container);
  const upload = resumeUpload(container.config.uploads.maxBytes);

  return [
    // ── Health ──
    { method: 'get', path: '/health', tag: 'System', summary: 'Liveness probe', access: 'public', handler: health.live },
    { method: 'get', path: '/health/ready', tag: 'System', summary: 'Readiness probe (database, Redis)', access: 'public', handler: health.ready },

    // ── Auth ──
    { method: 'get', path: '/auth/config', tag: 'Auth', summary: 'Public auth/AI configuration flags', access: 'public', handler: auth.config },
    { method: 'post', path: '/auth/register', tag: 'Auth', summary: 'Create a recruiter or candidate account', access: 'public', middleware: [limiters.auth], handler: auth.register, status: 201, description: 'Recruiters also create their organization. Sets the refresh-token cookie and returns an access token.' },
    { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Sign in with email and password', access: 'public', middleware: [limiters.auth], handler: auth.login },
    { method: 'post', path: '/auth/refresh', tag: 'Auth', summary: 'Rotate the refresh cookie and issue a new access token', access: 'public', handler: auth.refresh },
    { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Revoke the current session', access: 'public', handler: auth.logout },
    { method: 'post', path: '/auth/verify-email', tag: 'Auth', summary: 'Verify email with a one-time token', access: 'public', middleware: [limiters.auth], handler: auth.verifyEmail },
    { method: 'post', path: '/auth/resend-verification', tag: 'Auth', summary: 'Resend the verification email', access: 'user', middleware: [limiters.auth], handler: auth.resendVerification },
    { method: 'post', path: '/auth/forgot-password', tag: 'Auth', summary: 'Request a password reset email', access: 'public', middleware: [limiters.auth], handler: auth.forgotPassword },
    { method: 'post', path: '/auth/reset-password', tag: 'Auth', summary: 'Set a new password with a reset/invitation token', access: 'public', middleware: [limiters.auth], handler: auth.resetPassword },
    { method: 'post', path: '/auth/change-password', tag: 'Auth', summary: 'Change password (signs out other sessions)', access: 'user', middleware: [limiters.auth], handler: auth.changePassword },
    { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Current user, memberships and candidate profile id', access: 'user', handler: auth.me },
    { method: 'patch', path: '/auth/me', tag: 'Auth', summary: 'Update name/avatar', access: 'user', handler: auth.updateMe },
    { method: 'get', path: '/auth/google', tag: 'Auth', summary: 'Start Google OAuth (redirect)', access: 'public', handler: auth.googleStart, produces: 'redirect' },
    { method: 'get', path: '/auth/google/callback', tag: 'Auth', summary: 'Google OAuth callback (redirect)', access: 'public', handler: auth.googleCallback, produces: 'redirect' },

    // ── Organizations ──
    { method: 'post', path: '/organizations', tag: 'Organizations', summary: 'Create an organization (staff without one)', access: 'user', handler: orgs.create, status: 201 },
    { method: 'get', path: '/organizations/current', tag: 'Organizations', summary: 'Active organization', access: 'staff', permission: 'org:read', handler: orgs.current },
    { method: 'patch', path: '/organizations/current', tag: 'Organizations', summary: 'Update organization, incl. matching weights', access: 'staff', permission: 'org:update', handler: orgs.update },
    { method: 'get', path: '/organizations/current/members', tag: 'Organizations', summary: 'List team members', access: 'staff', permission: 'team:read', handler: orgs.members },
    { method: 'post', path: '/organizations/current/members', tag: 'Organizations', summary: 'Invite a team member', access: 'staff', permission: 'team:manage', handler: orgs.invite, status: 201 },
    { method: 'patch', path: '/organizations/current/members/:id', tag: 'Organizations', summary: "Change a member's role", access: 'staff', permission: 'team:manage', handler: orgs.updateMember },
    { method: 'delete', path: '/organizations/current/members/:id', tag: 'Organizations', summary: 'Remove a member', access: 'staff', permission: 'team:manage', handler: orgs.removeMember },
    { method: 'get', path: '/organizations/current/audit-logs', tag: 'Organizations', summary: 'Audit trail', access: 'staff', permission: 'audit:read', handler: orgs.auditLogs },

    // ── Public job board ──
    { method: 'get', path: '/public/jobs', tag: 'Public jobs', summary: 'Search published jobs', access: 'public', handler: jobs.listPublic },
    { method: 'get', path: '/public/jobs/:slug', tag: 'Public jobs', summary: 'Published job detail', access: 'optional', handler: jobs.getPublic },

    // ── Jobs (recruiter) ──
    { method: 'get', path: '/jobs', tag: 'Jobs', summary: 'List jobs', access: 'staff', permission: 'jobs:read', handler: jobs.list },
    { method: 'post', path: '/jobs', tag: 'Jobs', summary: 'Create a job (draft)', access: 'staff', permission: 'jobs:write', handler: jobs.create, status: 201 },
    { method: 'post', path: '/jobs/analyze', tag: 'Jobs', summary: 'AI-analyze a job description into editable requirements', access: 'staff', permission: 'jobs:write', middleware: [limiters.ai], handler: jobs.analyze },
    { method: 'get', path: '/jobs/:id', tag: 'Jobs', summary: 'Job detail with requirements and pipeline counts', access: 'staff', permission: 'jobs:read', handler: jobs.get },
    { method: 'patch', path: '/jobs/:id', tag: 'Jobs', summary: 'Update a job (requirements are replaced when provided)', access: 'staff', permission: 'jobs:write', handler: jobs.update },
    { method: 'delete', path: '/jobs/:id', tag: 'Jobs', summary: 'Delete a job without applications', access: 'staff', permission: 'jobs:delete', handler: jobs.remove },
    { method: 'post', path: '/jobs/:id/duplicate', tag: 'Jobs', summary: 'Duplicate a job as a draft', access: 'staff', permission: 'jobs:write', handler: jobs.duplicate, status: 201 },
    { method: 'get', path: '/jobs/:id/applications', tag: 'Jobs', summary: 'Applications for a job', access: 'staff', permission: 'applications:read', handler: jobs.applications },
    { method: 'post', path: '/jobs/:id/applications', tag: 'Applications', summary: 'Apply to a job (candidate)', access: 'candidate', handler: jobs.apply, status: 201 },
    { method: 'post', path: '/jobs/:id/:action', tag: 'Jobs', summary: 'Lifecycle transition: publish | pause | close | reopen', access: 'staff', permission: 'jobs:publish', handler: jobs.transition },

    // ── Candidates ──
    { method: 'get', path: '/candidates/me', tag: 'Candidate portal', summary: 'Own candidate profile', access: 'candidate', handler: candidates.me },
    { method: 'patch', path: '/candidates/me', tag: 'Candidate portal', summary: 'Update own profile', access: 'candidate', handler: candidates.updateMe },
    { method: 'put', path: '/candidates/me/skills', tag: 'Candidate portal', summary: 'Replace skills', access: 'candidate', handler: candidates.replaceSkills },
    { method: 'put', path: '/candidates/me/experience', tag: 'Candidate portal', summary: 'Replace work experience', access: 'candidate', handler: candidates.replaceExperience },
    { method: 'put', path: '/candidates/me/education', tag: 'Candidate portal', summary: 'Replace education', access: 'candidate', handler: candidates.replaceEducation },
    { method: 'get', path: '/candidates/me/dashboard', tag: 'Candidate portal', summary: 'Candidate dashboard', access: 'candidate', handler: candidates.dashboard },
    { method: 'get', path: '/candidates', tag: 'Candidates', summary: 'Search candidates (hybrid semantic search when `q` is set)', access: 'staff', permission: 'candidates:read', middleware: [limiters.ai], handler: candidates.search },
    { method: 'get', path: '/candidates/:id', tag: 'Candidates', summary: 'Candidate profile with applications and interviews', access: 'staff', permission: 'candidates:read', handler: candidates.get },

    // ── Resumes ──
    { method: 'post', path: '/resumes/upload', tag: 'Resumes', summary: 'Upload a PDF resume (multipart field "file"); parsing is queued', access: 'candidate', middleware: [limiters.upload, upload], handler: resumes.upload, status: 202, multipart: true },
    { method: 'get', path: '/resumes', tag: 'Resumes', summary: 'Own resumes', access: 'candidate', handler: resumes.list },
    { method: 'get', path: '/resumes/:id', tag: 'Resumes', summary: 'Resume metadata and parsing status', access: 'user', handler: resumes.get },
    { method: 'get', path: '/resumes/:id/download', tag: 'Resumes', summary: 'Stream the PDF (owner or recruiters of an org the candidate applied to)', access: 'user', handler: resumes.download, produces: 'application/pdf' },
    { method: 'post', path: '/resumes/:id/retry', tag: 'Resumes', summary: 'Retry failed parsing', access: 'candidate', handler: resumes.retry, status: 202 },
    { method: 'post', path: '/resumes/:id/primary', tag: 'Resumes', summary: 'Make this the primary resume', access: 'candidate', handler: resumes.setPrimary },
    { method: 'delete', path: '/resumes/:id', tag: 'Resumes', summary: 'Delete a resume not used by an active application', access: 'candidate', handler: resumes.remove },

    // ── Applications ──
    { method: 'get', path: '/applications/mine', tag: 'Candidate portal', summary: 'Own applications', access: 'candidate', handler: applications.mine },
    { method: 'get', path: '/applications/mine/:id', tag: 'Candidate portal', summary: 'Own application detail', access: 'candidate', handler: applications.mineDetail },
    { method: 'post', path: '/applications/mine/:id/withdraw', tag: 'Candidate portal', summary: 'Withdraw an application', access: 'candidate', handler: applications.withdraw },
    { method: 'get', path: '/applications', tag: 'Applications', summary: 'List applications', access: 'staff', permission: 'applications:read', handler: applications.list },
    { method: 'get', path: '/applications/pipeline', tag: 'Applications', summary: 'Kanban pipeline columns', access: 'staff', permission: 'applications:read', handler: applications.pipeline },
    { method: 'get', path: '/applications/:id', tag: 'Applications', summary: 'Application detail with match, notes, history, interviews, questions', access: 'staff', permission: 'applications:read', handler: applications.get },
    { method: 'patch', path: '/applications/:id/status', tag: 'Applications', summary: 'Move to another pipeline stage (audited)', access: 'staff', permission: 'applications:move', handler: applications.updateStatus },
    { method: 'post', path: '/applications/:id/notes', tag: 'Applications', summary: 'Add a private recruiter note', access: 'staff', permission: 'applications:read', handler: applications.addNote, status: 201 },
    { method: 'get', path: '/applications/:id/match', tag: 'Matching', summary: 'Match score breakdown', access: 'staff', permission: 'applications:read', handler: applications.getMatch },
    { method: 'post', path: '/applications/:id/match', tag: 'Matching', summary: 'Recalculate the match score', access: 'staff', permission: 'matching:run', handler: applications.runMatch },
    { method: 'get', path: '/applications/:id/interview-questions', tag: 'Interviews', summary: 'Generated interview questions', access: 'staff', permission: 'interviews:read', handler: applications.questions },
    { method: 'post', path: '/applications/:id/interview-questions', tag: 'Interviews', summary: 'Generate candidate-specific interview questions', access: 'staff', permission: 'interviews:write', middleware: [limiters.ai], handler: applications.generateQuestions, status: 201 },

    // ── Interviews ──
    { method: 'get', path: '/interviews/mine', tag: 'Candidate portal', summary: 'Own interviews', access: 'candidate', handler: interviews.mine },
    { method: 'get', path: '/interviews', tag: 'Interviews', summary: 'List interviews', access: 'staff', permission: 'interviews:read', handler: interviews.list },
    { method: 'post', path: '/interviews', tag: 'Interviews', summary: 'Schedule an interview', access: 'staff', permission: 'interviews:write', handler: interviews.create, status: 201 },
    { method: 'patch', path: '/interviews/:id', tag: 'Interviews', summary: 'Update/reschedule/record feedback', access: 'staff', permission: 'interviews:write', handler: interviews.update },

    // ── Copilot ──
    { method: 'post', path: '/copilot/chat', tag: 'Copilot', summary: 'Ask the grounded hiring copilot', access: 'staff', permission: 'copilot:use', middleware: [limiters.ai], handler: copilot.chat },
    { method: 'get', path: '/copilot/conversations', tag: 'Copilot', summary: 'Conversation history', access: 'staff', permission: 'copilot:use', handler: copilot.conversations },
    { method: 'get', path: '/copilot/conversations/:id/messages', tag: 'Copilot', summary: 'Messages in a conversation', access: 'staff', permission: 'copilot:use', handler: copilot.messages },
    { method: 'delete', path: '/copilot/conversations/:id', tag: 'Copilot', summary: 'Delete a conversation', access: 'staff', permission: 'copilot:use', handler: copilot.remove },

    // ── Analytics ──
    { method: 'get', path: '/analytics/dashboard', tag: 'Analytics', summary: 'Dashboard metrics (SQL aggregates, cached 60s)', access: 'staff', permission: 'analytics:read', handler: analytics.dashboard },
  ];
}

export function buildApiRouter(container: Container, routes: RouteDef[]): Router {
  const router = Router();
  const { tokens } = container.services;
  const access: Record<RouteDef['access'], (def: RouteDef) => RequestHandler[]> = {
    public: () => [],
    optional: () => [optionalAuth(tokens)],
    user: () => [requireAuth(tokens)],
    candidate: () => [requireAuth(tokens), requireRole('CANDIDATE')],
    staff: (def) => [
      requireAuth(tokens),
      requireOrganization(container.prisma),
      ...(def.permission ? [requirePermission(def.permission)] : []),
    ],
  };
  for (const def of routes) {
    router[def.method](def.path, ...access[def.access](def), ...(def.middleware ?? []), def.handler);
  }
  return router;
}
