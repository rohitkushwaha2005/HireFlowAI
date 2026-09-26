import { APPLICATION_STATUS_LABELS, type AUDIT_ACTIONS, type AuditLogDto } from '@hireflow/shared';

const ACTION_LABELS: Record<(typeof AUDIT_ACTIONS)[number], string> = {
  JOB_CREATED: 'created job',
  JOB_UPDATED: 'updated job',
  JOB_PUBLISHED: 'published job',
  JOB_PAUSED: 'paused job',
  JOB_CLOSED: 'closed job',
  JOB_DELETED: 'deleted job',
  JOB_DUPLICATED: 'duplicated job',
  CANDIDATE_VIEWED: 'viewed candidate',
  APPLICATION_STATUS_CHANGED: 'moved application',
  CANDIDATE_SHORTLISTED: 'shortlisted candidate',
  CANDIDATE_REJECTED: 'rejected candidate',
  INTERVIEW_CREATED: 'scheduled interview',
  INTERVIEW_UPDATED: 'updated interview',
  INTERVIEW_QUESTIONS_GENERATED: 'generated interview questions',
  MATCH_RECALCULATED: 'recalculated match',
  MEMBER_INVITED: 'invited a teammate',
  MEMBER_ROLE_CHANGED: 'changed a role',
  MEMBER_REMOVED: 'removed a teammate',
  ORGANIZATION_UPDATED: 'updated settings',
  RESUME_VIEWED: 'viewed resume',
};

export function describeAudit(entry: AuditLogDto): string {
  const meta = entry.metadata ?? {};
  const detail =
    typeof meta.to === 'string' &&
    typeof meta.from === 'string' &&
    entry.entityType === 'Application'
      ? ` (${APPLICATION_STATUS_LABELS[meta.from as keyof typeof APPLICATION_STATUS_LABELS] ?? meta.from} → ${APPLICATION_STATUS_LABELS[meta.to as keyof typeof APPLICATION_STATUS_LABELS] ?? meta.to})`
      : typeof meta.title === 'string'
        ? ` “${meta.title}”`
        : '';
  return `${ACTION_LABELS[entry.action]}${detail}`;
}
