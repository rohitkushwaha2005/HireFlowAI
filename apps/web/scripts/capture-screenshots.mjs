/**
 * Captures product screenshots from a running local stack (API + web + seeded demo data) into
 * docs/screenshots. Usage:
 *
 *   pnpm db:seed && pnpm dev          # in one terminal
 *   node apps/web/scripts/capture-screenshots.mjs [baseUrl]
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = resolve(import.meta.dirname, '../../../docs/screenshots');
const PASSWORD = process.env.DEMO_PASSWORD ?? 'HireFlowDemo!2026';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const shot = async (page, name) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`✓ ${name}`);
};

async function login(context, email) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(app|portal)/);
  return page;
}

// ── Public ──
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE);
  await shot(page, '01-landing');
  await page.goto(`${BASE}/jobs`);
  await shot(page, '02-job-board');
  await page
    .getByRole('link', { name: /Full Stack Engineer/ })
    .first()
    .click();
  await shot(page, '03-job-detail');
  await context.close();
}

// ── Recruiter ──
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await login(context, 'recruiter@demo.hireflow.local');
  await shot(page, '10-recruiter-overview');
  await page.goto(`${BASE}/app/jobs`);
  await shot(page, '11-jobs');
  await page.goto(`${BASE}/app/jobs/new`);
  await page.getByLabel('Job title').fill('Full Stack Developer');
  await page
    .getByLabel('Job description')
    .fill(
      'We are hiring a Full Stack Developer to build real-time hiring tools.\n\nResponsibilities:\n- Build React and TypeScript interfaces\n- Design Node.js APIs backed by PostgreSQL\n\nRequirements:\n- 3+ years of professional experience\n- React, TypeScript, Node.js and Express\n- PostgreSQL\n\nNice to have:\n- AWS and Docker',
    );
  await page.getByRole('button', { name: /Analyze with AI/ }).click();
  await page.getByText('AI analysis').waitFor();
  await shot(page, '12-job-editor-ai-analysis');
  await page.goto(`${BASE}/app/applications`);
  await shot(page, '13-pipeline-kanban');
  await page.goto(`${BASE}/app/applications?view=list&sort=score`);
  await page.getByRole('link', { name: "Liam O'Connor" }).first().click();
  await page.getByText('Why this match?').waitFor();
  await shot(page, '14-application-match');
  await page.getByRole('tab', { name: 'Interviews' }).click();
  await shot(page, '15-interview-questions');
  await page.goto(
    `${BASE}/app/candidates?q=${encodeURIComponent('React developer with strong backend experience and real-time applications')}`,
  );
  await page.getByText('Ranked by semantic similarity').waitFor();
  await shot(page, '16-semantic-search');
  await page.goto(`${BASE}/app/copilot`);
  await page
    .getByRole('button', {
      name: 'Which candidates have strong React and Node.js experience?',
      exact: true,
    })
    .click();
  await page.getByText(/Grounded in/).waitFor({ timeout: 120_000 });
  await shot(page, '17-copilot');
  await page.goto(`${BASE}/app/analytics`);
  await shot(page, '18-analytics');
  await context.close();
}

// ── Candidate (mobile viewport) ──
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await login(context, 'candidate@demo.hireflow.local');
  await shot(page, '20-candidate-dashboard');
  await page.goto(`${BASE}/portal/profile`);
  await shot(page, '21-candidate-profile');
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await login(mobile, 'candidate@demo.hireflow.local');
  await mpage.goto(`${BASE}/portal/applications`);
  await shot(mpage, '22-candidate-mobile-applications');
  await mobile.close();
}

await browser.close();
