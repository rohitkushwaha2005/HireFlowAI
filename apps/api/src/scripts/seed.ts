/**
 * Development seed. Builds the TechNova Labs demo through the real services and pipeline:
 * resumes are rendered to PDF, uploaded to object storage, parsed by the configured AI provider,
 * embedded and matched — exactly like production data. Idempotent: it only removes and recreates
 * records belonging to the demo organization and `@demo.hireflow.local` accounts.
 */
import {
  CANDIDATES,
  DEFAULT_DEMO_PASSWORD,
  DEMO_EMAIL_DOMAIN,
  DEMO_ORGANIZATION,
  JOBS,
  STAFF,
  type JobKey,
} from '@hireflow/database/seed';
import { type PIPELINE_STAGES, type ApplicationStatus } from '@hireflow/shared';
import { prepareRequirements } from '../services/job.service';
import { loadConfig } from '../config/env';
import { buildContainer } from '../container';
import { hashPassword } from '../lib/crypto';
import { ConsoleEmailProvider } from '../lib/email';
import { createLogger } from '../lib/logger';
import { configureHttp } from '../lib/network';
import type { Actor } from '../types/context';
import { renderResumePdf } from './lib/resume-pdf';

const DAY = 86_400_000;
const daysAgo = (days: number, hour = 10) => {
  const date = new Date(Date.now() - days * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};
const daysFromNow = (days: number, hour = 16) => daysAgo(-days, hour);

/** Forward path to a status, e.g. INTERVIEW → [SCREENING, SHORTLISTED, INTERVIEW]. */
function pathTo(status: ApplicationStatus): Array<(typeof PIPELINE_STAGES)[number]> {
  if (status === 'APPLIED' || status === 'WITHDRAWN') return [];
  if (status === 'REJECTED') return ['SCREENING', 'REJECTED'];
  const forward = ['SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED'] as const;
  return [...forward.slice(0, forward.indexOf(status as (typeof forward)[number]) + 1)];
}

async function main(): Promise<void> {
  configureHttp();
  const config = loadConfig({
    ...process.env,
    QUEUE_DRIVER: 'inline',
    EMAIL_PROVIDER: 'console',
    LOG_LEVEL: process.env.SEED_LOG_LEVEL ?? 'warn',
  });
  // The local Docker demo runs production images; it opts in explicitly with ALLOW_DEMO_SEED=true.
  if (config.isProduction && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Refusing to seed demo data in production (set ALLOW_DEMO_SEED=true for a local demo stack)',
    );
  }
  const logger = createLogger(config);
  const container = buildContainer(config, logger, {
    email: new ConsoleEmailProvider(logger),
    redis: null,
  });
  const { prisma, services } = container;
  const password = process.env.DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD;
  const log = (message: string) => process.stdout.write(`${message}\n`);

  log(`Seeding demo data (AI provider: ${container.ai.providerName})`);
  await container.storage.ensureReady();

  // ── Clean previous demo data ──────────────────────────────────────────────
  await prisma.organization.deleteMany({ where: { slug: DEMO_ORGANIZATION.slug } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });

  // ── Organization and staff ────────────────────────────────────────────────
  const passwordHash = await hashPassword(password);
  const organization = await prisma.organization.create({
    data: { name: DEMO_ORGANIZATION.name, slug: DEMO_ORGANIZATION.slug, createdAt: daysAgo(90) },
  });
  const staff = new Map<string, { id: string; role: Actor['orgRole'] }>();
  for (const member of STAFF) {
    const user = await prisma.user.create({
      data: {
        email: member.email,
        passwordHash,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.globalRole,
        emailVerified: true,
        createdAt: daysAgo(90),
        memberships: {
          create: { organizationId: organization.id, role: member.orgRole, createdAt: daysAgo(90) },
        },
      },
    });
    staff.set(member.key, { id: user.id, role: member.orgRole });
  }
  const owner = staff.get('owner')!;
  const actor: Actor = {
    userId: owner.id,
    organizationId: organization.id,
    orgRole: 'OWNER',
    ipAddress: null,
  };
  log(`✓ Organization "${organization.name}" with ${STAFF.length} team members`);

  // ── Jobs ──────────────────────────────────────────────────────────────────
  const jobIds = new Map<JobKey, string>();
  for (const job of JOBS) {
    const created = await prisma.job.create({
      data: {
        organizationId: organization.id,
        createdById: owner.id,
        title: job.title,
        slug: `${job.key}-${organization.slug}`.replace(/[^a-z0-9-]/g, '-'),
        description: job.description,
        responsibilities: job.responsibilities,
        location: job.location,
        employmentType: job.employmentType,
        experienceLevel: job.experienceLevel,
        remoteType: job.remoteType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        minYearsExperience: job.minYearsExperience,
        educationLevel: job.educationLevel,
        // Seeded jobs are published so candidates can apply; lifecycle is set after applications.
        status: 'PUBLISHED',
        publishedAt: job.publishedDaysAgo !== null ? daysAgo(job.publishedDaysAgo) : null,
        createdAt: daysAgo((job.publishedDaysAgo ?? 3) + 2),
        analysisStatus: 'COMPLETED',
        analysisSummary: job.description.split('\n')[0]!.slice(0, 300),
        keywords: job.requirements.map((r) => r.skill),
        analyzedAt: daysAgo((job.publishedDaysAgo ?? 3) + 2),
        aiProvider: 'seed',
        requirements: {
          createMany: {
            data: prepareRequirements(
              job.requirements.map((r) => ({
                ...r,
                minimumYears: r.minimumYears ?? null,
                aiGenerated: true,
              })),
            ),
          },
        },
      },
    });
    jobIds.set(job.key, created.id);
    await prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: owner.id,
        action: 'JOB_CREATED',
        entityType: 'Job',
        entityId: created.id,
        metadata: { title: job.title },
        createdAt: created.createdAt,
      },
    });
    await services.embeddings.embedJob(created.id);
  }
  log(`✓ ${JOBS.length} jobs with requirements and embeddings`);

  // ── Candidates: real upload → parse → embed pipeline ──────────────────────
  const applicationIds: Array<{
    id: string;
    fixture: (typeof CANDIDATES)[number]['applications'][number];
    candidate: string;
  }> = [];
  for (const [index, fixture] of CANDIDATES.entries()) {
    const user = await prisma.user.create({
      data: {
        email: fixture.email,
        passwordHash,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        role: 'CANDIDATE',
        emailVerified: true,
        createdAt: daysAgo(Math.max(...fixture.applications.map((a) => a.daysAgo)) + 1),
        candidateProfile: { create: {} },
      },
    });
    const pdf = await renderResumePdf(fixture);
    const fileName = `${fixture.firstName}-${fixture.lastName}-resume.pdf`.replace(/[^\w.-]/g, '');
    const resume = await services.resumes.upload(user.id, {
      originalname: fileName,
      mimetype: 'application/pdf',
      buffer: pdf,
      size: pdf.length,
    });

    for (const application of fixture.applications) {
      const jobId = jobIds.get(application.job)!;
      const created = await services.applications.apply(user.id, jobId, {
        resumeId: resume.id,
        ...(application.coverLetter ? { coverLetter: application.coverLetter } : {}),
      });
      applicationIds.push({
        id: created.id,
        fixture: application,
        candidate: `${fixture.firstName} ${fixture.lastName}`,
      });
    }
    log(
      `  • ${index + 1}/${CANDIDATES.length} ${fixture.firstName} ${fixture.lastName} (${resume.parsingStatus.toLowerCase()} → parsed)`,
    );
  }
  log(
    `✓ ${CANDIDATES.length} candidates with parsed resumes and ${applicationIds.length} applications`,
  );

  // ── Pipeline history (recruiter actions, then backdated for analytics) ─────
  for (const app of applicationIds) {
    const appliedAt = daysAgo(app.fixture.daysAgo, 9 + (app.fixture.daysAgo % 8));
    await prisma.application.update({ where: { id: app.id }, data: { appliedAt } });
    await prisma.applicationStatusEvent.updateMany({
      where: { applicationId: app.id },
      data: { createdAt: appliedAt },
    });

    const steps = pathTo(app.fixture.status);
    for (const [i, status] of steps.entries()) {
      const stepActor = { ...actor, userId: i % 2 === 0 ? owner.id : staff.get('recruiter2')!.id };
      await services.applications.updateStatus(stepActor, app.id, { status });
      const when = new Date(
        appliedAt.getTime() + ((i + 1) / (steps.length + 1)) * (Date.now() - appliedAt.getTime()),
      );
      await prisma.applicationStatusEvent.updateMany({
        where: { applicationId: app.id, toStatus: status },
        data: { createdAt: when },
      });
      await prisma.auditLog.updateMany({
        where: {
          entityId: app.id,
          entityType: 'Application',
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
        data: { createdAt: when },
      });
    }
  }
  log('✓ Pipeline stages and status history');

  // ── Interviews ────────────────────────────────────────────────────────────
  const manager = staff.get('manager')!;
  const byName = (name: string, job: JobKey) =>
    applicationIds.find((a) => a.candidate === name && a.fixture.job === job)!.id;
  const interviews = [
    {
      app: byName('Priya Raman', 'frontend'),
      at: daysFromNow(2, 17),
      type: 'TECHNICAL' as const,
      interviewer: owner.id,
      status: 'SCHEDULED' as const,
    },
    {
      app: byName('Daniel Kim', 'backend'),
      at: daysAgo(3, 18),
      type: 'VIDEO' as const,
      interviewer: manager.id,
      status: 'COMPLETED' as const,
      feedback:
        'Deep distributed-systems experience; strong Go and PostgreSQL. Less hands-on Node.js — worth probing in the system design round.',
      rating: 4,
    },
    {
      app: byName('Daniel Kim', 'backend'),
      at: daysFromNow(4, 18),
      type: 'TECHNICAL' as const,
      interviewer: owner.id,
      status: 'SCHEDULED' as const,
    },
    {
      app: byName('Arjun Mehta', 'ai'),
      at: daysFromNow(1, 19),
      type: 'VIDEO' as const,
      interviewer: manager.id,
      status: 'SCHEDULED' as const,
    },
    {
      app: byName('Kenji Watanabe', 'backend'),
      at: daysAgo(12, 17),
      type: 'PANEL' as const,
      interviewer: manager.id,
      status: 'COMPLETED' as const,
      feedback: 'Excellent API design and ownership of reliability. Recommended for offer.',
      rating: 5,
    },
    {
      app: byName('Grace Mensah', 'fullstack'),
      at: daysAgo(9, 16),
      type: 'ONSITE' as const,
      interviewer: owner.id,
      status: 'COMPLETED' as const,
      feedback: 'Strong leadership and architecture skills across the stack.',
      rating: 5,
    },
    {
      app: byName('Chloe Dubois', 'analyst'),
      at: daysAgo(62, 15),
      type: 'VIDEO' as const,
      interviewer: manager.id,
      status: 'COMPLETED' as const,
      feedback: 'Clear communicator, strong SQL.',
      rating: 4,
    },
  ];
  for (const interview of interviews) {
    const created = await prisma.interview.create({
      data: {
        applicationId: interview.app,
        interviewerId: interview.interviewer,
        scheduledAt: interview.at,
        duration: interview.type === 'ONSITE' || interview.type === 'PANEL' ? 120 : 60,
        type: interview.type,
        status: interview.status,
        meetingUrl:
          interview.type === 'ONSITE' ? null : 'https://meet.example.com/technova-interview',
        location: interview.type === 'ONSITE' ? 'TechNova HQ, Austin' : null,
        feedback: interview.feedback ?? null,
        rating: interview.rating ?? null,
        createdAt: new Date(Math.min(interview.at.getTime() - 3 * DAY, Date.now())),
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: interview.interviewer,
        action: 'INTERVIEW_CREATED',
        entityType: 'Interview',
        entityId: created.id,
        metadata: { applicationId: interview.app },
        createdAt: created.createdAt,
      },
    });
  }
  log(`✓ ${interviews.length} interviews`);

  // ── AI interview questions for shortlisted candidates ─────────────────────
  for (const app of [byName("Liam O'Connor", 'fullstack'), byName('Arjun Mehta', 'ai')]) {
    await services.interviews.generateQuestions(actor, app, { count: 8 });
  }
  log('✓ AI interview questions for 2 candidates');

  // ── Final job lifecycle states ────────────────────────────────────────────
  for (const job of JOBS.filter((j) => j.status !== 'PUBLISHED')) {
    await prisma.job.update({
      where: { id: jobIds.get(job.key)! },
      data:
        job.status === 'CLOSED'
          ? { status: 'CLOSED', closedAt: daysAgo(55) }
          : { status: 'DRAFT', publishedAt: null },
    });
  }

  const matches = await prisma.candidateMatch.findMany({
    select: { overallScore: true },
    where: { application: { job: { organizationId: organization.id } } },
  });
  log(
    `✓ ${matches.length} match scores (average ${Math.round(matches.reduce((s, m) => s + m.overallScore, 0) / Math.max(1, matches.length))})`,
  );
  log('');
  log('Demo accounts (development only):');
  log(`  Recruiter:       ${STAFF[0]!.email}`);
  log(`  Hiring manager:  ${STAFF[2]!.email}`);
  log(`  Candidate:       ${CANDIDATES[0]!.email}`);
  log(`  Password:        ${password}`);

  await container.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
