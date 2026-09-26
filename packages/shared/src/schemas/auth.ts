import { z } from 'zod';
import { optionalText } from './common';

export const emailSchema = z
  .email({ error: 'Enter a valid email address' })
  .trim()
  .toLowerCase()
  .max(254);

export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters` })
  .max(128, { error: 'Use at most 128 characters' })
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), {
    error: 'Include upper and lower case letters',
  })
  .refine((v) => /\d/.test(v), { error: 'Include at least one number' });

const nameSchema = z.string().trim().min(1, { error: 'Required' }).max(60);

export const REGISTRABLE_ROLES = ['RECRUITER', 'CANDIDATE'] as const;

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    role: z.enum(REGISTRABLE_ROLES),
    /** Recruiters create their workspace during sign-up. */
    organizationName: optionalText(100),
  })
  .refine((v) => v.role !== 'RECRUITER' || (v.organizationName && v.organizationName.length >= 2), {
    path: ['organizationName'],
    error: 'Company name is required for recruiter accounts',
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Password is required' }).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const tokenSchema = z.string().trim().min(20).max(200);

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: tokenSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateAccountSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  avatarUrl: z
    .preprocess((v) => (v === '' ? null : v), z.url().max(500).nullable())
    .optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
