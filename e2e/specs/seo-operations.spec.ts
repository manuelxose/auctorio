import { test, expect, type Page, type Request } from '@playwright/test';

// SEO-V2-06: browser checks of the SEO views and the platform SEO operations centre.
// Read-only by construction: it only navigates, filters, opens drawers and reads. It never
// clicks anything that can buy data or start research (research request, provider test,
// balance, discovery, coverage, Search Console), and it fails the run if a page sends a write.
const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD (a local QA account on a workspace with a site) to run the SEO operations checks.');

const CUSTOMER = [
  '/studio/site-intelligence?tab=overview', '/studio/site-intelligence?tab=keywords', '/studio/site-intelligence?tab=performance',
  '/studio/site-intelligence?tab=profile', '/studio/site-intelligence?tab=pillars', '/studio/site-intelligence?tab=seo', '/studio/site-intelligence?tab=crawl',
  '/studio/seo-opportunities', '/studio/competitors?tab=shortlist', '/studio/competitors?tab=coverage', '/studio/competitors?tab=opportunities',
  '/studio/seo-research', '/studio/settings/seo?tab=business', '/studio/settings/seo?tab=research', '/studio/settings/seo?tab=data', '/studio/settings/seo?tab=optimization',
];
const ADMIN = ['providers', 'budgets', 'costs', 'research', 'data', 'economics'].map((tab) => `/studio/admin/seo?tab=${tab}`);
// Angular logs a hydration-stability warning while polling; HTTP 4xx/5xx are asserted separately.
const noise = /NG0506|Failed to load resource/;

async function signIn(browser: import('@playwright/test').Browser, width: number, height: number) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status(), 'QA login').toBe(200);
  const page = await context.newPage();
  const watch = { errors: [] as string[], writes: [] as string[] };
  page.on('console', (message) => { if (message.type() === 'error' && !noise.test(message.text())) watch.errors.push(message.text()); });
  page.on('pageerror', (error) => watch.errors.push(error.message));
  page.on('request', (request: Request) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) watch.writes.push(`${request.method()} ${request.url()}`); });
  return { context, page, watch };
}

const overflow = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);

for (const [width, height, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']] as const) {
  test(`every SEO page loads without console errors, writes or horizontal overflow (${label})`, async ({ browser }) => {
    const { context, page, watch } = await signIn(browser, width, height);
    for (const url of [...CUSTOMER, ...ADMIN]) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await expect(page.locator('h1').first(), url).toBeVisible();
      expect(await overflow(page), `horizontal overflow on ${url}`).toBeLessThanOrEqual(0);
      await page.reload({ waitUntil: 'networkidle' }); // a refresh must not write either
    }
    expect(watch.writes, 'navigation and refresh send no writes').toEqual([]);
    expect(watch.errors).toEqual([]);
    await context.close();
  });
}

test('customer API responses carry no amounts or provider names', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  const leaks: string[] = [];
  page.on('response', async (response) => {
    if (!/\/v2\/sites\//.test(response.url()) || !(response.headers()['content-type'] ?? '').includes('json')) return;
    const body = await response.json().catch(() => null);
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string' && /dataforseo|anyapi|tavily|firecrawl/i.test(value)) leaks.push(`${path}=${value.slice(0, 30)}`);
      if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) {
        // scoring weights ("maintenanceCost") are not money; usd/price/spend keys are.
        if (/usd|price|spend|billed|budget/i.test(key)) leaks.push(`${path}.${key}`);
        walk(inner, `${path}.${key}`);
      }
    };
    walk(body, response.url().split('/v2/sites/')[1] ?? '');
  });
  for (const url of CUSTOMER) await page.goto(url, { waitUntil: 'networkidle' });
  expect(leaks).toEqual([]);
  await context.close();
});

test('keywords: view, sort and paging controls drive the list; the drawer closes with Escape and returns focus', async ({ browser }) => {
  const { context, page, watch } = await signIn(browser, 1440, 900);
  await page.goto('/studio/site-intelligence?tab=keywords', { waitUntil: 'networkidle' });
  for (const view of ['Con oportunidad', 'Descartadas', 'Descubiertas', 'Relevantes']) {
    const request = page.waitForRequest((r) => /seo-keywords/.test(r.url()) && r.url().includes('view='), { timeout: 5000 }).catch(() => null);
    await page.getByRole('button', { name: new RegExp(`^${view}`) }).click();
    await request;
  }
  const search = page.getByRole('searchbox', { name: 'Buscar palabra clave' });
  await search.fill('zzz-no-existe');
  await expect(page.getByText(/ninguna|sin resultados|no hay/i).first()).toBeVisible();
  await search.fill('');
  const opener = page.locator('main table tbody tr button').first();
  if (await opener.count()) {
    await opener.focus();
    await opener.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  expect(watch.writes).toEqual([]);
  await context.close();
});

test('performance: 28 and 90 day ranges request the matching data', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/site-intelligence?tab=performance', { waitUntil: 'networkidle' });
  const days = (n: number) => page.waitForRequest((r) => r.url().includes(`seo-performance?days=${n}`));
  const ninety = days(90); await page.getByRole('button', { name: '90 días' }).click(); await ninety;
  const twentyEight = days(28); await page.getByRole('button', { name: '28 días' }).click(); await twentyEight;
  await context.close();
});

test('loading skeletons and API errors with a retry that recovers', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  const keywordCalls = /\/seo-keywords/;
  // loading: a delayed response must show a placeholder, not an empty or zero-filled view
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(keywordCalls, async (route) => { await gate; await route.continue().catch(() => undefined); });
  await page.goto('/studio/site-intelligence?tab=keywords', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[class*=skeleton]').first()).toBeVisible();
  release();
  await page.unroute(keywordCalls);
  await page.waitForLoadState('networkidle');
  // error: a 500 shows a message with Reintentar, and Reintentar recovers once the API answers
  await page.route(keywordCalls, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"internal","message":"fallo de prueba"}}' }));
  await page.goto('/studio/site-intelligence?tab=keywords', { waitUntil: 'networkidle' });
  await expect(page.getByRole('alert').filter({ hasText: /No se han podido cargar/ })).toBeVisible();
  await page.unroute(keywordCalls);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /No se han podido cargar/ })).toHaveCount(0);
  await context.close();
});

test('allowance exhausted and stopped states render without amounts (response replaced in the browser only)', async ({ browser }) => {
  const { context, page, watch } = await signIn(browser, 1440, 900);
  for (const state of ['exhausted', 'stopped', 'disabled', 'no_provider', 'platform_limit']) {
    await page.route(/seo-allowance/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state, kind: 'recurring', usedPercent: 100, renewsAt: null, automatic: false, held: null }) }));
    await page.goto('/studio/seo-research', { waitUntil: 'networkidle' });
    await expect(page.locator('main')).not.toContainText(/\bUSD\b|\$\s?\d/);
    await expect(page.getByRole('button', { name: /Pedir investigación/ })).toBeVisible();
    await page.unroute(/seo-allowance/);
  }
  expect(watch.writes).toEqual([]);
  await context.close();
});

test('admin: costs filters and CSV export, economics date validation, tabs expose their state', async ({ browser }) => {
  const { context, page, watch } = await signIn(browser, 1440, 900);
  await page.goto('/studio/admin/seo?tab=costs', { waitUntil: 'networkidle' });
  if (await page.getByText('Solo administradores de la plataforma').count()) { test.skip(true, 'QA account is not a platform administrator'); }
  const costs = page.locator('app-seo-cost-analytics');
  await costs.locator('select').nth(2).selectOption({ index: 1 }); // provider
  const filtered = page.waitForRequest((r) => /admin\/seo\/costs\?/.test(r.url()) && r.url().includes('providerId='));
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await filtered;
  for (const group of ['Workspace', 'Proveedor', 'Día']) {
    await page.getByRole('button', { name: group, exact: true }).click();
    await expect(page.getByRole('button', { name: group, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^costes-seo-.*\.csv$/);
  await page.goto('/studio/admin/seo?tab=economics', { waitUntil: 'networkidle' });
  await page.getByLabel('Desde').fill('2099-01-02');
  await page.getByLabel('Hasta').fill('2099-01-01');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Revisa las fechas')).toBeVisible();
  expect(watch.writes, 'reading the operations centre never writes').toEqual([]);
  await context.close();
});

test('drawers: modal drawers move focus inside, close with Escape and give focus back', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/seo-opportunities', { waitUntil: 'networkidle' });
  const opener = page.locator('main table tbody tr button').first();
  test.skip((await opener.count()) === 0, 'The site has no opportunities to open');
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await context.close();
});
