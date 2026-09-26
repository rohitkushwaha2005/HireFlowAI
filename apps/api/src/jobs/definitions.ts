import type { ApplicationStatus } from '@hireflow/shared';
import type { EmailTemplateName, EmailTemplates } from '../lib/email';

/**
 * Catalogue of background jobs: name → payload, and name → queue. Payloads carry ids only (never
 * full records) so jobs always operate on current data and stay small.
 */
export interface JobPayloads {
  'resume.process': { resumeId: string };
  'embedding.candidate': { candidateId: string };
  'embedding.job': { jobId: string };
  'matching.application': { applicationId: string };
  'matching.job': { jobId: string };
  'matching.candidate': { candidateId: string };
  'email.send': {
    to: string;
    template: EmailTemplateName;
    data: EmailTemplates[EmailTemplateName];
    /** Skip sending if the application has since moved to another status (debounces Kanban moves). */
    onlyIfStatus?: { applicationId: string; status: ApplicationStatus };
  };
  'analytics.refresh': { organizationId: string };
  'interviews.sendReminders': Record<string, never>;
}

export type JobName = keyof JobPayloads;

export const QUEUES = {
  resume: 'resume-processing',
  embeddings: 'embeddings',
  matching: 'matching',
  email: 'email',
  analytics: 'analytics',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOB_QUEUE: Record<JobName, QueueName> = {
  'resume.process': QUEUES.resume,
  'embedding.candidate': QUEUES.embeddings,
  'embedding.job': QUEUES.embeddings,
  'matching.application': QUEUES.matching,
  'matching.job': QUEUES.matching,
  'matching.candidate': QUEUES.matching,
  'email.send': QUEUES.email,
  'analytics.refresh': QUEUES.analytics,
  'interviews.sendReminders': QUEUES.email,
};

export interface DispatchOptions {
  /** Deduplication key: a job with the same id that is still waiting is not enqueued twice. */
  jobId?: string;
  delayMs?: number;
}

export type JobHandlers = { [K in JobName]: (payload: JobPayloads[K]) => Promise<void> };

/** Producer-side abstraction. Services depend on this, never on BullMQ directly. */
export interface JobDispatcher {
  dispatch<K extends JobName>(
    name: K,
    payload: JobPayloads[K],
    options?: DispatchOptions,
  ): Promise<void>;
  close(): Promise<void>;
}

/** Typed helper for email jobs so template payloads are checked at the call site. */
export function emailJob<T extends EmailTemplateName>(
  to: string,
  template: T,
  data: EmailTemplates[T],
): JobPayloads['email.send'] {
  return { to, template, data };
}
