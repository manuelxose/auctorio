import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

test.beforeAll(async () => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

async function signIn(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ baseURL: BASE });
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);
  return { context, page: await context.newPage() };
}

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Source sections' }).getByRole('button', { name });

test('accept a suggestion, fetch it, and see it as evidence', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await signIn(browser);
  await page.goto('/studio/sources', { waitUntil: 'networkidle' });
  const activeCount = async () => Number((await page.getByRole('heading', { name: /Registro de fuentes/ }).innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
  const before = await activeCount();

  await tab(page, 'Suggestions').click();
  const accept = page.getByRole('button', { name: 'Accept', exact: true }).first();
  if (!(await accept.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Discover sources/ }).click();
    await expect(accept).toBeVisible({ timeout: 150_000 });
  }
  await accept.click();

  await tab(page, 'Active sources').click();
  await expect.poll(activeCount).toBe(before + 1);
  // Fetch the newest-accepted source from its details and wait for a success message.
  await page.getByRole('button', { name: 'Detalle' }).first().click();
  await page.getByRole('button', { name: 'Fetch now' }).first().click();
  await expect(page.locator('.au-toast--success').first()).toBeVisible({ timeout: 60_000 });

  await tab(page, 'Evidence').click();
  await expect(page.getByRole('heading', { name: 'Rastro de procedencia' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="reg-ev"] li').first()).toBeVisible({ timeout: 30_000 });
  await context.close();
});

test('competitors: a suggested competitor can be accepted and another rejected', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await signIn(browser);
  await page.goto('/studio/competitors', { waitUntil: 'networkidle' });
  const accept = page.getByRole('button', { name: 'Aceptar', exact: true });
  if ((await accept.count()) === 0) {
    await page.getByRole('button', { name: /Descubrir/ }).click();
    await expect(page.getByRole('button', { name: /Descubrir/ })).toBeEnabled({ timeout: 200_000 });
  }
  test.skip((await accept.count()) === 0, 'discovery produced no suggested competitor for this site');
  // Link-only footer/chat hosts such as wa.me must never be shortlisted.
  await expect(page.getByText('wa.me')).toHaveCount(0);
  const suggested = await accept.count();
  if (suggested > 1) {
    await page.getByRole('button', { name: 'Rechazar', exact: true }).first().click();
    await expect(accept).toHaveCount(suggested - 1);
  }
  await accept.first().click();
  await expect(page.getByRole('button', { name: 'Pausar' }).first()).toBeVisible();
  await context.close();
});
