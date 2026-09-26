import {
  copilotChatSchema,
  createInterviewSchema,
  idParamSchema,
  interviewListQuerySchema,
  updateInterviewSchema,
} from '@hireflow/shared';
import type { Container } from '../container';
import { created, handle, ok } from '../lib/http';
import { actorOf, authOf } from '../middleware/auth';

export function createInterviewController({ services }: Container) {
  const { interviews } = services;
  return {
    list: handle({ query: interviewListQuerySchema }, async ({ req, query }) => {
      const actor = actorOf(req);
      const result = await interviews.list(actor.organizationId, actor.userId, query);
      return ok(result.items, { pagination: result.pagination });
    }),
    create: handle({ body: createInterviewSchema }, async ({ req, body }) =>
      created(await interviews.create(actorOf(req), body), 'Interview scheduled'),
    ),
    update: handle({ params: idParamSchema, body: updateInterviewSchema }, async ({ req, params, body }) =>
      ok(await interviews.update(actorOf(req), params.id, body), { message: 'Interview updated' }),
    ),
    mine: handle({}, async ({ req }) => ok(await interviews.listForCandidate(authOf(req).userId))),
  };
}

export function createCopilotController({ services }: Container) {
  const { copilot } = services;
  return {
    chat: handle({ body: copilotChatSchema }, async ({ req, body }) => ok(await copilot.chat(actorOf(req), body))),
    conversations: handle({}, async ({ req }) => ok(await copilot.listConversations(actorOf(req)))),
    messages: handle({ params: idParamSchema }, async ({ req, params }) => ok(await copilot.messages(actorOf(req), params.id))),
    remove: handle({ params: idParamSchema }, async ({ req, params }) => {
      await copilot.deleteConversation(actorOf(req), params.id);
      return ok(null, { message: 'Conversation deleted' });
    }),
  };
}

export function createAnalyticsController({ services }: Container) {
  return {
    dashboard: handle({}, async ({ req }) => ok(await services.analytics.dashboard(actorOf(req).organizationId))),
  };
}

export function createHealthController({ prisma, redis, ai, storage }: Container) {
  return {
    live: handle({}, async () => ok({ status: 'ok' })),
    ready: handle({}, async ({ res }) => {
      const checks: Record<string, 'ok' | 'error'> = {};
      checks.database = await prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const).catch(() => 'error' as const);
      if (redis) checks.redis = await redis.ping().then(() => 'ok' as const).catch(() => 'error' as const);
      const healthy = Object.values(checks).every((v) => v === 'ok');
      res.status(healthy ? 200 : 503);
      return { data: { status: healthy ? 'ok' : 'degraded', checks, aiProvider: ai.providerName, storage: storage.name }, status: healthy ? 200 : 503 };
    }),
  };
}
