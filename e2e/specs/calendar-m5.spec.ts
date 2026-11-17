import { test, expect, type Browser } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';
const EVIDENCE = 'docs/studio-rebuild/evidence/m5';

async function signIn(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);
  return { context, page: await context.newPage() };
}

test.beforeAll(() => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

test('old review route lands on the calendar filtered by Review', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/editorial-engine', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/studio\/calendar\?chip=review/);
  await expect(page.getByRole('group', { name: 'Filter by state' }).getByRole('button', { name: /^Review/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/studio/editorial-plan', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/studio\/calendar$/);
  await context.close();
});

test('add keywords, then give a queued article instructions', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/calendar', { waitUntil: 'networkidle' });
  await expect(page.getByRole('tab', { name: '30 days' }).or(page.getByRole('button', { name: '30 days' }))).toHaveClass(/is-active/);

  const keyword = `zarzuela documental ${Date.now()}`;
  await page.getByRole('button', { name: 'Add keywords' }).click();
  await page.getByLabel('Keywords').fill(`${keyword}\n${keyword}\nimplantes dentales baratos`);
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  await expect(page.getByRole('status').filter({ hasText: /1 added/ })).toBeVisible();
  await expect(page.getByText(/repeated in the list/)).toBeVisible();
  await expect(page.getByText(/off-topic for this site/)).toBeVisible();

  await page.getByRole('button', { name: /^Queued/ }).click();
  await page.screenshot({ path: `${EVIDENCE}/calendar-1440.png`, fullPage: true });
  await page.getByRole('button', { name: 'List' }).click();
  const card = page.getByRole('group', { name: new RegExp(keyword.replace(/^./, (c) => c.toUpperCase()), 'i') });
  await card.getByRole('button', { name: 'Instructions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Instructions for the writer' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Instructions').fill('Compare at least three platforms.');
  await dialog.getByLabel(/Reference URL/).fill('https://example.com/guide');
  await page.screenshot({ path: `${EVIDENCE}/instructions-1440.png` });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // Reopen: the saved values come back.
  await card.getByRole('button', { name: 'Instructions' }).click();
  await expect(dialog.getByLabel('Instructions')).toHaveValue('Compare at least three platforms.');
  await expect(dialog.getByLabel(/Reference URL/)).toHaveValue('https://example.com/guide');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await context.close();
});

test('phone: calendar chips and 30-day grid fit', async ({ browser }) => {
  const { context, page } = await signIn(browser, 390, 844);
  await page.goto('/studio/calendar', { waitUntil: 'networkidle' });
  await expect(page.getByRole('group', { name: 'Filter by state' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${EVIDENCE}/calendar-390.png` });
  await context.close();
});
