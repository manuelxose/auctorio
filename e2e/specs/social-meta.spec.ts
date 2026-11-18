import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

test.beforeAll(() => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

test('instagram & facebook: save settings, approve a draft, see it scheduled', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
  expect((await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } })).status()).toBe(200);
  const page = await context.newPage();
  await page.goto('/studio/settings/social', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Social', level: 1 })).toBeVisible();
  const channel = page.getByLabel('Canal', { exact: true });
  const xPosts = page.waitForResponse((r) => new URL(r.url()).searchParams.get('channel') === 'x');
  await channel.selectOption('x');
  expect((await xPosts).status()).toBe(200);
  await channel.selectOption('instagram');

  await page.getByRole('radio', { name: /Aprobar antes/ }).click();
  await page.getByLabel('Hora', { exact: true }).selectOption('18:30');
  const saved = page.waitForResponse((r) => r.url().includes('/social-settings') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Guardar ajustes' }).click();
  expect((await saved).status()).toBe(200);

  const draft = page.locator('article.soc-post').filter({ has: page.getByRole('button', { name: 'Aprobar' }) }).first();
  if ((await draft.count()) === 0) {
    // No draft yet: generate one from the newest article (uses the site's text model; keep it at Sonnet medium).
    const projects = await context.request.get('/studio/api/backend/v2/projects?pageSize=1');
    expect(projects.status()).toBe(200);
    const projectId = ((await projects.json()) as { items: Array<{ id: string }> }).items[0]?.id;
    expect(projectId, 'the test site needs at least one article').toBeTruthy();
    const gen = await context.request.post(`/studio/api/backend/v2/projects/${projectId}/social/generate`, { data: { channels: ['instagram'] } });
    expect(gen.status()).toBe(202);
    await expect(async () => {
      await page.reload({ waitUntil: 'networkidle' });
      expect(await draft.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 240_000, intervals: [10_000] });
  }
  const id = await draft.getAttribute('data-post-id');
  await draft.getByRole('button', { name: 'Aprobar' }).click();
  // Programado with a connected Instagram account; otherwise the page says to connect one.
  await expect(page.locator(`article[data-post-id="${id}"] [data-testid="post-state"]`)).toHaveText(/Programado|conecta una cuenta/);
  await context.close();
});
