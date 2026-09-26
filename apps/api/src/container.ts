import type { Redis } from 'ioredis';
import { createPrismaClient, type PrismaClient } from '@hireflow/database';
import { createAIService, type AIService } from './ai/ai-service';
import type { AppConfig } from './config/env';
import { BullMqDispatcher, InlineDispatcher } from './jobs/dispatchers';
import type { JobDispatcher, JobHandlers } from './jobs/definitions';
import { createEmailProvider, type EmailProvider } from './lib/email';
import type { Logger } from './lib/logger';
import { Cache, createRedis } from './lib/redis';
import { createStorageProvider, type StorageProvider } from './lib/storage';
import { AnalyticsRepository } from './repositories/analytics.repository';
import { VectorRepository } from './repositories/vector.repository';
import { AnalyticsService } from './services/analytics.service';
import { ApplicationService } from './services/application.service';
import { AuditService } from './services/audit.service';
import { AuthService } from './services/auth.service';
import { CandidateService } from './services/candidate.service';
import { CopilotService } from './services/copilot.service';
import { EmbeddingService } from './services/embedding.service';
import { InterviewService } from './services/interview.service';
import { JobService } from './services/job.service';
import { MatchingService } from './services/matching.service';
import { NotificationService } from './services/notification.service';
import { OrganizationService } from './services/organization.service';
import { ResumeService } from './services/resume.service';
import { TokenService } from './services/token.service';

export interface Services {
  tokens: TokenService;
  audit: AuditService;
  auth: AuthService;
  organizations: OrganizationService;
  jobs: JobService;
  candidates: CandidateService;
  resumes: ResumeService;
  embeddings: EmbeddingService;
  matching: MatchingService;
  applications: ApplicationService;
  interviews: InterviewService;
  copilot: CopilotService;
  analytics: AnalyticsService;
  notifications: NotificationService;
}

export interface Container {
  config: AppConfig;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis | null;
  storage: StorageProvider;
  email: EmailProvider;
  ai: AIService;
  dispatcher: JobDispatcher;
  services: Services;
  handlers: JobHandlers;
  close(): Promise<void>;
}

export interface ContainerOverrides {
  prisma?: PrismaClient;
  storage?: StorageProvider;
  email?: EmailProvider;
  ai?: AIService;
  redis?: Redis | null;
}

/**
 * Composition root: the single place where concrete implementations are chosen and wired.
 * Tests pass overrides (local storage, console email, inline queue) to build an isolated graph.
 */
export function buildContainer(config: AppConfig, logger: Logger, overrides: ContainerOverrides = {}): Container {
  const prisma = overrides.prisma ?? createPrismaClient({ url: config.databaseUrl });
  const redis =
    overrides.redis !== undefined ? overrides.redis : config.queue.driver === 'bullmq' ? createRedis(config.redisUrl, logger, 'api') : null;
  const storage = overrides.storage ?? createStorageProvider(config.storage);
  const email = overrides.email ?? createEmailProvider(config.email, logger);
  const ai = overrides.ai ?? createAIService(config.ai, logger);

  const dispatcher: JobDispatcher =
    config.queue.driver === 'bullmq' && redis ? new BullMqDispatcher(redis, logger) : new InlineDispatcher(logger);

  const cache = new Cache(redis);
  const vectors = new VectorRepository(prisma);
  const tokens = new TokenService(prisma, config.auth);
  const audit = new AuditService(prisma, logger);
  const auth = new AuthService(prisma, tokens, dispatcher, config, logger);
  const interviews = new InterviewService(prisma, ai, audit, dispatcher, config, logger);

  const services: Services = {
    tokens,
    audit,
    auth,
    organizations: new OrganizationService(prisma, auth, audit, dispatcher, config),
    jobs: new JobService(prisma, ai, audit, dispatcher),
    candidates: new CandidateService(prisma, ai, vectors, audit, dispatcher),
    resumes: new ResumeService(prisma, storage, ai, audit, dispatcher, logger),
    embeddings: new EmbeddingService(prisma, ai, vectors, dispatcher, logger),
    matching: new MatchingService(prisma, vectors, audit, logger),
    applications: new ApplicationService(prisma, audit, dispatcher, config),
    interviews,
    copilot: new CopilotService(prisma, ai, vectors, interviews, logger),
    analytics: new AnalyticsService(new AnalyticsRepository(prisma), audit, cache),
    notifications: new NotificationService(prisma, email, config.email.from, logger),
  };

  const handlers: JobHandlers = {
    'resume.process': ({ resumeId }) => services.resumes.process(resumeId),
    'embedding.candidate': ({ candidateId }) => services.embeddings.embedCandidate(candidateId),
    'embedding.job': ({ jobId }) => services.embeddings.embedJob(jobId),
    'matching.application': async ({ applicationId }) => {
      await services.matching.computeForApplication(applicationId);
    },
    'matching.job': async ({ jobId }) => {
      await services.matching.computeForJob(jobId);
    },
    'matching.candidate': async ({ candidateId }) => {
      await services.matching.computeForCandidate(candidateId);
    },
    'email.send': (payload) => services.notifications.send(payload),
    'analytics.refresh': ({ organizationId }) => services.analytics.refresh(organizationId),
    'interviews.sendReminders': async () => {
      await services.interviews.sendReminders();
    },
  };
  if (dispatcher instanceof InlineDispatcher) dispatcher.setHandlers(handlers);

  return {
    config,
    logger,
    prisma,
    redis,
    storage,
    email,
    ai,
    dispatcher,
    services,
    handlers,
    async close() {
      await dispatcher.close();
      await prisma.$disconnect();
      if (redis && overrides.redis === undefined) redis.disconnect();
    },
  };
}
