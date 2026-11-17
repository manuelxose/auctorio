import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

test.beforeAll(async () => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

test('Sources: active/suggestions/evidence first, technical controls under Technical settings', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);

  await page.goto('/studio/sources', { waitUntil: 'networkidle' });
  // Sections live in the sidebar (a drawer on phones, a strip above the page on the icon rail).
  const openSection = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation' });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('link', { name, exact: true }).click();
  };
  await expect(page.getByRole('list', { name: 'Sources sections' }).getByRole('link')).toHaveText(['Active sources', 'Suggested for you', 'Add a source', 'Evidence', 'Technical settings']);
  await page.screenshot({ path: 'test-results/sources-active.png', fullPage: true });

  await openSection('Evidence');
  await expect(page.getByRole('heading', { name: 'Recent evidence' })).toBeVisible();
  await page.screenshot({ path: 'test-results/sources-evidence.png', fullPage: true });

  // Provider diagnostics and blocked domains live only under Technical settings.
  await expect(page.getByRole('heading', { name: 'Enrichment providers' })).toHaveCount(0);
  await openSection('Technical settings');
  await expect(page.getByRole('heading', { name: 'Enrichment providers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blocked sources' })).toBeVisible();

  // Responsive: load fresh at each width (the copilot dock only auto-opens on desktop widths).
  for (const [width, height] of [[1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/studio/sources', { waitUntil: 'networkidle' });
    await openSection('Technical settings');
    await expect(page.getByRole('heading', { name: 'Enrichment providers' })).toBeVisible();
    if (width < 861) await expect(page.locator('#studio-copilot')).toHaveCount(0);
    await page.screenshot({ path: `test-results/sources-advanced-${width}.png`, fullPage: true });
  }
  await context.close();
});
