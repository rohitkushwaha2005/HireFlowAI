import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Recruiter workflows not covered by the primary journey: self-service sign-up with organization
 * creation and logout, drag-and-drop pipeline moves, interview scheduling, copilot and analytics.
 * Runs against the seeded demo organization.
 */

const PASSWORD = 'HireFlowDemo!2026';
const run = Date.now().toString(36);

async function signInAsDemoRecruiter(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('recruiter@demo.hireflow.local');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test('a new recruiter signs up with a company, sees an empty workspace and signs out', async ({
  page,
}) => {
  await page.goto('/register?role=recruiter');
  await page.getByLabel('First name').fill('Quinn');
  await page.getByLabel('Last name').fill('Hiring');
  await page.getByLabel('Company name').fill(`Acme ${run}`);
  await page.getByLabel('Work email').fill(`quinn.${run}@e2e.hireflow.local`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(`Acme ${run}`).first()).toBeVisible();
  await expect(page.getByText('Please verify your email address')).toBeVisible();

  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await expect(page.getByText('No jobs yet')).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  // Protected pages now redirect to sign-in.
  await page.goto('/app/jobs');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fjobs/);
});

/** Drags a card by its handle into a column using a real pointer gesture (dnd-kit pointer sensor). */
async function dragCard(page: Page, handle: Locator, column: 'Applied' | 'Screening') {
  const target = page.getByRole('region', { name: new RegExp(`^${column}`) });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByText(`Moved to ${column}`).last()).toBeVisible();
}

test('recruiter drags a candidate across the pipeline and the move persists', async ({ page }) => {
  await signInAsDemoRecruiter(page);
  await page.goto('/app/applications');
  const column = (name: string) => page.getByRole('region', { name: new RegExp(`^${name}`) });
  await expect(column('Applied')).toBeVisible();

  // Work from whichever early column has a card, move it to the other, then restore it,
  // so repeated runs leave the demo data unchanged.
  const source =
    (await column('Applied')
      .getByRole('button', { name: /^Drag / })
      .count()) > 0
      ? 'Applied'
      : 'Screening';
  const target = source === 'Applied' ? 'Screening' : 'Applied';
  const handle = column(source)
    .getByRole('button', { name: /^Drag / })
    .first();
  const candidate = (await handle.getAttribute('aria-label'))!.replace('Drag ', '');

  const inTarget = () => column(target).getByRole('button', { name: `Drag ${candidate}` });
  const before = await inTarget().count();

  await dragCard(page, handle, target);
  await expect(inTarget()).toHaveCount(before + 1);
  await page.reload();
  await expect(inTarget()).toHaveCount(before + 1);

  await dragCard(page, inTarget().first(), source);
  await expect(inTarget()).toHaveCount(before);
});

test('recruiter schedules an interview, uses the copilot and views analytics', async ({ page }) => {
  await signInAsDemoRecruiter(page);

  // Schedule an interview from the application page.
  await page.goto('/app/applications?view=list&sort=score');
  await page.getByRole('link', { name: 'Jordan Rivera' }).first().click();
  await page.getByRole('tab', { name: 'Interviews' }).click();
  await page.getByRole('button', { name: 'Schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Schedule interview' });
  await dialog.getByLabel('Meeting link').fill('https://meet.example.com/e2e');
  await dialog.getByRole('button', { name: 'Schedule' }).click();
  await expect(
    page.getByText('Interview scheduled — the candidate has been notified'),
  ).toBeVisible();
  await expect(page.getByText('https://meet.example.com/e2e').first()).toBeVisible();

  // Copilot answers from real data and cites candidates.
  await page.goto('/app/copilot');
  await page
    .getByLabel('Ask the copilot')
    .fill('Which candidates have strong React and Node.js experience?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Grounded in/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('link', { name: /Liam O'Connor/ })).toBeVisible();

  // Analytics renders SQL-backed metrics, with an accessible table view.
  await page.goto('/app/analytics');
  await expect(page.getByRole('heading', { name: 'Hiring funnel' })).toBeVisible();
  await page.getByRole('button', { name: 'Show Top candidate skills as table' }).click();
  await expect(page.getByRole('columnheader', { name: 'Skill' })).toBeVisible();
});
