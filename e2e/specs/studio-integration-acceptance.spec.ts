import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../../src/infrastructure/db/prisma';
import { STUDIO_NAV } from '../../apps/studio-web/src/app/layout/studio-nav';
import { listStudioRoles } from '../../src/studio/auth';
import { hashStudioPassword } from '../../src/studio/passwords';
import { sha256 } from '../../src/shared/utils/hash';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4420';
const seed = randomUUID();
const email = `studio-${seed}@example.test`;
const inviteEmail = 'invite-' + seed + '@example.test';
const memberEmail = `member-${seed}@example.test`;
const password = randomUUID();
let tenantId: string | undefined;
const accountIds: string[] = [];
const prisma = getPrismaClient();

test.beforeAll(async () => {
  const target = new URL(baseURL);
  const database = new URL(process.env.DATABASE_URL || 'postgresql://localhost');
  expect(['127.0.0.1', 'localhost'].includes(target.hostname), 'Local Studio acceptance only').toBeTruthy();
  expect(['127.0.0.1', 'localhost'].includes(database.hostname), 'Test data requires local PostgreSQL').toBeTruthy();
  const tenant = await prisma.tenant.create({
    data: { name: 'Studio acceptance ' + seed, status: 'active', apiKeyHash: sha256(seed) },
  });
  tenantId = tenant.id;
  const roles = await listStudioRoles(tenant.id);
  const owner = roles.find((role) => role.key === 'owner')!;
  const account = await prisma.studioAccount.create({
    data: { email, displayName: 'Acceptance owner', status: 'active', passwordHash: await hashStudioPassword(password) },
  });
  accountIds.push(account.id);
  await prisma.studioUser.create({
    data: {
      tenantId: tenant.id, accountId: account.id, email, displayName: account.displayName, status: 'active',
      roles: { create: { studioRoleId: owner.id } },
    },
  });
  const member = await prisma.studioAccount.create({
    data: { email: memberEmail, displayName: 'Acceptance editor', status: 'active', passwordHash: account.passwordHash },
  });
  accountIds.push(member.id);
  await prisma.studioUser.create({
    data: {
      tenantId: tenant.id, accountId: member.id, email: memberEmail, displayName: member.displayName, status: 'active',
      roles: { create: { studioRoleId: roles.find((role) => role.key === 'editor')!.id } },
    },
  });
  await prisma.site.createMany({
    data: [
      { tenantId: tenant.id, key: 'acceptance-primary', name: 'Acceptance primary', type: 'webhook', locale: 'es-ES', baseUrl: 'https://primary.example.test' },
      { tenantId: tenant.id, key: 'acceptance-secondary', name: 'Acceptance secondary', type: 'webhook', locale: 'es-ES', baseUrl: 'https://secondary.example.test' },
    ],
  });
  const primary = await prisma.site.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenant.id, key: 'acceptance-primary' } } });
  await prisma.connectorInstallation.create({
    data: {
      tenantId: tenant.id, siteId: primary.id, kind: 'website', provider: 'generic_webhook', state: 'active',
      displayName: 'Acceptance website', config: { baseUrl: primary.baseUrl }, verifiedAt: new Date(), activatedAt: new Date(),
    },
  });
});

test.afterAll(async () => {
  if (tenantId) {
    await prisma.articleGeneration.deleteMany({ where: { tenantId } });
    await prisma.operation.deleteMany({ where: { tenantId } });
    await prisma.connectorInstallation.deleteMany({ where: { tenantId } });
    await prisma.site.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  }
  await prisma.studioAccount.deleteMany({ where: { OR: [{ id: { in: accountIds } }, { email: inviteEmail }] } });
  await prisma.$disconnect();
});

async function login(context: BrowserContext, username = email) {
  const response = await context.request.post(`${baseURL}/studio/api/auth/login/password`, {
    data: { email: username, password },
  });
  expect(response.status()).toBe(200);
}

async function open(page: Page, route: string) {
  await page.goto(`${baseURL}/studio/${route}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

async function fitsViewport(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const width of [1600, 1440, 1024, 768, 390]) {
  test(`Settings renders workspace data without page overflow at ${width}px`, async ({ page, context }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(context);
    await open(page, 'settings/sites');
    const connectionTable = page.getByRole('region', { name: 'Estado de conexión del sitio' });
    await expect(connectionTable.getByRole('row').nth(1)).toBeVisible();
    await expect(connectionTable.getByRole('cell', { name: 'Verificado', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tus sitios' })).toBeVisible();
    await fitsViewport(page);
    await page.screenshot({ fullPage: true, path: info.outputPath(`sites-${width}.png`) });

    await open(page, 'settings/roles?tab=matrix');
    const matrix = page.getByRole('region', { name: 'Workspace permission matrix' });
    await expect(matrix.getByRole('rowheader', { name: 'workspace.manage' })).toBeVisible();
    await expect(matrix.getByRole('rowheader', { name: 'analytics.read' })).toBeVisible();
    await fitsViewport(page);
    if (width === 1600 || width === 390) {
      await page.screenshot({ fullPage: true, path: info.outputPath(`roles-${width}.png`) });
      await page.getByRole('button', { name: 'Create role' }).click();
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
  });
}

test('Site Intelligence displays real profile evidence and reflows on mobile', async ({ page, context }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(context);
  const session = await context.request.get(baseURL + '/studio/api/session/me');
  expect(session.ok()).toBeTruthy();
  const siteId: string = (await session.json()).activeSiteId;
  expect(siteId).toBeTruthy();
  await prisma.siteIntelligenceProfile.create({
    data: { tenantId: tenantId!, siteId, brandSummary: 'Profile derived from the fixture article.', mainTopics: ['Editorial planning'], pageCount: 1 },
  });
  await prisma.siteIndexedPage.create({
    data: { tenantId: tenantId!, siteId, url: 'https://acceptance.example.test/article', title: 'Acceptance article', crawlState: 'extracted', wordCount: 120, lastIndexedAt: new Date() },
  });
  await prisma.siteSitemap.create({ data: { tenantId: tenantId!, siteId, url: 'https://acceptance.example.test/sitemap.xml', kind: 'index', status: 'fetched', urlCount: 1 } });

  await open(page, 'site-intelligence?tab=profile');
  const identity = page.getByRole('heading', { name: 'Identidad detectada' });
  const evidence = page.getByRole('complementary', { name: 'Historial y evidencia del sitio' });
  await expect(page.getByText('Profile derived from the fixture article.')).toBeVisible();
  const strategy = page.getByRole('region', { name: /^Estrategia editorial/ });
  const field = strategy.getByRole('textbox', { name: 'Descripción del proyecto' });
  const history = evidence.getByRole('region', { name: 'Historial de estrategia' });
  await expect(page.locator('.profile-reference .card')).toHaveCount(5);
  await expect(strategy.locator('.fields').first().locator('input')).toHaveCount(8);
  await expect(evidence).toContainText('1 / 1 páginas analizadas');
  await field.fill('Estrategia de aceptación');
  await strategy.getByRole('button', { name: 'Guardar nueva versión' }).click();
  await expect(history.getByText('Versión 1', { exact: true })).toBeVisible();
  await field.fill('Edición temporal');
  await strategy.getByRole('button', { name: 'Deshacer cambios' }).click();
  await expect(field).toHaveValue('Estrategia de aceptación');
  await history.getByText('Ver o restaurar', { exact: true }).click();
  await expect(history.getByText('Estrategia de aceptación', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(history.getByText('Versión 2', { exact: true })).toBeVisible();
  await expect(page.locator('.au-top')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Areas' })).toBeVisible();
  expect((await evidence.boundingBox())!.x).toBeGreaterThan((await identity.boundingBox())!.x);
  await expect(page.locator('.au-toast')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ fullPage: true, path: info.outputPath('site-profile-1440.png') });

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('#studio-sidebar')).toBeHidden();
  await fitsViewport(page);
  expect((await evidence.boundingBox())!.y).toBeGreaterThan((await identity.boundingBox())!.y);
  await expect(page.getByRole('group', { name: 'Opciones de Site Intelligence' }).getByRole('link', { name: 'Perfil y estrategia' })).toHaveAttribute('aria-current', 'location');
  await expect.poll(() => strategy.locator('.fields').first().evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.screenshot({ fullPage: true, path: info.outputPath('site-profile-390.png') });
  await evidence.getByRole('link', { name: 'Abrir páginas rastreadas' }).click();
  await expect(page).toHaveURL(/tab=crawl/);
  const inventory = page.getByRole('region', { name: 'Páginas del inventario' });
  await expect(inventory.getByRole('row', { name: /Acceptance article/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Última ejecución de setup' })).toBeVisible();
  await inventory.getByRole('button', { name: 'Ver', exact: true }).click();
  await expect(inventory.getByRole('link', { name: 'https://acceptance.example.test/article' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar URL o título' }).fill('No existe en el inventario');
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
  await expect(inventory).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Buscar URL o título' }).clear();
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
  await expect(inventory.getByRole('row', { name: /Acceptance article/ })).toBeVisible();
  await fitsViewport(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ fullPage: true, path: info.outputPath('site-crawl-390.png') });

  const mobileSections = page.getByRole('group', { name: 'Opciones de Site Intelligence' });
  await mobileSections.getByRole('link', { name: 'Pilares y brechas' }).click();
  await expect(page).toHaveURL(/tab=pillars/);
  await page.getByRole('button', { name: 'Añadir pilar' }).click();
  const pillar = page.locator('.pillar').filter({ has: page.getByRole('textbox', { name: 'Nombre', exact: true }) });
  await pillar.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Pilar de prueba');
  await pillar.getByRole('textbox', { name: 'Subtemas separados por comas' }).fill('Una brecha persistida');
  await pillar.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(pillar.getByText('Excluido', { exact: true })).toBeVisible();
  await pillar.getByRole('button', { name: 'Incluir', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar nueva versión' }).click();
  await expect(page.getByText('Una brecha persistida', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enviar al plan' })).toBeVisible();
  await fitsViewport(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ fullPage: true, path: info.outputPath('site-pillars-390.png') });

  await mobileSections.getByRole('link', { name: 'Señales SEO' }).click();
  await expect(page).toHaveURL(/tab=seo/);
  await page.getByRole('searchbox', { name: 'Buscar señal SEO' }).fill('metadescripción');
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
  const signals = page.getByRole('region', { name: 'Señales SEO del sitio' });
  await expect(signals.getByRole('row')).toHaveCount(2);
  await signals.getByRole('button', { name: 'Inspeccionar' }).click();
  await expect(signals.getByRole('link', { name: 'https://acceptance.example.test/article' })).toBeVisible();
  await fitsViewport(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ fullPage: true, path: info.outputPath('site-seo-390.png') });

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const tab of ['pillars', 'seo', 'crawl']) {
    await open(page, 'site-intelligence?tab=' + tab);
    await expect(page.locator('.profile-reference .kpi')).toHaveCount(4);
    if (tab === 'pillars') await expect(page.getByRole('heading', { name: 'Pilar de prueba' })).toBeVisible();
    if (tab === 'seo') await expect(page.getByRole('region', { name: 'Señales SEO del sitio' })).toBeVisible();
    if (tab === 'crawl') await expect(page.getByRole('region', { name: 'Páginas del inventario' })).toBeVisible();
    await fitsViewport(page);
    await page.screenshot({ fullPage: true, path: info.outputPath('site-' + tab + '-1440.png') });
  }
});

test('Competitors shows and filters workspace records on desktop and mobile', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(context);
  const session = await context.request.get(baseURL + '/studio/api/session/me');
  expect(session.ok()).toBeTruthy();
  const siteId: string = (await session.json()).activeSiteId;
  expect(siteId).toBeTruthy();
  const scope = { tenantId: tenantId!, siteId };
  const competitor = await prisma.competitor.create({ data: {
    ...scope, domain: 'north.example.test', name: 'North publisher', origin: 'manual', status: 'accepted',
    overlapTopics: [{ topic: 'Editorial schedules', sampledPages: 1 }],
  } });
  await prisma.competitor.create({ data: { ...scope, domain: 'south.example.test', name: 'South publisher', origin: 'manual', status: 'suggested' } });
  await prisma.siteTopicCluster.create({ data: { ...scope, slug: 'editorial-schedules', name: 'Editorial schedules' } });
  await prisma.competitorCoverageSnapshot.create({ data: { ...scope, competitorId: competitor.id, url: 'https://north.example.test/schedule', topic: 'Editorial schedules' } });
  await prisma.contentOpportunity.createMany({ data: [
    { ...scope, kind: 'coverage_gap', topic: 'Editorial schedules', dedupeKey: 'coverage-open', rationale: 'Missing schedule coverage', status: 'open' },
    { ...scope, kind: 'coverage_gap', topic: 'Regional coverage', dedupeKey: 'coverage-dismissed', rationale: 'Already reviewed', status: 'dismissed' },
  ] });

  await open(page, 'competitors?tab=shortlist');
  const north = page.getByRole('heading', { name: 'North publisher' });
  const south = page.getByRole('heading', { name: 'South publisher' });
  await expect(north).toBeVisible();
  await expect(south).toBeVisible();
  await page.screenshot({ fullPage: true, path: info.outputPath('competitors-1440.png') });
  const northCard = page.locator('article').filter({ has: north });
  await northCard.getByRole('button', { name: 'Detalles' }).click();
  await expect(northCard.getByText('Editorial schedules', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar competidor' }).fill('south');
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
  await expect(north).toHaveCount(0);
  await expect(south).toBeVisible();

  const desktopTabs = page.getByRole('list', { name: 'Competidores sections' });
  await desktopTabs.getByRole('link', { name: 'Cobertura temática', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Comparación de cobertura' });
  await expect(comparison.getByRole('columnheader', { name: 'North publisher' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ fullPage: true, path: info.outputPath('coverage-1440.png') });
  const coverageRow = comparison.getByRole('row').filter({ hasText: 'Editorial schedules' });
  await coverageRow.getByRole('button', { name: 'Ver brechas' }).click();
  await comparison.getByRole('link', { name: 'Buscar oportunidades del tema' }).click();
  await expect(page.getByRole('searchbox', { name: 'Buscar oportunidad' })).toHaveValue('Editorial schedules');
  await expect(page.getByRole('heading', { name: 'Editorial schedules' })).toBeVisible();
  await page.screenshot({ fullPage: true, path: info.outputPath('opportunities-1440.png') });

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('#studio-sidebar')).toBeHidden();
  await page.getByRole('combobox', { name: 'Estado de la oportunidad' }).selectOption('open');
  await expect(page.getByRole('heading', { name: 'Editorial schedules' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regional coverage' })).toHaveCount(0);
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('opportunities-390.png') });
  const mobileTabs = page.getByRole('group', { name: 'Opciones de Competidores' });
  await mobileTabs.getByRole('link', { name: 'Cobertura temática' }).click();
  await expect(comparison.getByRole('columnheader', { name: 'North publisher' })).toBeVisible();
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('coverage-390.png') });
  await mobileTabs.getByRole('link', { name: 'Competidores', exact: true }).click();
  await expect(south).toBeVisible();
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('competitors-390.png') });
});

test('Advanced opens existing tools and preserves linked views', async ({ page, context }) => {
  await login(context);
  for (const route of ['site-intelligence', 'sources', 'plan', 'review-queue', 'media', 'activity']) {
    await open(page, route);
    await expect(page.getByRole('navigation', { name: 'Advanced tools' })).toBeVisible();
  }
  await open(page, 'competitors?tab=coverage');
  const competitorTabs = page.getByRole('list', { name: 'Competidores sections' });
  await expect(competitorTabs.getByRole('link', { name: 'Cobertura temática' })).toHaveAttribute('aria-current', 'location');
  await competitorTabs.getByRole('link', { name: 'Oportunidades', exact: true }).click();
  await expect(page).toHaveURL(/tab=opportunities/);
  await page.goBack();
  await expect(competitorTabs.getByRole('link', { name: 'Cobertura temática' })).toHaveAttribute('aria-current', 'location');

  await open(page, 'inbox?tab=clusters');
  const inboxTabs = page.getByRole('list', { name: 'Inbox sections' });
  await expect(inboxTabs.getByRole('link', { name: /clústeres/i })).toHaveAttribute('aria-current', 'location');
});

test('source diagnostics follow the reference layout at desktop and mobile widths', async ({ page, context }, info) => {
  await login(context);
  await prisma.enrichmentProvider.create({
    data: {
      tenantId: tenantId!, key: 'acceptance-provider', name: 'Proveedor de aceptación',
      providerType: 'custom', enabled: false, credentialsRef: 'ACCEPTANCE_PROVIDER_KEY',
    },
  });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, 'sources?tab=settings');
    const diagnostics = page.locator('.source-diagnostics');
    await expect(diagnostics.locator('.split .card h2')).toHaveText([
      'Paquetes de fuentes', 'Proveedores de enriquecimiento', 'Política de extracción', 'Claridad sobre la conexión',
    ]);
    const packs = diagnostics.getByRole('region', { name: 'Paquetes de fuentes' });
    const inspect = packs.locator('summary', { hasText: 'Inspeccionar e importar' }).first();
    await expect(inspect).toBeVisible();
    const provider = diagnostics.getByRole('row', { name: /Proveedor de aceptación/ });
    await expect(provider.getByRole('cell', { name: 'Pausado', exact: true })).toBeVisible();
    await expect(provider.getByRole('cell', { name: 'Sin verificar', exact: true })).toBeVisible();
    await expect(diagnostics.getByRole('link', { name: 'Ir a Descubrimiento web' })).toHaveAttribute('href', '/studio/settings/discovery');
    const domains = diagnostics.getByText('Gestionar dominios descubiertos y bloqueados', { exact: true });
    await expect(diagnostics.getByRole('heading', { name: 'Dominios bloqueados' })).toBeHidden();
    await fitsViewport(page);
    await page.screenshot({ path: info.outputPath('sources-settings-' + width + '.png'), fullPage: true });

    await inspect.click();
    await expect(packs.getByRole('checkbox', { name: 'Incluir proveedores de enriquecimiento' })).toBeVisible();
    await inspect.click();
    await diagnostics.getByRole('button', { name: 'Añadir proveedor' }).click();
    await expect(diagnostics.getByRole('textbox', { name: 'Referencia de credenciales' })).toBeVisible();
    await diagnostics.getByRole('button', { name: 'Cerrar formulario' }).click();
    await domains.click();
    await expect(diagnostics.getByRole('heading', { name: 'Dominios bloqueados' })).toBeVisible();
    await fitsViewport(page);
  }
});

test('six Advanced screens render reference sections at desktop and mobile widths', async ({ page, context }, info) => {
  test.setTimeout(180_000);
  await login(context);
  const session = await context.request.get(baseURL + '/studio/api/session/me');
  expect(session.ok()).toBeTruthy();
  const siteId: string = (await session.json()).activeSiteId;
  await prisma.contentSource.createMany({
    data: [
      { tenantId: tenantId!, siteId, name: 'Fuente verificada', type: 'rss', enabled: false, url: 'https://healthy.example.test/feed', verificationStatus: 'verified' },
      { tenantId: tenantId!, siteId, name: 'Fuente con error', type: 'rss', enabled: false, url: 'https://failed.example.test/feed', categories: ['Cultura'], lastError: 'Fixture fetch error' },
    ],
  });
  const plan = await prisma.editorialPlan.create({
    data: {
      tenantId: tenantId!, siteId, name: 'Visual acceptance plan', status: 'ready',
      dateFrom: new Date('2026-11-01'), dateTo: new Date('2026-11-30'),
    },
  });
  await prisma.editorialPlanItem.create({
    data: { tenantId: tenantId!, planId: plan.id, siteId, title: 'Visual acceptance topic', channel: 'website', status: 'proposed' },
  });
  const screens = [
    ['sources', 'Fuentes y evidencias', 'Registro de fuentes', 'Resumen de fuentes'],
    ['inbox', 'Inbox editorial', 'Historias encontradas', 'Resumen del Inbox'],
    ['plan?tab=backlog', 'Plan editorial', 'Backlog de propuestas', 'Resumen del plan'],
    ['review-queue', 'Cola de revisión editorial', 'Pendientes de revisión', 'Resumen de revisión'],
    ['media', 'Biblioteca multimedia', 'Explorar recursos', 'Resumen de recursos'],
    ['activity', 'Trabajos en segundo plano', 'Operaciones y progreso', 'Resumen de trabajos'],
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [route, title, section, metrics] of screens) {
      await open(page, route);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: new RegExp('^' + section) })).toBeVisible();
      const cards = page.locator('dl[aria-label="' + metrics + '"]');
      await expect(cards.locator('dt')).toHaveCount(4);
      await expect.poll(() => cards.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(width === 390 ? 2 : 4);
      await fitsViewport(page);
      await page.screenshot({ path: info.outputPath(route.split('?')[0] + '-' + width + '.png'), fullPage: true });
    }
    const advanced = STUDIO_NAV.find((group) => group.id === 'advanced')!;
    const headings: Record<string, string> = {
      '/studio/site-intelligence?tab=profile': 'Identidad detectada',
      '/studio/site-intelligence?tab=pillars': 'Pilares de contenido',
      '/studio/site-intelligence?tab=seo': 'Salud SEO y mejoras',
      '/studio/site-intelligence?tab=crawl': 'Inventario de páginas',
      '/studio/competitors?tab=shortlist': 'Competidores observados',
      '/studio/competitors?tab=coverage': 'Matriz de cobertura temática',
      '/studio/competitors?tab=opportunities': 'Oportunidades de crecimiento',
      '/studio/sources?tab=sources': 'Registro de fuentes',
      '/studio/sources?tab=recommendations': 'Sugerencias para este sitio',
      '/studio/sources?tab=add': 'Nueva fuente',
      '/studio/sources?tab=evidence': 'Rastro de procedencia',
      '/studio/sources?tab=settings': 'Política de extracción',
      '/studio/inbox?tab=inbox': 'Aprender del triage',
      '/studio/inbox?tab=clusters': 'Clústeres y duplicados',
      '/studio/plan?tab=backlog': 'Backlog de propuestas',
      '/studio/plan?tab=pipeline': 'Pipeline de producción',
      '/studio/review-queue?tab=pending': 'Pendientes de revisión',
      '/studio/review-queue?tab=history': 'Historial de revisión',
      '/studio/media?tab=all': 'Explorar recursos',
      '/studio/media?tab=failed': 'Explorar recursos',
      '/studio/media?tab=unused': 'Explorar recursos',
      '/studio/activity?tab=active': 'Operaciones y progreso',
      '/studio/activity?tab=history': 'Operaciones y progreso',
      '/studio/activity?tab=failed': 'Operaciones y progreso',
    };
    for (const tool of advanced.items) {
      for (const tab of tool.sections ?? []) {
        const path = tool.path + '?tab=' + tab.id;
        await open(page, path.slice('/studio/'.length));
        await expect(page.getByRole('heading', { name: new RegExp('^' + headings[path]) })).toBeVisible();
        await expect(page.locator('.au-top')).toBeVisible();
        const nav = width === 390
          ? page.getByRole('group', { name: 'Opciones de ' + tool.label })
          : page.getByRole('list', { name: tool.label + ' sections' });
        await expect(nav.getByRole('link', { name: tab.label, exact: true })).toHaveAttribute('aria-current', 'location');
        await fitsViewport(page);
        await page.screenshot({ path: info.outputPath(tool.path.split('/').pop() + '-' + tab.id + '-' + width + '.png'), fullPage: true });
      }
    }

    await open(page, 'sources');
    const registry = page.getByRole('region', { name: 'Fuentes registradas' });
    await expect(registry.getByRole('columnheader', { name: 'Fuente', exact: true })).toBeVisible();
    if (width === 390) await expect.poll(() => registry.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const healthy = registry.getByRole('row').filter({ hasText: 'Fuente verificada' });
    await expect(healthy.getByText('Verificada', { exact: true })).toBeVisible();
    await healthy.getByRole('button', { name: 'Detalle' }).click();
    await expect(registry.getByRole('button', { name: 'Save configuration' })).toBeVisible();
    await healthy.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('failed');
    await expect(page.getByRole('heading', { name: 'Fuente verificada' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Fuente con error' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Filter sources' }).fill('cultura');
    await expect(page.getByRole('heading', { name: 'Fuente con error' })).toBeVisible();
    await open(page, 'plan?tab=pipeline');
    const board = page.getByRole('list', { name: 'Pipeline de producción' });
    await expect(board.getByRole('button', { name: /Visual acceptance topic/ })).toBeVisible();
    await fitsViewport(page);
    await open(page, 'sources?tab=add');
    await expect(page.getByRole('heading', { name: 'Antes de añadir una fuente' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Paquetes de fuentes' })).toBeVisible();
    await fitsViewport(page);
  }
});

test('responsive workspace navigation keeps the active tool and section in sync', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(context);
  await open(page, 'settings/sites');
  await expect(page.locator('.au-shell')).not.toHaveClass(/has-copilot/);
  const sidebar = page.getByRole('complementary', { name: 'Studio sidebar' });
  await sidebar.getByRole('link', { name: 'Advanced', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/site-intelligence/);
  await sidebar.getByRole('link', { name: 'Configuración y permisos', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/connections/);
  await sidebar.getByRole('link', { name: 'Sitios', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/settings\/sites/);

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('.workspace-location')).toHaveText('Auctorio / Configuración / Sitios');
  const settingsTool = page.getByRole('combobox', { name: 'Configuración tool' });
  await expect(settingsTool).toHaveValue('/studio/settings/sites');
  await page.getByRole('combobox', { name: 'Page section' }).selectOption('defaults');
  await expect(page.getByRole('heading', { name: 'Identidad del sitio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar identidad' })).toBeVisible();
  await settingsTool.selectOption('/studio/settings/team');
  await expect(page).toHaveURL(/\/studio\/settings\/team/);
  await expect(page.getByRole('main').locator('dt').filter({ hasText: /^Miembros$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Invitar persona', exact: true }).click();
  const invite = page.getByRole('dialog', { name: 'Invitar persona' });
  await expect(invite.getByRole('textbox', { name: 'Correo electrónico' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('invite-390.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(invite).toBeHidden();
  await page.getByRole('combobox', { name: 'Page section' }).selectOption('invites');
  await expect(page.getByRole('heading', { name: /^Invitaciones/ })).toBeVisible();
  await expect(settingsTool.locator('option[value="/studio/settings/social"]')).toHaveCount(0);
  await fitsViewport(page);
  await page.screenshot({ path: info.outputPath('people-390.png'), fullPage: true });

  await open(page, 'competitors?tab=coverage');
  const advancedTool = page.getByRole('combobox', { name: 'Advanced tool' });
  const sections = page.getByRole('group', { name: 'Opciones de Competidores' });
  const coverage = sections.getByRole('link', { name: 'Cobertura temática' });
  await expect(advancedTool).toHaveValue('/studio/competitors');
  await expect(coverage).toHaveAttribute('aria-current', 'location');
  await sections.getByRole('link', { name: 'Oportunidades' }).click();
  await expect(page).toHaveURL(/tab=opportunities/);
  await page.goBack();
  await expect(coverage).toHaveAttribute('aria-current', 'location');
  await fitsViewport(page);
  await page.screenshot({ path: info.outputPath('advanced-390.png'), fullPage: true });
});

test('every workspace subsection has a working sidebar link and selected state', async ({ page, context }) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(context);

  for (const group of STUDIO_NAV.filter(({ id }) => id === 'settings' || id === 'advanced')) {
    const tools = group.items.filter((item) => item.sidebar !== false && !item.platformAdminOnly);
    for (const item of tools) {
      await open(page, item.path.slice('/studio/'.length));
      const groupNav = page.getByRole('navigation', { name: group.label + ' tools' });
      await expect(groupNav.locator(':scope > ul > li > a')).toHaveText(tools.map(({ label }) => label));
      const sections = groupNav.getByRole('list', { name: item.label + ' sections' });
      await expect(sections.getByRole('link')).toHaveText(item.sections!.map(({ label }) => label));
      for (const section of item.sections!) {
        const link = sections.getByRole('link', { name: section.label, exact: true });
        await link.click();
        await expect(page).toHaveURL((url) => url.pathname === item.path && url.searchParams.get('tab') === section.id);
        await expect(link).toHaveAttribute('aria-current', 'location');
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      }
    }
  }
});

test('site edits and custom roles persist across reload', async ({ page, context }) => {
  await login(context);
  await open(page, 'settings/sites');
  await page.getByRole('button', { name: 'Edit Acceptance secondary' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Acceptance renamed');
  await page.getByRole('button', { name: 'Save site' }).click();
  await expect(page.getByRole('rowheader', { name: 'Acceptance renamed' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('rowheader', { name: 'Acceptance renamed' })).toBeVisible();
  await prisma.site.update({ where: { tenantId_key: { tenantId: tenantId!, key: 'acceptance-secondary' } }, data: { name: 'Acceptance secondary' } });

  await open(page, 'settings/roles?tab=matrix');
  await page.getByRole('button', { name: 'Create role' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Acceptance custom role');
  await page.getByRole('checkbox', { name: 'analytics.read', exact: true }).check();
  await page.getByRole('button', { name: 'Save role' }).click();
  await expect(page.getByRole('columnheader', { name: /Acceptance custom role/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('columnheader', { name: /Acceptance custom role/ })).toBeVisible();
  await page.getByRole('link', { name: 'Comparar el acceso de usuarios' }).click();
  await expect(page.getByLabel('First member')).toBeVisible();
});

test('member access saves identity and roles together from the directory dialog', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(context);
  await open(page, 'settings/team');
  const member = page.locator('.access-person').filter({ hasText: memberEmail });
  await expect(member.getByRole('checkbox')).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: info.outputPath('people-1440.png') });
  await member.getByRole('button', { name: 'Gestionar acceso' }).click();
  const dialog = page.getByRole('dialog', { name: /Gestionar acceso/ });
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Acceptance editor revised');
  await dialog.getByRole('checkbox', { name: 'Reviewer', exact: true }).check();
  await page.screenshot({ fullPage: true, path: info.outputPath('manage-access-1440.png') });
  await dialog.getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(member.getByText('Acceptance editor revised')).toBeVisible();
  await member.getByRole('button', { name: 'Gestionar acceso' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Reviewer', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('pending invitations preserve assigned roles when email delivery is disabled', async ({ page, context }) => {
  test.skip(process.env.E2E_WITHOUT_SMTP !== '1', 'Start the local API with SMTP disabled to test invitations.');
  await login(context);
  await open(page, 'settings/team?tab=invites');
  await expect(page.getByText('Sin invitaciones pendientes')).toBeVisible();
  await page.getByRole('button', { name: 'Invitar persona', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Invitar persona' });
  await dialog.getByRole('textbox', { name: 'Correo electrónico' }).fill(inviteEmail);
  await dialog.getByRole('checkbox', { name: 'Reviewer', exact: true }).check();
  const response = page.waitForResponse((result) => result.url().endsWith('/v2/users/invitations') && result.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Crear invitación' }).click();
  const invitation = await response;
  expect(invitation.status()).toBe(201);
  expect(await invitation.json()).toMatchObject({ email: inviteEmail, status: 'pending', delivery: 'not_configured' });
  const pending = page.locator('.access-person').filter({ hasText: inviteEmail });
  await expect(pending.getByText('Reviewer', { exact: true })).toBeVisible();
  await expect(pending.getByText('Invitado', { exact: true })).toBeVisible();
  await pending.getByRole('button', { name: 'Revocar invitación' }).click();
  const confirmation = page.getByRole('dialog', { name: /Revocar la invitación/ });
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(pending).toBeVisible();

  await pending.getByRole('button', { name: 'Revocar invitación' }).click();
  await confirmation.getByRole('button', { name: 'Revocar invitación' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Invitación revocada.' })).toBeVisible();
  await expect(pending).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Sin invitaciones pendientes')).toBeVisible();
});

test('suspension from People revokes a live editor session', async ({ page, context, browser }) => {
  await login(context);
  const editor = await browser.newContext();
  try {
    await login(editor, memberEmail);
    const session = `${baseURL}/studio/api/session/me`;
    expect((await editor.request.get(session)).status()).toBe(200);
    await open(page, 'settings/team');
    const member = page.locator('.access-person').filter({ hasText: 'Acceptance editor' });
    await member.getByRole('button', { name: 'Gestionar acceso' }).click();
    const access = page.getByRole('dialog', { name: /Gestionar acceso/ });
    await access.getByRole('combobox', { name: 'Estado' }).selectOption('suspended');
    await access.getByRole('button', { name: 'Guardar acceso' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Suspender', exact: true }).click();
    await expect(member.getByText('Suspendido', { exact: true })).toBeVisible();
    expect((await editor.request.get(session)).status()).toBe(401);
  } finally {
    await editor.close();
  }
});

test('new navigation retains social settings, workspace audit and paginated Advanced workflows', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(context);
  const id = tenantId!;
  const session = await context.request.get(baseURL + '/studio/api/session/me');
  expect(session.ok()).toBeTruthy();
  const siteId = (await session.json()).activeSiteId ?? null;
  await prisma.articleGeneration.createMany({
    data: [
      { tenantId: id, siteId, status: 'qa_review', decision: 'create_new', publicationDecision: { decision: 'review' }, brief: { primaryKeyword: 'Acceptance pending generation' } },
      { tenantId: id, siteId, status: 'approved', decision: 'create_new', publicationDecision: { decision: 'review' }, brief: { primaryKeyword: 'Acceptance reviewed generation' } },
    ],
  });
  await prisma.operation.createMany({
    data: [
      { tenantId: id, type: 'text_generation', status: 'queued', entityType: 'acceptance-active' },
      { tenantId: id, type: 'text_generation', status: 'failed', entityType: 'acceptance-failed' },
    ],
  });
  await prisma.auditLog.create({ data: { tenantId: id, actorType: 'system', action: 'acceptance.fixture' } });
  const pageOfHistory = await context.request.get(baseURL + '/studio/api/backend/v2/operations?status=history&pageSize=1');
  expect(pageOfHistory.ok()).toBeTruthy();
  expect((await pageOfHistory.json()).items).toEqual([expect.objectContaining({ entityType: 'acceptance-failed' })]);
  const pageOfReview = await context.request.get(baseURL + '/studio/api/backend/v2/editorial-engine/generations?review=pending&outcome=review&pageSize=1');
  expect(pageOfReview.ok()).toBeTruthy();
  expect(await pageOfReview.json()).toMatchObject({ total: 1, items: [{ title: 'Acceptance pending generation' }] });

  await open(page, 'connections?tab=status');
  await expect(page.getByRole('heading', { name: 'Verificación y credenciales' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Acceptance website' })).toContainText('Verification: ready');
  await page.getByRole('link', { name: 'Ajustes de redes', exact: true }).click();
  await expect(page).toHaveURL(/settings\/social/);
  await expect(page.locator('.workspace-location')).toHaveText('Auctorio / Configuración / Conexiones');
  await page.getByRole('link', { name: 'Auditoría', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Historial de auditoría' })).toBeVisible();

  await open(page, 'review-queue?tab=pending');
  const pending = page.getByRole('button', { name: 'Open generation Acceptance pending generation' });
  const reviewed = page.getByRole('button', { name: 'Open generation Acceptance reviewed generation' });
  await expect(pending).toBeVisible();
  await page.getByRole('list', { name: 'Cola de revisión sections' }).getByRole('link', { name: 'Historial' }).click();
  await expect(reviewed).toBeVisible();
  await expect(pending).toHaveCount(0);

  await open(page, 'activity?status=failed');
  await expect(page.getByText(/acceptance-failed/)).toBeVisible();
  await expect(page.getByText(/acceptance-active/)).toHaveCount(0);
  await page.getByRole('list', { name: 'Trabajos en segundo plano sections' }).getByRole('link', { name: 'En curso' }).click();
  await expect(page.getByText(/acceptance-active/)).toBeVisible();
  await expect(page.getByText(/acceptance-failed/)).toHaveCount(0);
});

test('Writing keeps drafts isolated when switching sites in the shell', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(context);
  await open(page, 'settings/writing');
  const selectSite = async (name: string) => {
    await page.getByRole('button', { name: /Switch site/ }).click();
    await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
    await expect(page.getByRole('button', { name: new RegExp(`Site: ${name}`) })).toBeVisible();
  };
  const addRule = async (rule: string) => {
    await page.getByLabel('Nueva instrucción').fill(rule);
    await page.getByRole('button', { name: 'Añadir regla', exact: true }).click();
    await expect(page.getByText(rule, { exact: true })).toBeVisible();
  };
  const save = page.getByRole('button', { name: /^Guardar$/ });

  await addRule('Primary site writing rule');
  await selectSite('Acceptance secondary');
  await expect(page.getByLabel('Nueva instrucción')).toBeVisible();
  await expect(page.getByText('Primary site writing rule', { exact: true })).toHaveCount(0);
  await addRule('Secondary site writing rule');
  await save.click();
  await expect(save).toBeDisabled();

  await selectSite('Acceptance primary');
  await expect(page.getByText('Primary site writing rule', { exact: true })).toBeVisible();
  await expect(page.getByText('Secondary site writing rule', { exact: true })).toHaveCount(0);
  await save.click();
  await expect(save).toBeDisabled();
  await page.reload();
  await expect(page.getByText('Primary site writing rule', { exact: true })).toBeVisible();
  await selectSite('Acceptance secondary');
  await expect(page.getByText('Secondary site writing rule', { exact: true })).toBeVisible();
  await expect(page.getByText('Primary site writing rule', { exact: true })).toHaveCount(0);
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('writing-1440.png') });
  await page.setViewportSize({ width: 390, height: 900 });
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('writing-390.png') });
});

test('saved automation mode and pause agree in Settings, Home and Calendar', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(context);
  await open(page, 'automation');
  const savedMode = page.getByLabel('Current automation mode');
  await expect(savedMode).toHaveText('assisted');
  await page.getByRole('button', { name: 'Pausar automatización', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pausar automatización' }).click();
  await expect(page.getByRole('button', { name: 'Reanudar automatización' })).toBeVisible();
  await page.getByRole('radio', { name: /^Manual/ }).click();
  await expect(savedMode).toHaveText('assisted');
  await page.getByRole('button', { name: 'Guardar política de automatización' }).click();
  await expect(savedMode).toHaveText('manual');
  await expect(page.getByRole('button', { name: 'Reanudar automatización' })).toBeVisible();
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('automation-1440.png') });
  await page.setViewportSize({ width: 390, height: 900 });
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('automation-390.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await open(page, 'overview');
  await expect(page.getByRole('group', { name: 'Modo de trabajo' }).getByRole('button', { name: 'Manual' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Automatización en pausa', { exact: true })).toBeVisible();
  await open(page, 'calendar');
  await expect(page.getByRole('link', { name: 'Automation policy' })).toHaveText('Manual · Paused');

  await page.getByRole('link', { name: 'Automation policy' }).click();
  await page.getByRole('button', { name: 'Reanudar automatización' }).click();
  await expect(page.getByRole('button', { name: 'Pausar automatización', exact: true })).toBeVisible();
  await open(page, 'calendar');
  await expect(page.getByRole('link', { name: 'Automation policy' })).toHaveText('Manual · Disabled');
});

test('Connections exposes current verification and disconnects the website without deleting it', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(context);
  await open(page, 'connections');
  const destination = page.getByRole('row').filter({ hasText: 'Acceptance website' });
  await expect(destination).toContainText('Verification: ready');
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('connections-1440.png') });
  await destination.getByRole('button', { name: 'Disconnect Acceptance website' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(destination).toContainText('Lifecycle: disabled');
  await expect(destination.getByRole('button', { name: 'Abrir configuración' })).toBeVisible();
  await page.reload();
  await expect(destination).toContainText('Lifecycle: disabled');
  await page.setViewportSize({ width: 390, height: 900 });
  await fitsViewport(page);
  await page.screenshot({ fullPage: true, path: info.outputPath('connections-390.png') });
});
