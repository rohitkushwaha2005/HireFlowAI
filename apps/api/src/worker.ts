import { Queue, Worker, type Job } from 'bullmq';
import { loadConfig } from './config/env';
import { buildContainer } from './container';
import {
  JOB_QUEUE,
  QUEUES,
  type JobName,
  type JobPayloads,
  type QueueName,
} from './jobs/definitions';
import { createLogger } from './lib/logger';
import { configureHttp } from './lib/network';
import { createRedis } from './lib/redis';
import { LocalEmbeddingProvider } from './ai/embeddings';

/** Per-queue concurrency: AI-bound queues are limited to protect provider rate limits. */
const CONCURRENCY: Record<QueueName, number> = {
  [QUEUES.resume]: 2,
  [QUEUES.embeddings]: 2,
  [QUEUES.matching]: 4,
  [QUEUES.email]: 5,
  [QUEUES.analytics]: 1,
};

async function main(): Promise<void> {
  configureHttp();
  const config = loadConfig();
  const logger = createLogger(config).child({ process: 'worker' });
  if (config.queue.driver !== 'bullmq') throw new Error('The worker requires QUEUE_DRIVER=bullmq');

  const container = buildContainer(config, logger);
  await container.storage.ensureReady();
  if (container.ai.embeddings instanceof LocalEmbeddingProvider) {
    logger.info('Loading embedding model');
    await container.ai.embeddings.warmUp();
  }

  const workers = (Object.values(QUEUES) as QueueName[]).map((queueName) => {
    const connection = createRedis(config.redisUrl, logger, `worker-${queueName}`);
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const name = job.name as JobName;
        if (JOB_QUEUE[name] !== queueName)
          throw new Error(`Job ${job.name} does not belong to ${queueName}`);
        const started = Date.now();
        const handler = container.handlers[name] as (
          payload: JobPayloads[JobName],
        ) => Promise<void>;
        await handler(job.data as JobPayloads[JobName]);
        logger.info(
          {
            queue: queueName,
            job: name,
            jobId: job.id,
            attempt: job.attemptsMade + 1,
            durationMs: Date.now() - started,
          },
          'Job completed',
        );
      },
      { connection, concurrency: Math.min(CONCURRENCY[queueName], config.queue.concurrency) },
    );
    worker.on('failed', (job, error) => {
      logger.warn(
        {
          queue: queueName,
          job: job?.name,
          jobId: job?.id,
          attempt: job?.attemptsMade,
          err: error.message,
        },
        'Job failed',
      );
    });
    worker.on('error', (error) => logger.error({ queue: queueName, err: error }, 'Worker error'));
    return { worker, connection };
  });

  // Repeatable job: interview reminders every 15 minutes.
  const reminderQueue = new Queue(QUEUES.email, {
    connection: createRedis(config.redisUrl, logger, 'scheduler'),
  });
  await reminderQueue.upsertJobScheduler(
    'interview-reminders',
    { every: 15 * 60_000 },
    { name: 'interviews.sendReminders', data: {} },
  );

  logger.info({ queues: Object.values(QUEUES), ai: container.ai.providerName }, 'Worker started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down worker');
    await Promise.all(workers.map(({ worker }) => worker.close()));
    await reminderQueue.close();
    workers.forEach(({ connection }) => connection.disconnect());
    await container.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Worker failed to start: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(1);
});
