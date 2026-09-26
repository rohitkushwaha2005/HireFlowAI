import {
  candidateSearchQuerySchema,
  idParamSchema,
  replaceEducationSchema,
  replaceExperienceSchema,
  replaceSkillsSchema,
  updateCandidateProfileSchema,
} from '@hireflow/shared';
import type { Container } from '../container';
import { handle, ok } from '../lib/http';
import { actorOf, authOf } from '../middleware/auth';

export function createCandidateController({ services }: Container) {
  const { candidates } = services;
  return {
    // Candidate self-service
    me: handle({}, async ({ req }) => ok(await candidates.getOwn(authOf(req).userId))),
    updateMe: handle({ body: updateCandidateProfileSchema }, async ({ req, body }) =>
      ok(await candidates.updateOwn(authOf(req).userId, body), { message: 'Profile updated' }),
    ),
    replaceSkills: handle({ body: replaceSkillsSchema }, async ({ req, body }) =>
      ok(await candidates.replaceSkills(authOf(req).userId, body), { message: 'Skills updated' }),
    ),
    replaceExperience: handle({ body: replaceExperienceSchema }, async ({ req, body }) =>
      ok(await candidates.replaceExperience(authOf(req).userId, body), {
        message: 'Experience updated',
      }),
    ),
    replaceEducation: handle({ body: replaceEducationSchema }, async ({ req, body }) =>
      ok(await candidates.replaceEducation(authOf(req).userId, body), {
        message: 'Education updated',
      }),
    ),
    dashboard: handle({}, async ({ req }) => ok(await candidates.dashboard(authOf(req).userId))),

    // Recruiter
    search: handle({ query: candidateSearchQuerySchema }, async ({ req, query }) => {
      const result = await candidates.search(actorOf(req).organizationId, query);
      return ok(result.items, { pagination: result.pagination });
    }),
    get: handle({ params: idParamSchema }, async ({ req, params }) =>
      ok(await candidates.getForRecruiter(actorOf(req), params.id)),
    ),
  };
}
