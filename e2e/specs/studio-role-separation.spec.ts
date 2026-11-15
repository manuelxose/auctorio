import { test, expect, type Browser, type Page } from '@playwright/test';

// STUDIO-10: ordinary members do not see system internals; admins keep them.
// The editor view rewrites only the `role` of /session/me (UI check). The API side is
// covered by tests/studio-rbac-matrix.test.ts, which signs real member permissions.
const EMAIL = process.env.E2E_EMAIL || process.env.QA_STUDIO_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || process.env.QA_STUDIO_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';
const SHOTS = process.env.E2E_SHOTS_DIR || '';

async function signIn(browser: Browser, width: number, height: number, role?: 'editor') {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);
  const page = await context.newPage();
  if (role) {
    await page.route('**/session/me', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, role, sites: body.sites.map((site: object) => ({ ...site, role })) } });
    });
  }
  return { context, page };
}

async function settingsTools(page: Page) {
  await page.goto('/studio/settings/sites', { waitUntil: 'networkidle' });
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click(); // phones fold the sidebar into a drawer
  return page.getByRole('navigation', { name: 'Settings tools' }).getByRole('link');
}

test.beforeAll(() => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

test('admin keeps team, roles and System health; autopilot saves without opening advanced', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await expect(await settingsTools(page)).toContainText(['People', 'Roles', 'System health']);

  await page.goto('/studio/automation', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Save automation policy' })).toBeVisible();
  await expect(page.getByText('Workers & operational health')).toHaveCount(0);
  await expect(page.getByText('Recover stuck automatic content')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-automation-1440.png`, fullPage: true });

  await page.goto('/studio/operations', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/studio\/operations/);
  await expect(page.getByRole('tab', { name: 'Workers' })).toBeVisible();
  await context.close();
});

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]]) {
  test(`editor at ${width}px: no internals, read-only autopilot, admin routes redirect`, async ({ browser }) => {
    const { context, page } = await signIn(browser, width, height, 'editor');
    const tools = await settingsTools(page);
    // The QA account is also a platform admin, so the "All workspaces" links may follow.
    await expect(tools.first()).toHaveText('Sites');
    await expect(tools).toContainText(['Sites', 'Connections', 'Web discovery', 'Autopilot', 'Assistant tools']);
    for (const hidden of ['People', 'Roles', 'System health']) await expect(tools.filter({ hasText: hidden })).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-settings-${width}.png` });

    await page.goto('/studio/automation', { waitUntil: 'networkidle' });
    await expect(page.getByText('Only workspace admins can change autopilot.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save automation policy' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Pause automation|Resume automation/ })).toHaveCount(0);
    await expect(page.getByText('Recover stuck automatic content')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-automation-${width}.png`, fullPage: true });

    for (const url of ['/studio/operations', '/studio/settings/team', '/studio/settings/roles']) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await expect(page, url).toHaveURL(/\/studio\/overview/);
    }
    await context.close();
  });
}
