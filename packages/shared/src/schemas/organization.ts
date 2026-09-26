import { z } from 'zod';
import { ASSIGNABLE_ORG_ROLES } from '../permissions';
import { emailSchema } from './auth';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'Use lowercase letters, numbers and hyphens' });

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema.optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

const weight = z.number().min(0).max(1);

export const matchingWeightsSchema = z
  .object({
    skills: weight,
    experience: weight,
    education: weight,
    semantic: weight,
  })
  .refine((w) => w.skills + w.experience + w.education + w.semantic > 0, {
    error: 'At least one weight must be greater than zero',
  });

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  logoUrl: z.preprocess((v) => (v === '' ? null : v), z.url().max(500).nullable()).optional(),
  matchingWeights: matchingWeightsSchema.optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

const assignableRole = z.enum(ASSIGNABLE_ORG_ROLES);

export const inviteMemberSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  role: assignableRole,
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({ role: assignableRole });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
