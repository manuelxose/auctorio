import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

test('STUDIO-06: plan page keeps proposals separate from the Calendar and stays usable at 1440/1024/390', async ({ browser }) => {
  expect(EMAIL && PASSWORD, 'E2E_EMAIL and E2E_PASSWORD required').toBeTruthy();
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/studio/editorial-plan', { waitUntil: 'networkidle' });
    await expect(page.getByText('Dates and publishing live in Calendar.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open calendar' })).toBeVisible();
    await page.screenshot({ path: `test-results/plan-${width}.png`, fullPage: true });
  }

  // Opening the generator is a pure UI action: it must not create plans or publications.
  const before = await (await context.request.get('/studio/api/v2/editorial-plans')).text();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studio/editorial-plan?new=1', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'test-results/plan-generator-1440.png', fullPage: true });
  const after = await (await context.request.get('/studio/api/v2/editorial-plans')).text();
  expect(after).toBe(before);
  expect(errors).toEqual([]);
});
