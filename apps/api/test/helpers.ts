import type { Express } from 'express';
import request from 'supertest';
import { CANDIDATES, type CandidateFixture } from '@hireflow/database/seed';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config/env';
import { buildContainer, type Container } from '../src/container';
import { ConsoleEmailProvider } from '../src/lib/email';
import { createLogger } from '../src/lib/logger';
import { renderResumePdf } from '../src/scripts/lib/resume-pdf';

export interface TestContext {
  app: Express;
  container: Container;
  email: ConsoleEmailProvider;
}

export function createTestContext(): TestContext {
  const config = loadConfig();
  const logger = createLogger(config);
  const email = new ConsoleEmailProvider(logger);
  const container = buildContainer(config, logger, { email, redis: null });
  return { app: createApp(container, { disableRateLimits: true }), container, email };
}

/** Empties every application table (the test database is dedicated to tests). */
export async function resetDatabase(container: Container): Promise<void> {
  const tables = await container.prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await container.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export const PASSWORD = 'Str0ngPassword!';

export interface Session {
  token: string;
  userId: string;
  cookie: string;
  organizationId: string | null;
  candidateProfileId: string | null;
}

function sessionFrom(res: request.Response): Session {
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  return {
    token: res.body.data.accessToken,
    userId: res.body.data.user.id,
    cookie: setCookie?.find((c) => c.startsWith('hf_refresh='))?.split(';')[0] ?? '',
    organizationId: res.body.data.memberships[0]?.organizationId ?? null,
    candidateProfileId: res.body.data.candidateProfileId,
  };
}

export async function registerRecruiter(
  app: Express,
  email: string,
  organizationName = 'Acme Hiring',
): Promise<Session> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password: PASSWORD,
      firstName: 'Rae',
      lastName: 'Cruiter',
      role: 'RECRUITER',
      organizationName,
    })
    .expect(201);
  return sessionFrom(res);
}

export async function registerCandidate(
  app: Express,
  email: string,
  firstName = 'Casey',
  lastName = 'Candidate',
): Promise<Session> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, firstName, lastName, role: 'CANDIDATE' })
    .expect(201);
  return sessionFrom(res);
}

export const auth = (session: Session) => ({ Authorization: `Bearer ${session.token}` });

export const FULL_STACK_DESCRIPTION = `We are hiring a Full Stack Developer to build real-time hiring tools.

Responsibilities:
- Build React and TypeScript user interfaces
- Design Node.js REST APIs backed by PostgreSQL

Requirements:
- 3+ years of professional software development experience
- Strong React and TypeScript
- Node.js and Express
- PostgreSQL
- Bachelor's degree in Computer Science or equivalent

Nice to have:
- AWS and Docker`;

export async function createPublishedJob(
  app: Express,
  recruiter: Session,
  title = 'Full Stack Developer',
): Promise<{ id: string; slug: string }> {
  const analysis = await request(app)
    .post('/api/jobs/analyze')
    .set(auth(recruiter))
    .send({ title, description: FULL_STACK_DESCRIPTION })
    .expect(200);
  const a = analysis.body.data.analysis;
  const created = await request(app)
    .post('/api/jobs')
    .set(auth(recruiter))
    .send({
      title,
      description: FULL_STACK_DESCRIPTION,
      remoteType: 'REMOTE',
      minYearsExperience: a.minYearsExperience,
      educationLevel: a.educationLevel,
      responsibilities: a.responsibilities,
      analysisSummary: a.summary,
      keywords: a.keywords,
      requirements: [
        ...a.requiredSkills.map((r: object) => ({ ...r, required: true, aiGenerated: true })),
        ...a.preferredSkills.map((r: object) => ({ ...r, required: false, aiGenerated: true })),
      ],
    })
    .expect(201);
  await request(app)
    .post(`/api/jobs/${created.body.data.id}/publish`)
    .set(auth(recruiter))
    .expect(200);
  return { id: created.body.data.id, slug: created.body.data.slug };
}

export async function resumePdf(fixture: CandidateFixture = CANDIDATES[0]!): Promise<Buffer> {
  return renderResumePdf(fixture);
}

export async function uploadResume(
  app: Express,
  candidate: Session,
  fixture?: CandidateFixture,
): Promise<string> {
  const res = await request(app)
    .post('/api/resumes/upload')
    .set(auth(candidate))
    .attach('file', await resumePdf(fixture), {
      filename: 'resume.pdf',
      contentType: 'application/pdf',
    })
    .expect(202);
  return res.body.data.id as string;
}

/** Extracts the one-time token from the most recent email with the given subject fragment. */
export function tokenFromEmail(
  email: ConsoleEmailProvider,
  to: string,
  subjectIncludes: string,
): string {
  const message = [...email.sent]
    .reverse()
    .find((m) => m.to === to && m.subject.includes(subjectIncludes));
  const token = message?.text.match(/token=([\w-]+)/)?.[1];
  if (!token) throw new Error(`No email with a token for ${to} (${subjectIncludes})`);
  return token;
}
