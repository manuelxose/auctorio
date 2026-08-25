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
  await page.waitForSelector('.au-notification', { timeout: 20_000 });
  await page.waitForTimeout(1_200);

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

test('saved editorial plans render as cards with row counts', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();

  const login = await context.request.post('/studio/api/auth/login/password', {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  await page.goto(`${BASE}/studio/editorial-plan`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.au-plan-card', { timeout: 20_000 });
  await page.waitForTimeout(1_200);

  const cards = await page.locator('.au-plan-card').count();
  expect(cards).toBeGreaterThan(0);
  const firstCardText = await page.locator('.au-plan-card').first().innerText();
  expect(firstCardText).toContain('rows');

  // Opening a plan shows the summary + card view.
  await page.locator('.au-plan-card').first().click();
  await page.waitForSelector('.au-plan-summary', { timeout: 15_000 });
  const briefCards = await page.locator('.au-brief-card').count();
  expect(briefCards).toBeGreaterThan(0);

  await context.close();
});
