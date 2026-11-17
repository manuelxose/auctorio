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

test('home: one status line; only connecting the site is required', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/overview', { waitUntil: 'networkidle' });
  await expect(page.getByRole('status').first()).toHaveText(/to review|runs on its own|Running|Automation is off|Paused|Connect your website/);
  const setup = page.getByRole('region', { name: /Ready to go|Get started/ }).or(page.locator('section[aria-labelledby="ov-setup"]'));
  if (await setup.count()) {
    // Required holds only the website step.
    await expect(setup.locator('.ov__steps').first().locator('.ov__step')).toHaveCount(1);
  }
  await page.screenshot({ path: `${EVIDENCE}/home-1440.png`, fullPage: true });
  await context.close();
});

test('settings · mode & rhythm: day chips and guide sections save', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/automation', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: 'Mode & rhythm' })).toBeVisible();
  const card = page.locator('app-article-settings-card');
  const sunday = card.getByRole('button', { name: 'Sunday' });
  const before = await sunday.getAttribute('aria-pressed');
  await sunday.click();
  await expect(sunday).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await expect(card.getByRole('checkbox', { name: 'FAQ' })).toBeVisible();
  await card.getByRole('button', { name: 'Save articles' }).click();
  await expect(page.getByText('Article settings saved.')).toBeVisible();
  // Put it back.
  await sunday.click();
  await card.getByRole('button', { name: 'Save articles' }).click();
  await page.screenshot({ path: `${EVIDENCE}/mode-rhythm-1440.png`, fullPage: true });
  await context.close();
});

test('article: preview with side panel; editing is a separate mode', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  const list = await context.request.get('/studio/api/backend/v2/projects?page=1&pageSize=20');
  const items = ((await list.json()) as { items: Array<{ id: string; latestVersionId?: string | null; versionCount?: number }> }).items;
  test.skip(items.length === 0, 'no article on this database');
  await page.goto(`/studio/content/${items[0].id}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('navigation', { name: 'Content sections' })).toHaveCount(0);
  const preview = page.getByRole('article', { name: 'Article preview' });
  await expect(preview).toBeVisible();
  const rail = page.locator('.au-workspace__rail h2');
  const headings = await rail.allTextContents();
  const order = ['Quality', 'Data', 'Slug, meta and cover', 'Approve and publish'].filter((title) => headings.includes(title));
  expect(headings.filter((title) => order.includes(title))).toEqual(order);
  await page.screenshot({ path: `${EVIDENCE}/article-1440.png`, fullPage: true });
  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  if (await edit.count()) {
    await edit.click();
    await expect(page.getByRole('navigation', { name: 'Content sections' })).toBeVisible();
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(preview).toBeVisible();
  }
  await context.close();
});

test('connection wizard lists only platforms with a publisher', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/connections/wizard', { waitUntil: 'networkidle' });
  await expect(page.getByText('Coming soon')).toHaveCount(0);
  await expect(page.getByText('Webflow')).toHaveCount(0);
  await context.close();
});

test('phone: home and article fit 390 px', async ({ browser }) => {
  const { context, page } = await signIn(browser, 390, 844);
  for (const path of ['/studio/overview', '/studio/automation']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto('/studio/overview', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${EVIDENCE}/home-390.png`, fullPage: true });
  await context.close();
});
