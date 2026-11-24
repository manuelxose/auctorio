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

test('system notification inbox preserves category, read modes and preferences on mobile', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 375, height: 812 } });
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const page = await context.newPage();
  let enabled = true;
  let archived = false;
  let read = false;
  const item = {
    id: 'notification-fixture', category: 'system', severity: 'warning', title: 'Aviso de ejemplo',
    message: 'Comprueba la actividad del sitio.', createdAt: '2026-11-20T09:00:00Z',
    actionUrl: '/studio/activity?status=failed',
  };
  await page.route(/\/backend\/v2\/notifications(?:[/?]|$)/, async (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (pathname.endsWith('/preferences')) {
      if (request.method() === 'GET') return route.fulfill({ json: { preferences: [{ category: 'system', enabled }] } });
      enabled = request.postDataJSON().enabled;
      return route.fulfill({ json: { category: 'system', enabled } });
    }
    if (pathname.endsWith('/archive')) archived = request.postDataJSON().archived;
    if (pathname.endsWith('/read')) read = request.postDataJSON().read;
    const items = archived === (searchParams.get('archived') === 'true') && !(read && searchParams.get('unreadOnly') === 'true')
      ? [{ ...item, archivedAt: archived ? item.createdAt : null, readAt: read ? item.createdAt : null }]
      : [];
    await route.fulfill({ json: { items, total: items.length, unread: read || archived ? 0 : 1, counts: { system: archived ? 0 : 1 } } });
  });

  await page.goto('/studio/notifications?category=system');
  const inbox = page.getByRole('region', { name: 'Bandeja de entrada' });
  await expect(inbox.getByRole('button', { name: /^Sistema/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(inbox.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute('href', '/studio/activity?status=failed');

  await inbox.getByRole('button', { name: 'Sin leer', exact: true }).click();
  await inbox.getByRole('button', { name: 'Marcar como leída', exact: true }).click();
  await expect(inbox.getByText('No hay notificaciones sin leer')).toBeVisible();

  await inbox.getByRole('button', { name: 'Todas', exact: true }).click();
  await inbox.getByRole('button', { name: 'Archivar', exact: true }).click();
  await inbox.getByRole('button', { name: 'Archivadas' }).click();
  await expect(inbox.getByRole('heading', { name: item.title })).toBeVisible();
  await inbox.getByRole('button', { name: 'Restaurar' }).click();
  await expect(inbox.getByText('No hay notificaciones archivadas')).toBeVisible();

  const preference = page.getByRole('region', { name: 'Preferencias' }).getByRole('switch', { name: 'Sistema' });
  await expect(preference).toBeChecked();
  await preference.click();
  await expect(preference).not.toBeChecked();
  expect(enabled).toBe(false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await context.close();
});

test('saved editorial plans render as one expandable table', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();

  const login = await context.request.post('/studio/api/auth/login/password', {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  await page.goto(`${BASE}/studio/plan`, { waitUntil: 'networkidle' });
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
