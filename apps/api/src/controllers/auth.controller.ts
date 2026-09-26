import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateAccountSchema,
  verifyEmailSchema,
  type AuthConfigDto,
} from '@hireflow/shared';
import type { Container } from '../container';
import { randomToken, safeEqual } from '../lib/crypto';
import { UnauthorizedError } from '../lib/errors';
import { handle, ok } from '../lib/http';
import { authOf, requestMeta } from '../middleware/auth';
import type { AuthResult } from '../services/auth.service';

export const REFRESH_COOKIE = 'hf_refresh';
const OAUTH_STATE_COOKIE = 'hf_oauth_state';
const AUTH_COOKIE_PATH = '/api/auth';

export function createAuthController({ services, config, ai }: Container) {
  const { auth } = services;

  const cookieBase: CookieOptions = {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: AUTH_COOKIE_PATH,
  };

  const setRefreshCookie = (res: Response, result: AuthResult) => {
    res.cookie(REFRESH_COOKIE, result.refresh.token, {
      ...cookieBase,
      expires: result.refresh.expiresAt,
    });
  };
  const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, cookieBase);
  const refreshTokenFrom = (req: Request): string | undefined => {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  return {
    config: handle({}, async () => {
      const data: AuthConfigDto = {
        googleEnabled: auth.googleEnabled,
        aiProvider: ai.providerName,
        aiIsHeuristic: ai.isHeuristic,
      };
      return ok(data);
    }),

    register: handle({ body: registerSchema }, async ({ body, req, res }) => {
      const result = await auth.register(body, requestMeta(req));
      setRefreshCookie(res, result);
      return {
        data: result.session,
        status: 201,
        message: 'Account created. Check your inbox to verify your email.',
      };
    }),

    login: handle({ body: loginSchema }, async ({ body, req, res }) => {
      const result = await auth.login(body, requestMeta(req));
      setRefreshCookie(res, result);
      return ok(result.session);
    }),

    refresh: handle({}, async ({ req, res }) => {
      const token = refreshTokenFrom(req);
      if (!token) throw new UnauthorizedError('No active session');
      try {
        const result = await auth.refresh(token, requestMeta(req));
        setRefreshCookie(res, result);
        return ok(result.session);
      } catch (error) {
        clearRefreshCookie(res);
        throw error;
      }
    }),

    logout: handle({}, async ({ req, res }) => {
      await auth.logout(refreshTokenFrom(req));
      clearRefreshCookie(res);
      return ok(null, { message: 'Signed out' });
    }),

    me: handle({}, async ({ req }) => ok(await auth.me(authOf(req).userId))),

    updateMe: handle({ body: updateAccountSchema }, async ({ req, body }) =>
      ok(await auth.updateAccount(authOf(req).userId, body), { message: 'Account updated' }),
    ),

    verifyEmail: handle({ body: verifyEmailSchema }, async ({ body }) =>
      ok(await auth.verifyEmail(body.token), { message: 'Email verified' }),
    ),

    resendVerification: handle({}, async ({ req }) => {
      await auth.resendVerification(authOf(req).userId);
      return ok(null, { message: 'Verification email sent' });
    }),

    forgotPassword: handle({ body: forgotPasswordSchema }, async ({ body }) => {
      await auth.forgotPassword(body.email);
      return ok(null, {
        message: 'If an account exists for that email, a reset link is on its way.',
      });
    }),

    resetPassword: handle({ body: resetPasswordSchema }, async ({ body, res }) => {
      await auth.resetPassword(body.token, body.password);
      clearRefreshCookie(res);
      return ok(null, { message: 'Password updated. You can now sign in.' });
    }),

    changePassword: handle({ body: changePasswordSchema }, async ({ req, res, body }) => {
      await auth.changePassword(authOf(req).userId, body);
      clearRefreshCookie(res);
      return ok(null, { message: 'Password changed. Please sign in again.' });
    }),

    googleStart: handle(
      { query: z.object({ role: z.enum(['CANDIDATE', 'RECRUITER']).default('CANDIDATE') }) },
      async ({ query, res }) => {
        const state = randomToken(24);
        res.cookie(OAUTH_STATE_COOKIE, `${state}.${query.role}`, {
          ...cookieBase,
          maxAge: 10 * 60_000,
        });
        res.redirect(auth.googleAuthorizationUrl(state));
        return undefined;
      },
    ),

    googleCallback: handle(
      {
        query: z.object({
          code: z.string().min(1).max(2000).optional(),
          state: z.string().max(200).optional(),
          error: z.string().optional(),
        }),
      },
      async ({ query, req, res }) => {
        const stored: unknown = req.cookies?.[OAUTH_STATE_COOKIE];
        res.clearCookie(OAUTH_STATE_COOKIE, cookieBase);
        const [expectedState, role] = typeof stored === 'string' ? stored.split('.') : [];
        const fail = () => res.redirect(`${config.webUrl}/login?error=google`);
        if (
          query.error ||
          !query.code ||
          !query.state ||
          !expectedState ||
          !safeEqual(query.state, expectedState)
        ) {
          fail();
          return undefined;
        }
        try {
          const result = await auth.googleSignIn(
            query.code,
            role === 'RECRUITER' ? 'RECRUITER' : 'CANDIDATE',
            requestMeta(req),
          );
          setRefreshCookie(res, result);
          res.redirect(`${config.webUrl}/auth/callback`);
        } catch {
          fail();
        }
        return undefined;
      },
    ),
  };
}
