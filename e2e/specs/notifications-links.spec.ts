import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'https://auctorio.com';

test.beforeAll(async () => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

test('notification action links navigate with intact query strings (no encoded %3F 404s)', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();

  const login = await context.request.post('/studio/api/auth/login/password', {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  await page.goto(`${BASE}/studio/notifications`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3_000);

  const hasNotifications = await page.locator('.au-notification').count();
  if (hasNotifications === 0) {
    // Fresh/empty inbox: the empty state must render without errors.
    expect(await page.locator('.au-empty, app-empty-state').count()).toBeGreaterThan(0);
    await context.close();
    return;
  }

  const hasActionLink = await page.locator('.au-notification a.au-link').count();
  if (hasActionLink > 0) {
    await page.locator('.au-notification a.au-link').first().click();
    await page.waitForTimeout(2_500);
    // The action URL must land on a real studio route, never the public 404.
    expect(page.url()).toContain('/studio/');
    expect(page.url()).not.toContain('%3F');
    expect(await page.title()).not.toContain('Page not found');
  }

  await context.close();
});

test('saved editorial plans render as one expandable table', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();

  const login = await context.request.post('/studio/api/auth/login/password', {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  await page.goto(`${BASE}/studio/editorial-plan`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3_000);

  const rows = await page.locator('.au-plan-row').count();
  if (rows === 0) {
    // Fresh state after a content reset: the empty state must render.
    expect(await page.locator('.au-empty, app-empty-state').count()).toBeGreaterThan(0);
    await context.close();
    return;
  }

  // Clicking a plan expands its rows in place.
  await page.locator('.au-plan-row').first().click();
  await page.waitForSelector('.au-plan-detail-row .au-table', { timeout: 15_000 });
  const expanded = await page.locator('.au-plan-detail-row').count();
  expect(expanded).toBeGreaterThan(0);

  // The expanded detail contains the summary and the row table.
  await page.waitForSelector('.au-plan-summary', { timeout: 10_000 });
  const rowTables = await page.locator('.au-plan-detail-row .au-table tbody tr').count();
  expect(rowTables).toBeGreaterThan(0);

  await context.close();
});
