import {
  addApplicationNoteSchema,
  applicationListQuerySchema,
  generateQuestionsSchema,
  idParamSchema,
  pipelineQuerySchema,
  updateApplicationStatusSchema,
} from '@hireflow/shared';
import type { Container } from '../container';
import { created, handle, ok } from '../lib/http';
import { actorOf, authOf } from '../middleware/auth';

export function createApplicationController({ services }: Container) {
  const { applications, matching, interviews } = services;
  return {
    // Candidate
    mine: handle({}, async ({ req }) => ok(await applications.listForCandidate(authOf(req).userId))),
    mineDetail: handle({ params: idParamSchema }, async ({ req, params }) =>
      ok(await applications.getForCandidate(authOf(req).userId, params.id)),
    ),
    withdraw: handle({ params: idParamSchema }, async ({ req, params }) =>
      ok(await applications.withdraw(authOf(req).userId, params.id), { message: 'Application withdrawn' }),
    ),

    // Recruiter
    list: handle({ query: applicationListQuerySchema }, async ({ req, query }) => {
      const result = await applications.list(actorOf(req).organizationId, query);
      return ok(result.items, { pagination: result.pagination });
    }),
    pipeline: handle({ query: pipelineQuerySchema }, async ({ req, query }) =>
      ok(await applications.pipeline(actorOf(req).organizationId, query)),
    ),
    get: handle({ params: idParamSchema }, async ({ req, params }) => ok(await applications.get(actorOf(req).organizationId, params.id))),
    updateStatus: handle({ params: idParamSchema, body: updateApplicationStatusSchema }, async ({ req, params, body }) =>
      ok(await applications.updateStatus(actorOf(req), params.id, body), { message: 'Status updated' }),
    ),
    addNote: handle({ params: idParamSchema, body: addApplicationNoteSchema }, async ({ req, params, body }) =>
      created(await applications.addNote(actorOf(req), params.id, body)),
    ),
    getMatch: handle({ params: idParamSchema }, async ({ req, params }) => ok(await matching.get(actorOf(req).organizationId, params.id))),
    runMatch: handle({ params: idParamSchema }, async ({ req, params }) =>
      ok(await matching.recalculate(actorOf(req), params.id), { message: 'Match recalculated' }),
    ),
    questions: handle({ params: idParamSchema }, async ({ req, params }) =>
      ok(await interviews.listQuestions(actorOf(req).organizationId, params.id)),
    ),
    generateQuestions: handle({ params: idParamSchema, body: generateQuestionsSchema }, async ({ req, params, body }) =>
      created(await interviews.generateQuestions(actorOf(req), params.id, body), 'Interview questions generated'),
    ),
  };
}
