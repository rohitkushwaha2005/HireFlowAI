import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * The primary product journey, through the real UI:
 * recruiter creates & publishes a job with AI analysis → a new candidate applies with a resume →
 * the resume is parsed and matched in the background → the recruiter reviews the match,
 * shortlists the candidate and generates interview questions.
 */

const PASSWORD = 'HireFlowDemo!2026';
const RESUME = fileURLToPath(new URL('./fixtures/resume.pdf', import.meta.url));
const run = Date.now().toString(36);
const JOB_TITLE = `Full Stack Developer ${run}`;
const CANDIDATE = { first: 'Alex', last: `Morgan${run}`, email: `alex.${run}@e2e.hireflow.local` };

const DESCRIPTION = `We are hiring a Full Stack Developer to build real-time hiring tools.

Responsibilities:
- Build React and TypeScript user interfaces
- Design Node.js REST APIs backed by PostgreSQL

Requirements:
- 3+ years of professional software development experience
- React, TypeScript, Node.js and Express
- PostgreSQL

Nice to have:
- AWS and Docker`;

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('recruiter publishes a job, candidate applies, recruiter reviews and shortlists', async ({
  browser,
}) => {
  // ── Recruiter creates and publishes a job with AI analysis ──
  const recruiterContext = await browser.newContext();
  const recruiter = await recruiterContext.newPage();
  await signIn(recruiter, 'recruiter@demo.hireflow.local');
  await expect(recruiter).toHaveURL(/\/app$/);
  await expect(recruiter.getByRole('heading', { name: /Welcome back/ })).toBeVisible();

  await recruiter.getByRole('link', { name: 'New job' }).click();
  await recruiter.getByLabel('Job title').fill(JOB_TITLE);
  await recruiter.getByLabel('Job description').fill(DESCRIPTION);
  await recruiter.getByRole('button', { name: /Analyze with AI/ }).click();
  await expect(recruiter.getByText('AI analysis')).toBeVisible();
  // AI-extracted requirements are editable before publishing.
  await expect(recruiter.getByLabel('Skill').first()).not.toHaveValue('');
  await recruiter.getByRole('button', { name: 'Create & publish' }).click();
  await expect(recruiter).toHaveURL(/\/app\/jobs\/[\w-]+$/);
  await expect(recruiter.locator('h1').getByText('Published', { exact: true })).toBeVisible();
  const jobUrl = recruiter.url();

  // ── Candidate finds the job on the public board, registers and applies ──
  const candidateContext = await browser.newContext();
  const candidate = await candidateContext.newPage();
  await candidate.goto('/jobs');
  await candidate.getByLabel('Search').fill(JOB_TITLE);
  await candidate.getByRole('link', { name: new RegExp(JOB_TITLE) }).click();
  await candidate.getByRole('link', { name: 'Apply now' }).click();

  await expect(candidate).toHaveURL(/\/register/);
  await candidate.getByLabel('First name').fill(CANDIDATE.first);
  await candidate.getByLabel('Last name').fill(CANDIDATE.last);
  await candidate.getByLabel('Work email').fill(CANDIDATE.email);
  await candidate.getByLabel('Password').fill(PASSWORD);
  await candidate.getByRole('button', { name: 'Create account' }).click();
  await expect(candidate).toHaveURL(/\/portal\/jobs\//);

  await candidate.getByLabel('Upload resume PDF').setInputFiles(RESUME);
  await expect(candidate.getByText('Parsed', { exact: true })).toBeVisible({ timeout: 90_000 });
  await candidate.getByRole('button', { name: 'Submit application' }).click();
  await expect(candidate.getByText('You applied to this job')).toBeVisible();

  // The parsed resume populated the candidate profile.
  await candidate.goto('/portal/profile');
  await expect(candidate.getByLabel('Headline')).toHaveValue('Full Stack Engineer');

  // ── Recruiter reviews the ranked application and its explainable match ──
  await recruiter.goto(`${jobUrl}?tab=applications`);
  await recruiter.getByRole('link', { name: `${CANDIDATE.first} ${CANDIDATE.last}` }).click();
  await expect(recruiter.getByText('Why this match?')).toBeVisible({ timeout: 90_000 });
  await expect(recruiter.getByText('Matched skills')).toBeVisible();
  await expect(recruiter.getByText(/Meets \d+ of \d+ required skills/)).toBeVisible();

  // Shortlist (status change is audited and reflected immediately).
  await recruiter.getByRole('button', { name: 'Shortlist' }).click();
  await expect(recruiter.getByText('Shortlisted', { exact: true }).first()).toBeVisible();

  // Generate candidate-specific interview questions.
  await recruiter.getByRole('tab', { name: 'Interviews' }).click();
  await recruiter.getByRole('button', { name: 'Generate' }).click();
  await expect(recruiter.getByText(/Generated \d+ interview questions/)).toBeVisible();
  await expect(recruiter.locator('ol > li').first()).toBeVisible();

  // Status history shows the move.
  await recruiter.getByRole('tab', { name: 'Notes & history' }).click();
  await expect(recruiter.getByText('Applied → ')).toBeVisible();

  // The candidate sees the new status.
  await candidate.goto('/portal/applications');
  await expect(candidate.getByText('Shortlisted')).toBeVisible();

  await recruiterContext.close();
  await candidateContext.close();
});
