import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  createPublishedJob,
  createTestContext,
  PASSWORD,
  registerCandidate,
  registerRecruiter,
  resetDatabase,
  tokenFromEmail,
  type Session,
  type TestContext,
} from '../helpers';

let ctx: TestContext;
let orgA: Session;
let orgB: Session;
let candidate: Session;
let jobA: { id: string };

beforeAll(async () => {
  ctx = createTestContext();
  await resetDatabase(ctx.container);
  orgA = await registerRecruiter(ctx.app, 'a@example.com', 'Org A');
  orgB = await registerRecruiter(ctx.app, 'b@example.com', 'Org B');
  candidate = await registerCandidate(ctx.app, 'c@example.com');
  jobA = await createPublishedJob(ctx.app, orgA);
});
afterAll(() => ctx.container.close());

describe('role-based access', () => {
  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(ctx.app).get('/api/jobs').expect(401);
    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('keeps candidates out of the recruiter API', async () => {
    const res = await request(ctx.app).get('/api/jobs').set(auth(candidate)).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    await request(ctx.app).get('/api/candidates').set(auth(candidate)).expect(403);
    await request(ctx.app).get('/api/analytics/dashboard').set(auth(candidate)).expect(403);
  });

  it('keeps recruiters out of candidate-only routes', async () => {
    await request(ctx.app).get('/api/candidates/me').set(auth(orgA)).expect(403);
    await request(ctx.app)
      .post(`/api/jobs/${jobA.id}/applications`)
      .set(auth(orgA))
      .send({ resumeId: 'x' })
      .expect(403);
  });

  it('enforces org-role permissions (hiring manager cannot create or move)', async () => {
    await request(ctx.app)
      .post('/api/organizations/current/members')
      .set(auth(orgA))
      .send({
        email: 'hm@example.com',
        firstName: 'Hana',
        lastName: 'Manager',
        role: 'HIRING_MANAGER',
      })
      .expect(201);
    const token = tokenFromEmail(ctx.email, 'hm@example.com', 'invited');
    await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ token, password: PASSWORD })
      .expect(200);
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'hm@example.com', password: PASSWORD })
      .expect(200);
    const manager = { Authorization: `Bearer ${login.body.data.accessToken}` };

    await request(ctx.app).get('/api/jobs').set(manager).expect(200);
    const denied = await request(ctx.app)
      .post('/api/jobs')
      .set(manager)
      .send({ title: 'Nope', description: 'x'.repeat(60) })
      .expect(403);
    expect(denied.body.error.message).toContain('jobs:write');
    await request(ctx.app)
      .post('/api/organizations/current/members')
      .set(manager)
      .send({})
      .expect(403);
  });
});

describe('tenant isolation', () => {
  it('hides other organizations’ jobs and data', async () => {
    await request(ctx.app).get(`/api/jobs/${jobA.id}`).set(auth(orgB)).expect(404);
    await request(ctx.app)
      .patch(`/api/jobs/${jobA.id}`)
      .set(auth(orgB))
      .send({ title: 'Hijacked title' })
      .expect(404);
    await request(ctx.app).post(`/api/jobs/${jobA.id}/close`).set(auth(orgB)).expect(404);
    const list = await request(ctx.app).get('/api/jobs').set(auth(orgB)).expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('does not allow selecting a foreign organization via header', async () => {
    const res = await request(ctx.app)
      .get('/api/jobs')
      .set(auth(orgB))
      .set('X-Organization-Id', orgA.organizationId!)
      .expect(403);
    expect(res.body.error.message).toMatch(/not a member/);
  });
});

describe('validation', () => {
  it('returns a structured validation error envelope', async () => {
    const res = await request(ctx.app)
      .post('/api/jobs')
      .set(auth(orgA))
      .send({ title: 'x' })
      .expect(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(res.body.error.details.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['title', 'description']),
    );
    expect(res.body.error.requestId).toEqual(expect.any(String));
  });

  it('rejects non-PDF uploads regardless of the declared type', async () => {
    const res = await request(ctx.app)
      .post('/api/resumes/upload')
      .set(auth(candidate))
      .attach('file', Buffer.from('<html>not a pdf</html>'), {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      })
      .expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    await request(ctx.app)
      .post('/api/resumes/upload')
      .set(auth(candidate))
      .attach('file', Buffer.from('plain'), { filename: 'resume.txt', contentType: 'text/plain' })
      .expect(415);
    await request(ctx.app).post('/api/resumes/upload').set(auth(candidate)).expect(400);
  });

  it('refuses to publish a job without requirements', async () => {
    const created = await request(ctx.app)
      .post('/api/jobs')
      .set(auth(orgA))
      .send({
        title: 'Empty role',
        description: 'A role description that is long enough to pass validation rules.',
      })
      .expect(201);
    const res = await request(ctx.app)
      .post(`/api/jobs/${created.body.data.id}/publish`)
      .set(auth(orgA))
      .expect(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});
