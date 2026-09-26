import request from 'supertest';
import { CANDIDATES } from '@hireflow/database/seed';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  createPublishedJob,
  createTestContext,
  registerCandidate,
  registerRecruiter,
  resetDatabase,
  uploadResume,
  type Session,
  type TestContext,
} from '../helpers';

/**
 * The primary business flow end to end through the HTTP API, with real PDF extraction, parsing,
 * embeddings (local model), pgvector similarity and deterministic matching.
 */
let ctx: TestContext;
let recruiter: Session;
let strong: Session;
let weak: Session;
let job: { id: string; slug: string };
let strongApplicationId: string;
let weakApplicationId: string;

const strongFixture = CANDIDATES.find((c) => c.lastName === "O'Connor")!;
const weakFixture = CANDIDATES.find((c) => c.lastName === 'Tanaka')!;

beforeAll(async () => {
  ctx = createTestContext();
  await resetDatabase(ctx.container);
  recruiter = await registerRecruiter(ctx.app, 'recruiter@example.com', 'Flow Labs');
});
afterAll(() => ctx.container.close());

describe('hiring flow', () => {
  it('recruiter analyzes, creates and publishes a job', async () => {
    job = await createPublishedJob(ctx.app, recruiter);
    const detail = await request(ctx.app).get(`/api/jobs/${job.id}`).set(auth(recruiter)).expect(200);
    expect(detail.body.data.status).toBe('PUBLISHED');
    expect(detail.body.data.requirements.map((r: { skill: string }) => r.skill)).toEqual(
      expect.arrayContaining(['React', 'Node.js', 'PostgreSQL', 'TypeScript']),
    );
    expect(detail.body.data.analysisStatus).toBe('COMPLETED');

    const board = await request(ctx.app).get('/api/public/jobs').query({ search: 'full stack' }).expect(200);
    expect(board.body.data.map((j: { id: string }) => j.id)).toContain(job.id);
    await request(ctx.app).get(`/api/public/jobs/${job.slug}`).expect(200);
  });

  it('candidates upload resumes that are parsed into profiles', async () => {
    strong = await registerCandidate(ctx.app, 'liam@example.com', 'Liam', "O'Connor");
    weak = await registerCandidate(ctx.app, 'yuki@example.com', 'Yuki', 'Tanaka');
    const strongResume = await uploadResume(ctx.app, strong, strongFixture);
    await uploadResume(ctx.app, weak, weakFixture);

    const resume = await request(ctx.app).get(`/api/resumes/${strongResume}`).set(auth(strong)).expect(200);
    expect(resume.body.data.parsingStatus).toBe('COMPLETED');
    expect(resume.body.data.aiProvider).toBe('heuristic');

    const profile = await request(ctx.app).get('/api/candidates/me').set(auth(strong)).expect(200);
    const skills = profile.body.data.skills.map((s: { skill: string }) => s.skill);
    expect(skills).toEqual(expect.arrayContaining(['React', 'Node.js', 'WebSockets', 'PostgreSQL']));
    expect(profile.body.data.experiences.length).toBeGreaterThanOrEqual(2);
    expect(profile.body.data.highestEducation).toBe('BACHELOR');
    expect(profile.body.data.totalExperience).toBeGreaterThan(4);
    // Contact fields prefill the candidate's own profile.
    expect(profile.body.data.location).toBe(strongFixture.location);
  });

  it('candidates apply and receive a computed match', async () => {
    for (const [session, key] of [[strong, 'strong'], [weak, 'weak']] as const) {
      const resumes = await request(ctx.app).get('/api/resumes').set(auth(session)).expect(200);
      const res = await request(ctx.app)
        .post(`/api/jobs/${job.id}/applications`)
        .set(auth(session))
        .send({ resumeId: resumes.body.data[0].id })
        .expect(201);
      expect(res.body.data.status).toBe('APPLIED');
      if (key === 'strong') strongApplicationId = res.body.data.id;
      else weakApplicationId = res.body.data.id;
    }
    // Applying twice is rejected.
    const resumes = await request(ctx.app).get('/api/resumes').set(auth(strong));
    await request(ctx.app).post(`/api/jobs/${job.id}/applications`).set(auth(strong)).send({ resumeId: resumes.body.data[0].id }).expect(409);

    const strongMatch = await request(ctx.app).get(`/api/applications/${strongApplicationId}/match`).set(auth(recruiter)).expect(200);
    const weakMatch = await request(ctx.app).get(`/api/applications/${weakApplicationId}/match`).set(auth(recruiter)).expect(200);
    const s = strongMatch.body.data;
    const w = weakMatch.body.data;

    expect(s.overallScore).toBeGreaterThan(w.overallScore + 20);
    expect(s.matchedSkills).toEqual(expect.arrayContaining(['React', 'Node.js', 'PostgreSQL']));
    expect(s.semanticScore).toEqual(expect.any(Number));
    expect(s.explanation).toContain(`Overall ${s.overallScore}/100`);
    expect(w.missingSkills).toEqual(expect.arrayContaining(['React', 'Node.js']));
    expect(w.concerns.join(' ')).toMatch(/Missing required skills/);
    expect(s.weights.skills + s.weights.experience + s.weights.education + s.weights.semantic).toBeCloseTo(1, 2);
  });

  it('recruiter reviews applications ranked by score and views the candidate and resume', async () => {
    const list = await request(ctx.app)
      .get(`/api/jobs/${job.id}/applications`)
      .query({ sort: 'score', order: 'desc' })
      .set(auth(recruiter))
      .expect(200);
    expect(list.body.data.map((a: { id: string }) => a.id)).toEqual([strongApplicationId, weakApplicationId]);

    const detail = await request(ctx.app).get(`/api/applications/${strongApplicationId}`).set(auth(recruiter)).expect(200);
    expect(detail.body.data.match.requirements.length).toBeGreaterThan(0);
    const pdf = await request(ctx.app).get(`/api/resumes/${detail.body.data.resume.id}/download`).set(auth(recruiter)).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    const candidate = await request(ctx.app).get(`/api/candidates/${detail.body.data.candidate.id}`).set(auth(recruiter)).expect(200);
    expect(candidate.body.data.applications).toHaveLength(1);
  });

  it('moves the candidate through the pipeline with audit history and concurrency control', async () => {
    const moved = await request(ctx.app)
      .patch(`/api/applications/${strongApplicationId}/status`)
      .set(auth(recruiter))
      .send({ status: 'SHORTLISTED', fromStatus: 'APPLIED' })
      .expect(200);
    expect(moved.body.data.status).toBe('SHORTLISTED');
    expect(moved.body.data.history[0]).toMatchObject({ fromStatus: 'APPLIED', toStatus: 'SHORTLISTED' });

    // A stale client still thinking the card is in APPLIED gets a conflict.
    const stale = await request(ctx.app)
      .patch(`/api/applications/${strongApplicationId}/status`)
      .set(auth(recruiter))
      .send({ status: 'REJECTED', fromStatus: 'APPLIED' })
      .expect(409);
    expect(stale.body.error.details.currentStatus).toBe('SHORTLISTED');

    const audit = await request(ctx.app)
      .get('/api/organizations/current/audit-logs')
      .query({ entityType: 'Application', entityId: strongApplicationId })
      .set(auth(recruiter))
      .expect(200);
    expect(audit.body.data.map((a: { action: string }) => a.action)).toContain('CANDIDATE_SHORTLISTED');

    const pipeline = await request(ctx.app).get('/api/applications/pipeline').query({ jobId: job.id }).set(auth(recruiter)).expect(200);
    const shortlisted = pipeline.body.data.columns.find((c: { status: string }) => c.status === 'SHORTLISTED');
    expect(shortlisted.cards.map((c: { id: string }) => c.id)).toEqual([strongApplicationId]);

    // The candidate sees the new status but no internal data.
    const mine = await request(ctx.app).get(`/api/applications/mine/${strongApplicationId}`).set(auth(strong)).expect(200);
    expect(mine.body.data.status).toBe('SHORTLISTED');
    expect(mine.body.data.match).toBeUndefined();
    expect(JSON.stringify(mine.body.data)).not.toContain('overallScore');
  });

  it('generates candidate-specific interview questions and schedules an interview', async () => {
    const generated = await request(ctx.app)
      .post(`/api/applications/${strongApplicationId}/interview-questions`)
      .set(auth(recruiter))
      .send({ count: 6 })
      .expect(201);
    const questions = generated.body.data as Array<{ category: string; question: string; expectedSignals: string[] }>;
    expect(questions).toHaveLength(6);
    expect(new Set(questions.map((q) => q.category)).size).toBeGreaterThanOrEqual(4);
    expect(questions.every((q) => q.expectedSignals.length > 0)).toBe(true);
    expect(questions.some((q) => q.question.includes('LiveCursor') || q.question.includes('Chorus Collaboration'))).toBe(true);

    const scheduled = await request(ctx.app)
      .post('/api/interviews')
      .set(auth(recruiter))
      .send({
        applicationId: strongApplicationId,
        interviewerId: recruiter.userId,
        scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        duration: 45,
        type: 'VIDEO',
        meetingUrl: 'https://meet.example.com/abc',
      })
      .expect(201);
    expect(scheduled.body.data.status).toBe('SCHEDULED');

    const app = await request(ctx.app).get(`/api/applications/${strongApplicationId}`).set(auth(recruiter)).expect(200);
    expect(app.body.data.status).toBe('INTERVIEW');
    const upcoming = await request(ctx.app).get('/api/interviews/mine').set(auth(strong)).expect(200);
    expect(upcoming.body.data[0].meetingUrl).toBe('https://meet.example.com/abc');
    expect(ctx.email.sent.some((m) => m.to === 'liam@example.com' && m.subject.startsWith('Interview scheduled'))).toBe(true);
  });

  it('semantic search, copilot and analytics use the real data', async () => {
    const search = await request(ctx.app)
      .get('/api/candidates')
      .query({ q: 'real-time collaborative apps with WebSockets and React' })
      .set(auth(recruiter))
      .expect(200);
    expect(search.body.data[0].firstName).toBe('Liam');
    expect(search.body.data[0].similarity).toBeGreaterThan(search.body.data[1].similarity);

    const copilot = await request(ctx.app)
      .post('/api/copilot/chat')
      .set(auth(recruiter))
      .send({ message: 'Which candidates have strong React and Node.js experience?' })
      .expect(200);
    expect(copilot.body.data.answer).toContain("Liam O'Connor");
    expect(copilot.body.data.answer).not.toContain('Yuki Tanaka');
    expect(copilot.body.data.references.map((r: { name: string }) => r.name)).toEqual(["Liam O'Connor"]);

    const history = await request(ctx.app)
      .get(`/api/copilot/conversations/${copilot.body.data.conversationId}/messages`)
      .set(auth(recruiter))
      .expect(200);
    expect(history.body.data.map((m: { role: string }) => m.role)).toEqual(['USER', 'ASSISTANT']);

    const dashboard = await request(ctx.app).get('/api/analytics/dashboard').set(auth(recruiter)).expect(200);
    expect(dashboard.body.data.totals).toMatchObject({ activeJobs: 1, totalCandidates: 2, applications: 2, interviews: 1 });
    expect(dashboard.body.data.funnel.find((f: { stage: string }) => f.stage === 'Interview').count).toBe(1);
  });
});
