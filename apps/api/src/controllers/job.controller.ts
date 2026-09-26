import { z } from 'zod';
import {
  analyzeJobSchema,
  applicationListQuerySchema,
  createApplicationSchema,
  createJobSchema,
  idParamSchema,
  jobListQuerySchema,
  jobTransitionParamSchema,
  publicJobListQuerySchema,
  updateJobSchema,
} from '@hireflow/shared';
import type { Container } from '../container';
import { created, handle, ok } from '../lib/http';
import { actorOf, authOf } from '../middleware/auth';

const slugParamSchema = z.object({ slug: z.string().min(1).max(120) });

export function createJobController({ services }: Container) {
  const { jobs, applications } = services;
  return {
    list: handle({ query: jobListQuerySchema }, async ({ req, query }) => {
      const result = await jobs.list(actorOf(req).organizationId, query);
      return ok(result.items, { pagination: result.pagination });
    }),
    get: handle({ params: idParamSchema }, async ({ req, params }) => ok(await jobs.get(actorOf(req).organizationId, params.id))),
    create: handle({ body: createJobSchema }, async ({ req, body }) => created(await jobs.create(actorOf(req), body), 'Job created')),
    update: handle({ params: idParamSchema, body: updateJobSchema }, async ({ req, params, body }) =>
      ok(await jobs.update(actorOf(req), params.id, body), { message: 'Job updated' }),
    ),
    transition: handle({ params: jobTransitionParamSchema }, async ({ req, params }) => {
      const job = await jobs.transition(actorOf(req), params.id, params.action);
      const verb = { publish: 'published', pause: 'paused', close: 'closed', reopen: 'reopened' }[params.action];
      return ok(job, { message: `Job ${verb}` });
    }),
    duplicate: handle({ params: idParamSchema }, async ({ req, params }) =>
      created(await jobs.duplicate(actorOf(req), params.id), 'Job duplicated'),
    ),
    remove: handle({ params: idParamSchema }, async ({ req, params }) => {
      await jobs.delete(actorOf(req), params.id);
      return ok(null, { message: 'Job deleted' });
    }),
    analyze: handle({ body: analyzeJobSchema }, async ({ body }) => ok(await jobs.analyze(body))),
    applications: handle(
      { params: idParamSchema, query: applicationListQuerySchema },
      async ({ req, params, query }) => {
        const result = await applications.list(actorOf(req).organizationId, { ...query, jobId: params.id });
        return ok(result.items, { pagination: result.pagination });
      },
    ),
    apply: handle({ params: idParamSchema, body: createApplicationSchema }, async ({ req, params, body }) =>
      created(await applications.apply(authOf(req).userId, params.id, body), 'Application submitted'),
    ),

    // Public job board
    listPublic: handle({ query: publicJobListQuerySchema }, async ({ query }) => {
      const result = await jobs.listPublic(query);
      return ok(result.items, { pagination: result.pagination });
    }),
    getPublic: handle({ params: slugParamSchema }, async ({ req, params }) => ok(await jobs.getPublic(params.slug, req.auth))),
  };
}
