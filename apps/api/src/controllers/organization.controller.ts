import { z } from 'zod';
import {
  createOrganizationSchema,
  idParamSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from '@hireflow/shared';
import type { Container } from '../container';
import { created, handle, ok } from '../lib/http';
import { actorOf, authOf } from '../middleware/auth';

const auditQuerySchema = z.object({
  entityType: z
    .enum(['Job', 'Application', 'Candidate', 'Interview', 'Organization', 'Member', 'Resume'])
    .optional(),
  entityId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function createOrganizationController({ services }: Container) {
  const { organizations, audit } = services;
  return {
    create: handle({ body: createOrganizationSchema }, async ({ req, body }) =>
      created(await organizations.create(authOf(req).userId, body), 'Organization created'),
    ),
    current: handle({}, async ({ req }) =>
      ok(await organizations.get(actorOf(req).organizationId)),
    ),
    update: handle({ body: updateOrganizationSchema }, async ({ req, body }) =>
      ok(await organizations.update(actorOf(req), body), { message: 'Organization updated' }),
    ),
    members: handle({}, async ({ req }) =>
      ok(await organizations.listMembers(actorOf(req).organizationId)),
    ),
    invite: handle({ body: inviteMemberSchema }, async ({ req, body }) =>
      created(await organizations.invite(actorOf(req), body), 'Invitation sent'),
    ),
    updateMember: handle(
      { params: idParamSchema, body: updateMemberRoleSchema },
      async ({ req, params, body }) => {
        await organizations.updateMemberRole(actorOf(req), params.id, body);
        return ok(null, { message: 'Role updated' });
      },
    ),
    removeMember: handle({ params: idParamSchema }, async ({ req, params }) => {
      await organizations.removeMember(actorOf(req), params.id);
      return ok(null, { message: 'Member removed' });
    }),
    auditLogs: handle({ query: auditQuerySchema }, async ({ req, query }) =>
      ok(
        await audit.list(actorOf(req).organizationId, {
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.entityId ? { entityId: query.entityId } : {}),
          limit: query.limit,
        }),
      ),
    ),
  };
}
