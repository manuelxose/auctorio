import { test, expect, type APIRequestContext } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const WORKSPACE = process.env.E2E_WORKSPACE || '';

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();

  api = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL || 'https://auctorio.com',
  });

  const login = await api.post('/studio/api/auth/login/password', {
    data: { email: EMAIL, password: PASSWORD, workspaceId: WORKSPACE || null },
  });
  expect(login.status()).toBe(200);
  const session = await login.json();
  expect(session.user.email).toBe(EMAIL);
});

test.afterAll(async () => {
  await api?.dispose();
});

test('Studio: session, project creation and detail workbench render', async ({ browser }) => {
  // Reuse the authenticated storage state through the API context.
  const cookies = await api.storageState();

  const list = await api.get('/studio/api/backend/v2/sites?page=1&pageSize=50');
  expect(list.status()).toBe(200);
  const sites = await list.json();
  const guiatvSite = sites.items.find((site: { key: string }) => site.key === 'guiatv-editorial');
  expect(guiatvSite, 'guiatv-editorial site must exist').toBeTruthy();

  const created = await api.post('/studio/api/backend/v2/projects', {
    data: {
      siteId: guiatvSite.id,
      title: `E2E acceptance project ${Date.now()}`,
      brief:
        'Articulo de prueba E2E generado por el suite de aceptacion de Auctorio. Breve guia editorial sobre plataformas de streaming deportivo en Espana.',
      goal: 'article',
      primaryLanguage: 'es',
    },
  });
  expect(created.status()).toBe(201);
  const project = await created.json();
  expect(project.id).toBeTruthy();

  const detail = await api.get(`/studio/api/backend/v2/projects/${project.id}`);
  expect(detail.status()).toBe(200);
  const projectDetail = await detail.json();
  expect(projectDetail.reviewGate.stage).toBe('awaiting_generation');

  // Navigate the SSR Studio with the session cookie and verify the workbench renders.
  const context = await browser.newContext();
  await context.addCookies(
    cookies.cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain,
      path: cookie.path,
    })),
  );

  const page = await context.newPage();
  await page.goto(`/studio/projects/${project.id}`);
  await expect(page.getByText('Generate text')).toBeVisible();
  await expect(page.getByText('Generate image')).toBeVisible();
  await expect(page.getByText(project.title).first()).toBeVisible();
  await expect(page.getByText('awaiting generation', { exact: false }).first()).toBeVisible();

  // Projects collection must list the new project.
  await page.goto('/studio/projects');
  await expect(page.getByText(project.title).first()).toBeVisible();

  await context.close();
});
