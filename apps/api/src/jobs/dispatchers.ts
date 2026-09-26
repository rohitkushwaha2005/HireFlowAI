import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from '../lib/logger';
import {
  JOB_QUEUE,
  type DispatchOptions,
  type JobDispatcher,
  type JobHandlers,
  type JobName,
  type JobPayloads,
  type QueueName,
} from './definitions';

export const DEFAULT_JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** Production dispatcher: enqueues onto Redis-backed BullMQ queues consumed by the worker process. */
export class BullMqDispatcher implements JobDispatcher {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    private readonly connection: Redis,
    private readonly logger: Logger,
  ) {}

  private queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async dispatch<K extends JobName>(
    name: K,
    payload: JobPayloads[K],
    options: DispatchOptions = {},
  ): Promise<void> {
    await this.queue(JOB_QUEUE[name]).add(name, payload, {
      ...(options.jobId ? { jobId: options.jobId.replace(/:/g, '-') } : {}),
      ...(options.delayMs ? { delay: options.delayMs } : {}),
    });
    this.logger.debug({ job: name, jobId: options.jobId }, 'Job enqueued');
  }

  queuesFor(): Queue[] {
    return [...this.queues.values()];
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}

/**
 * Runs jobs in-process. Used by tests (deterministic flows without Redis) and optionally by
 * single-process development. Failures are logged, mirroring how a background job failure would
 * not fail the originating request.
 */
export class InlineDispatcher implements JobDispatcher {
  private handlers: JobHandlers | null = null;
  readonly history: Array<{ name: JobName; payload: unknown }> = [];

  constructor(private readonly logger: Logger) {}

  setHandlers(handlers: JobHandlers): void {
    this.handlers = handlers;
  }

  async dispatch<K extends JobName>(name: K, payload: JobPayloads[K]): Promise<void> {
    this.history.push({ name, payload });
    if (!this.handlers) throw new Error('InlineDispatcher used before handlers were registered');
    const handler = this.handlers[name] as (p: JobPayloads[K]) => Promise<void>;
    // Mirror BullMQ's retry semantics (without the backoff delay).
    for (let attempt = 1; attempt <= DEFAULT_JOB_OPTIONS.attempts; attempt++) {
      try {
        await handler(payload);
        return;
      } catch (error) {
        if (attempt === DEFAULT_JOB_OPTIONS.attempts) {
          this.logger.error({ err: error, job: name, attempt }, 'Inline job failed');
        }
      }
    }
  }

  async close(): Promise<void> {}
}
