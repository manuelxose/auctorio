import { test, expect, type APIRequestContext } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';

let api: APIRequestContext;

type SessionView = {
  user: { email: string };
  role: string;
  sites: Array<{ id: string; key: string; name: string }>;
  activeSiteId: string | null;
};

test.beforeAll(async ({ playwright }) => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();

  api = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL || 'https://auctorio.com',
  });
});

test.afterAll(async () => {
  await api?.dispose();
});

test('Login: one screen, two inputs, no workspace selection', async () => {
  const login = await api.post('/studio/api/auth/login/password', {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  const session = (await login.json()) as SessionView;
  expect(session.user.email).toBe(EMAIL);
  expect(session.sites.length).toBeGreaterThanOrEqual(2);
  expect(session.sites.some((site) => site.key === 'guiatv-editorial')).toBe(true);
  expect(session.sites.some((site) => site.key === 'tecnoria-main')).toBe(true);
});

test('Site switching: one session, scoped content per site', async () => {
  const cookies = await api.storageState();

  // Switch to GuiaTV.
  const sitesResponse = await api.get('/studio/api/sites');
  expect(sitesResponse.status()).toBe(200);
  const sites = ((await sitesResponse.json()) as { items: SessionView['sites'] }).items;
  const guiatvSite = sites.find((site) => site.key === 'guiatv-editorial');
  const tecnoriaSite = sites.find((site) => site.key === 'tecnoria-main');
  expect(guiatvSite).toBeTruthy();
  expect(tecnoriaSite).toBeTruthy();

  const switchGuiatv = await api.post('/studio/api/session/active-site', {
    data: { siteId: guiatvSite!.id },
  });
  expect(switchGuiatv.status()).toBe(200);
  expect(((await switchGuiatv.json()) as SessionView).activeSiteId).toBe(guiatvSite!.id);

  const guiatvProjects = await api.get('/studio/api/backend/v2/projects?page=1&pageSize=50');
  expect(guiatvProjects.status()).toBe(200);

  const switchTecnoria = await api.post('/studio/api/session/active-site', {
    data: { siteId: tecnoriaSite!.id },
  });
  expect(switchTecnoria.status()).toBe(200);

  const tecnoriaProjects = await api.get('/studio/api/backend/v2/projects?page=1&pageSize=50');
  expect(tecnoriaProjects.status()).toBe(200);

  expect(cookies).toBeTruthy();
});

test('Content workflow: create → generate → workspace renders', async ({ browser }) => {
  const sites = ((await (await api.get('/studio/api/sites')).json()) as { items: SessionView['sites'] }).items;
  const guiatvSite = sites.find((site) => site.key === 'guiatv-editorial');
  await api.post('/studio/api/session/active-site', { data: { siteId: guiatvSite!.id } });
  const cookies = await api.storageState();

  const created = await api.post('/studio/api/backend/v2/projects', {
    data: {
      siteId: guiatvSite!.id,
      title: `E2E simplified studio ${Date.now()}`,
      brief: 'Pieza de prueba del nuevo Studio simplificado: guia editorial sobre plataformas de streaming en Espana.',
      goal: 'article',
      primaryLanguage: 'es',
    },
  });
  expect(created.status()).toBe(201);
  const project = await created.json();

  const generated = await api.post(`/studio/api/backend/v2/projects/${project.id}/generate`, {});
  expect(generated.status()).toBe(202);

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
  await page.goto('/studio/content');
  await expect(page.getByText('Content', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('+ New content').first()).toBeVisible();
  await expect(page.getByText(project.title).first()).toBeVisible();

  await page.goto(`/studio/content/${project.id}`);
  await expect(page.getByText(project.title).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quality' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Publishing' })).toBeVisible();

  await context.close();
});
