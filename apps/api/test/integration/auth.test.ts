import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  createTestContext,
  PASSWORD,
  registerCandidate,
  registerRecruiter,
  resetDatabase,
  tokenFromEmail,
  type TestContext,
} from '../helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = createTestContext();
  await resetDatabase(ctx.container);
});
afterAll(() => ctx.container.close());

describe('registration', () => {
  it('creates a recruiter with an owned organization and a session', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        email: 'Owner@Example.com',
        password: PASSWORD,
        firstName: 'Olive',
        lastName: 'Owner',
        role: 'RECRUITER',
        organizationName: 'Olive Labs',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      email: 'owner@example.com',
      role: 'RECRUITER',
      emailVerified: false,
    });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.memberships).toEqual([
      expect.objectContaining({
        organizationName: 'Olive Labs',
        role: 'OWNER',
        permissions: expect.arrayContaining(['team:manage']),
      }),
    ]);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('hf_refresh='),
    )!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('creates a candidate with an empty profile', async () => {
    const session = await registerCandidate(ctx.app, 'cand@example.com');
    expect(session.candidateProfileId).toEqual(expect.any(String));
    expect(session.organizationId).toBeNull();
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await request(ctx.app)
      .post('/api/auth/register')
      .send({
        email: 'cand@example.com',
        password: PASSWORD,
        firstName: 'A',
        lastName: 'B',
        role: 'CANDIDATE',
      })
      .expect(409);
    const weak = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        email: 'weak@example.com',
        password: 'short',
        firstName: 'A',
        lastName: 'B',
        role: 'CANDIDATE',
      })
      .expect(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    expect(weak.body.error.details.issues[0].path).toBe('password');
  });

  it('requires an organization name for recruiters', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        email: 'noorg@example.com',
        password: PASSWORD,
        firstName: 'A',
        lastName: 'B',
        role: 'RECRUITER',
      })
      .expect(400);
    expect(res.body.error.details.issues[0].path).toBe('organizationName');
  });
});

describe('login, refresh and logout', () => {
  it('logs in with valid credentials and rejects invalid ones with the same message', async () => {
    await registerRecruiter(ctx.app, 'login@example.com');
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: PASSWORD })
      .expect(200);
    const wrong = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'Wrong-pass1' })
      .expect(401);
    const unknown = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Wrong-pass1' })
      .expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const session = await registerRecruiter(ctx.app, 'rotate@example.com');
    const first = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(200);
    const rotated = (first.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('hf_refresh='))!
      .split(';')[0]!;
    expect(rotated).not.toBe(session.cookie);

    // Replaying the original (now rotated) token is treated as theft.
    await request(ctx.app).post('/api/auth/refresh').set('Cookie', session.cookie).expect(401);
    // ...which also invalidates the token issued by the legitimate rotation.
    await request(ctx.app).post('/api/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('logout revokes the session', async () => {
    const session = await registerRecruiter(ctx.app, 'logout@example.com');
    await request(ctx.app).post('/api/auth/logout').set('Cookie', session.cookie).expect(200);
    await request(ctx.app).post('/api/auth/refresh').set('Cookie', session.cookie).expect(401);
  });

  it('returns the current user for a valid access token only', async () => {
    const session = await registerCandidate(ctx.app, 'me@example.com');
    const me = await request(ctx.app).get('/api/auth/me').set(auth(session)).expect(200);
    expect(me.body.data.user.email).toBe('me@example.com');
    await request(ctx.app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    await request(ctx.app).get('/api/auth/me').expect(401);
  });
});

describe('email verification and password reset', () => {
  it('verifies email with a single-use token', async () => {
    await registerCandidate(ctx.app, 'verify@example.com');
    const token = tokenFromEmail(ctx.email, 'verify@example.com', 'Verify');
    const res = await request(ctx.app).post('/api/auth/verify-email').send({ token }).expect(200);
    expect(res.body.data.emailVerified).toBe(true);
    await request(ctx.app).post('/api/auth/verify-email').send({ token }).expect(400);
  });

  it('resets the password and invalidates existing sessions', async () => {
    const session = await registerCandidate(ctx.app, 'reset@example.com');
    await request(ctx.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'reset@example.com' })
      .expect(200);
    // Unknown emails get the same response (no account enumeration).
    const unknown = await request(ctx.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost@example.com' })
      .expect(200);
    expect(unknown.body.message).toMatch(/If an account exists/);

    const token = tokenFromEmail(ctx.email, 'reset@example.com', 'Reset');
    await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'N3w-Password!' })
      .expect(200);
    await request(ctx.app).post('/api/auth/refresh').set('Cookie', session.cookie).expect(401);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: 'N3w-Password!' })
      .expect(200);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: PASSWORD })
      .expect(401);
  });
});
