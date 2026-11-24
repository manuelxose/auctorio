import { test, expect, type Browser } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';
const EVIDENCE = 'docs/studio-rebuild/evidence/m5';

async function signIn(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);
  return { context, page: await context.newPage() };
}

test.beforeAll(() => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

test('home: editorial controls and site setup', async ({ browser }, testInfo) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/overview', { waitUntil: 'networkidle' });
  const overview = page.locator('app-overview-page');
  await expect(overview.getByRole('status')).toContainText(/espacio editorial está listo|Conecta tu sitio web/);
  await expect(overview.getByRole('alert')).toHaveCount(0);
  const session = await (await context.request.get('/studio/api/session/me')).json();
  if (session.activeSiteId) {
    const response = await context.request.get('/studio/api/backend/v2/overview', { params: { siteId: session.activeSiteId } });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const verified = data.connections.find((connection: { siteId: string; platform: string; stage: string }) =>
      connection.siteId === session.activeSiteId && connection.platform === 'website' && connection.stage === 'ready');
    if (verified) {
      const destination = overview.getByRole('region', { name: 'Salud de los destinos' }).getByRole('listitem').filter({ hasText: verified.displayName });
      await expect(destination).toContainText('Sitio web · Verificado');
      if (data.siteLogoUrl) {
        await expect(destination.locator('img')).toHaveAttribute('src', data.siteLogoUrl);
        const switcher = page.getByRole('button', { name: /Switch site/ });
        await expect(switcher.locator('img')).toHaveAttribute('src', data.siteLogoUrl);
        await switcher.click();
        await expect(page.getByRole('menuitemradio', { name: new RegExp(verified.displayName) }).locator('img')).toHaveAttribute('src', data.siteLogoUrl);
        await page.keyboard.press('Escape');
      }
    }
  }
  await overview.getByLabel('Período').selectOption('14');
  await expect(overview.getByText('Próximos 14 días')).toBeVisible();
  await overview.getByRole('button', { name: /^Por revisar/ }).click();
  await expect(overview.getByRole('button', { name: 'Aprobaciones' })).toHaveAttribute('aria-pressed', 'true');

  const activity = overview.getByRole('region', { name: 'Así va tu día' });
  const activityDate = activity.locator('[aria-live="polite"]');
  const today = await activityDate.innerText();
  await activity.getByRole('button', { name: 'Día siguiente' }).click();
  await expect(activityDate).not.toHaveText(today);
  const selectedActivityDay = await activityDate.innerText();

  const agenda = overview.getByRole('region', { name: /Tu próxima semana|Semana seleccionada/ });
  const days = agenda.locator('app-overview-week button');
  await expect(days).toHaveCount(7);
  await agenda.getByRole('button', { name: 'Siguiente' }).click();
  await days.nth(2).click();
  await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(activityDate).toHaveText(selectedActivityDay);
  await activity.getByRole('button', { name: 'Volver a hoy' }).click();
  await expect(activityDate).toHaveText(today);
  await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'true');
  const dayLink = agenda.getByRole('link', { name: 'Gestionar día en Calendario' });
  await expect(dayLink).toHaveAttribute('href', /date=\d{4}-\d{2}-\d{2}/);

  const setup = overview.getByRole('region', { name: 'Configuración inicial' });
  if (await setup.count()) {
    const details = setup.locator('details');
    if (await details.getAttribute('open') === null) await details.locator('summary').click();
    await expect(setup.getByRole('heading', { name: 'Obligatorio' })).toBeVisible();
    await expect(setup.locator('.ov__steps').first().locator('.ov__step')).toHaveCount(1);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true });
  await dayLink.click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await context.close();
});

test('home: automation and profile use the scoped Studio APIs', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  const session = await (await context.request.get('/studio/api/session/me')).json();
  expect(session.role).toBe('admin');
  const siteId = session.activeSiteId ?? session.sites[0]?.id;
  expect(siteId).toBeTruthy();

  const changes: Array<{ method: string; action: string; body: Record<string, unknown> }> = [];
  let policy = { enabled: true, state: 'active', mode: 'assisted' };
  let rejectMode = true;
  let activeStrategy = { approved: null as unknown, effective: { language: 'es' } };
  const nextSlot = new Date(Date.now() + 2 * 86_400_000).toISOString();
  await page.route(/\/studio\/api\/backend\/v2\/calendar\?/, (route) => route.fulfill({
    json: { timeZone: 'Europe/Madrid', items: [{
      id: 'overview-plan-fixture', kind: 'plan_item', channel: 'website', status: 'approved', lifecycle: 'planned',
      scheduledFor: nextSlot, title: 'Tema aprobado para la próxima franja', destination: 'Sitio web',
    }] },
  }));
  await page.route(/\/studio\/api\/backend\/v2\/automation(?:\/(?:pause|resume))?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      const action = new URL(request.url()).pathname.split('/').at(-1)!;
      const body = request.postDataJSON();
      if (request.method() === 'PATCH' && rejectMode) {
        await route.fulfill({ status: 500, json: { message: 'No se pudo guardar el modo.' } });
        return;
      }
      changes.push({ method: request.method(), action, body });
      if (action === 'pause') policy = { ...policy, state: 'paused' };
      else if (action === 'resume') policy = { ...policy, state: 'active' };
      else policy = { ...policy, mode: body.mode };
    }
    await route.fulfill({ json: policy });
  });
  await page.route(/\/studio\/api\/backend\/v2\/sites\/[^/]+\/strategy$/, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: activeStrategy });
      return;
    }
    const body = request.postDataJSON();
    changes.push({ method: request.method(), action: 'strategy', body });
    activeStrategy = { ...activeStrategy, approved: body.config };
    await route.fulfill({ json: { version: 1, layers: activeStrategy } });
  });

  await page.goto('/studio/overview', { waitUntil: 'networkidle' });
  const overview = page.locator('app-overview-page');
  await overview.getByRole('button', { name: 'Actualizar', exact: true }).click();
  const modes = overview.getByRole('group', { name: 'Modo de trabajo' });
  await expect(modes.getByRole('button', { name: 'Asistido' })).toHaveAttribute('aria-pressed', 'true');
  const upcoming = overview.getByRole('region', { name: 'Lo siguiente en salir' });
  await expect(upcoming.getByText('Plan asistido')).toBeVisible();
  await expect(upcoming.getByRole('link', { name: 'Tema aprobado para la próxima franja' })).toHaveAttribute('href', /calendar\?date=/);

  await overview.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(changes).toHaveLength(0);
  await overview.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar automatización', exact: true }).click();
  await expect(overview.getByText('Automatización en pausa', { exact: true })).toBeVisible();
  await overview.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await expect(overview.getByText('Automatización activa', { exact: true })).toBeVisible();

  const autopilot = modes.getByRole('button', { name: 'Autopilot' });
  await autopilot.click();
  await page.getByRole('button', { name: 'Activar Autopilot', exact: true }).click();
  await expect(overview.getByRole('alert')).toHaveText('No se pudo guardar el modo.');
  await expect(modes.getByRole('button', { name: 'Asistido' })).toHaveAttribute('aria-pressed', 'true');
  rejectMode = false;
  await autopilot.click();
  await page.getByRole('button', { name: 'Activar Autopilot', exact: true }).click();
  await expect(autopilot).toHaveAttribute('aria-pressed', 'true');

  await overview.getByRole('button', { name: 'Confirmar estrategia', exact: true }).click();
  await expect(overview.getByText('Estrategia confirmada', { exact: true })).toBeVisible();
  expect(changes).toEqual([
    { method: 'POST', action: 'pause', body: { siteId, reason: 'paused_manually' } },
    { method: 'POST', action: 'resume', body: { siteId } },
    { method: 'PATCH', action: 'automation', body: { siteId, mode: 'autopilot' } },
    { method: 'PUT', action: 'strategy', body: { config: { language: 'es' }, note: 'Confirmado desde Overview' } },
  ]);
  await context.close();
});

test('settings · mode & rhythm: day chips and guide sections save', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/automation', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: 'Automatización editorial' })).toBeVisible();
  const card = page.locator('app-article-settings-card');
  const sunday = card.getByRole('button', { name: 'Domingo' });
  const before = await sunday.getAttribute('aria-pressed');
  await sunday.click();
  await expect(sunday).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await expect(card.getByRole('checkbox', { name: 'FAQ' })).toBeVisible();
  await card.getByRole('button', { name: 'Guardar artículos' }).click();
  await expect(page.getByText('Configuración de artículos guardada.')).toBeVisible();
  // Put it back.
  await sunday.click();
  await card.getByRole('button', { name: 'Guardar artículos' }).click();
  await page.screenshot({ path: `${EVIDENCE}/mode-rhythm-1440.png`, fullPage: true });
  await context.close();
});

test('article: preview with side panel; editing is a separate mode', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  const list = await context.request.get('/studio/api/backend/v2/projects?page=1&pageSize=20');
  const items = ((await list.json()) as { items: Array<{ id: string; latestVersionId?: string | null; versionCount?: number }> }).items;
  test.skip(items.length === 0, 'no article on this database');
  await page.goto(`/studio/content/${items[0].id}`, { waitUntil: 'networkidle' });
  const sections = page.getByRole('navigation', { name: 'Secciones del artículo' });
  await expect(sections).toBeVisible();
  const preview = page.getByRole('article', { name: 'Article preview' });
  await expect(preview).toBeVisible();
  const cover = page.locator('.art-rail img.art-cover');
  if (await cover.count()) {
    await expect(preview.locator('.art-preview-image')).toHaveAttribute('src', (await cover.getAttribute('src'))!);
    await expect(preview.locator('.art-preview-cover')).toHaveCount(0);
  } else {
    await expect(preview.locator('.art-preview-cover')).toBeVisible();
  }
  const imageSources = (await preview.locator('.art-canvas__body img[src]').evaluateAll((images) =>
    images.map((image) => image.getAttribute('src')?.trim()).filter(Boolean)));
  await expect(page.getByRole('heading', { name: 'Estado del artículo' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Flujo editorial' }).getByRole('listitem')).toHaveCount(5);
  await page.screenshot({ path: `${EVIDENCE}/article-1440.png`, fullPage: true });
  const edit = page.getByRole('button', { name: 'Editar', exact: true });
  if (await edit.count()) {
    await edit.click();
    await expect(sections).toBeVisible();
    await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Edición de prueba');
    await expect(page.getByText('Cambios pendientes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(preview).toBeVisible();
  }
  for (const [tab, heading] of [
    ['Multimedia', 'Multimedia'],
    ['SEO', 'SEO del artículo'],
    ['Redes sociales', 'Publicaciones para redes'],
    ['Programación', 'Programación'],
    ['Historial', 'Historial de versiones'],
  ]) {
    await sections.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    if (tab === 'Multimedia') {
      const gallery = page.locator('.art-inline-media img');
      await expect(gallery).toHaveCount(imageSources.length);
      expect(await gallery.evaluateAll((images) => images.map((image) => image.getAttribute('src')))).toEqual(imageSources);
    }
  }
  await sections.getByRole('button', { name: 'Contenido', exact: true }).click();
  await expect(preview).toBeVisible();
  await context.close();
});

test('connection wizard lists only platforms with a publisher', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/connections/wizard', { waitUntil: 'networkidle' });
  await expect(page.getByText('Coming soon')).toHaveCount(0);
  await expect(page.getByText('Webflow')).toHaveCount(0);
  await context.close();
});

test('phone: home and article fit 390 px', async ({ browser }, testInfo) => {
  const { context, page } = await signIn(browser, 390, 844);
  for (const path of ['/studio/overview', '/studio/automation']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto('/studio/overview', { waitUntil: 'networkidle' });
  await expect(page.locator('app-overview-week ol')).toHaveCSS('grid-template-columns', /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/);
  await page.screenshot({ path: testInfo.outputPath('overview-mobile.png'), fullPage: true });
  for (const viewport of [{ width: 375, height: 812 }, { width: 800, height: 1000 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, JSON.stringify(viewport)).toBeLessThanOrEqual(0);
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.evaluate(() => localStorage.setItem('auctorio-theme', 'dark'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('app-overview-week button')).toHaveCount(7);
  await context.close();
});
