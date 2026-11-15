import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

test.beforeAll(async () => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

test('Sources: active/suggestions/evidence first, technical controls under Advanced', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);

  await page.goto('/studio/sources', { waitUntil: 'networkidle' });
  const nav = page.getByRole('navigation', { name: 'Source sections' });
  await expect(nav.getByRole('button')).toHaveText(['Active sources', 'Suggestions', 'Evidence', 'Add', 'Advanced']);
  await page.screenshot({ path: 'test-results/sources-active.png', fullPage: true });

  await nav.getByRole('button', { name: 'Evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Recent evidence' })).toBeVisible();
  await page.screenshot({ path: 'test-results/sources-evidence.png', fullPage: true });

  // Provider diagnostics and blocked domains live only under Advanced.
  await expect(page.getByRole('heading', { name: 'Enrichment providers' })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Advanced' }).click();
  await expect(page.getByRole('heading', { name: 'Enrichment providers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blocked sources' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/sources-advanced-390.png', fullPage: true });
  await context.close();
});
