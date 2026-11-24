import { test, expect, type Browser } from '@playwright/test';
import { STUDIO_NAV } from '../../apps/studio-web/src/app/layout/studio-nav';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

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

test('desktop: area bar and contextual sidebar work together; shortcuts return focus', async ({ browser }) => {
  const { context, page } = await signIn(browser, 1440, 900);
  await page.goto('/studio/overview', { waitUntil: 'networkidle' });
  const areas = page.getByRole('navigation', { name: 'Areas' });
  const sidebar = page.getByRole('navigation', { name: 'Home tools' });
  await expect(areas.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('link')).toHaveText(['Overview', 'Notifications', 'Oportunidades']);

  // Settings is one click from anywhere and its tools fill the sidebar.
  await areas.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/studio\/settings\/sites/);
  await page.getByRole('navigation', { name: 'Settings tools' }).getByRole('link', { name: 'Connections' }).click();
  await expect(page).toHaveURL(/\/studio\/connections/);

  // Deep link keeps its area lit.
  await page.goto('/studio/content/new', { waitUntil: 'networkidle' });
  await expect(areas.getByRole('link', { name: 'Publicaciones' })).toHaveAttribute('aria-current', 'page');

  // Ctrl+K palette: Esc closes and focus goes back.
  await page.getByRole('button', { name: /Search and go to/ }).focus();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Search and go to/ })).toBeFocused();

  // Ctrl+J toggles the assistant inside the sidebar without hiding the area tools.
  const assistant = page.getByRole('region', { name: 'Assistant' });
  if (await assistant.isVisible()) await page.keyboard.press('Control+j');
  await expect(assistant).toHaveCount(0);
  await page.keyboard.press('Control+j');
  await expect(assistant).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Publicaciones tools' })).toBeVisible();
  await page.keyboard.press('Control+j');
  await expect(page.getByRole('button', { name: /^Assistant/ })).toBeFocused();
  await context.close();
});

test('phone: drawer opens and closes with Esc, active area stays in view', async ({ browser }) => {
  const { context, page } = await signIn(browser, 390, 844);
  await page.goto('/studio/plan', { waitUntil: 'networkidle' });
  const active = page.getByRole('navigation', { name: 'Areas' }).getByRole('link', { name: 'Advanced' });
  await expect(active).toBeInViewport();

  const menu = page.getByRole('button', { name: 'Open navigation' });
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Advanced tools' }).getByRole('link', { name: 'Review queue' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Advanced tools' })).toBeHidden();
  await expect(menu).toBeFocused();
  await context.close();
});

test('workspace design reaches every visible Advanced and Settings page and section', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await signIn(browser, 1440, 900);
  const renderErrors: string[] = [];
  page.on('pageerror', (error) => renderErrors.push(error.message));
  const main = page.getByRole('main');
  let pages = 0;
  let sections = 0;

  for (const area of STUDIO_NAV.filter((group) => ['advanced', 'settings'].includes(group.id))) {
    await page.goto(area.items[0].path);
    const sidebar = page.getByRole('navigation', { name: area.label + ' tools' });
    await expect(sidebar).toBeVisible();
    for (const item of area.items) {
      const link = sidebar.locator('a.au-sb__item:not(.au-sb__item--sub)').getByText(item.label, { exact: true });
      if ((item.platformAdminOnly || item.adminOnly) && await link.count() === 0) continue;
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(new RegExp(item.path + '(?:[?#]|$)'));
      await expect(page.locator('.au-shell--workspace')).toBeVisible();
      await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
      pages++;
      for (const section of item.sections ?? []) {
        const shortcut = sidebar.getByRole('link', { name: section.label, exact: true });
        await shortcut.click();
        await expect(page).toHaveURL(new RegExp('[?&]tab=' + section.id + '(?:&|$)'));
        await expect(shortcut).toHaveAttribute('aria-current', 'location');
        await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
        sections++;
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio/sources?tab=evidence');
  const shortcut = page.getByRole('navigation', { name: 'Page sections' }).getByRole('link', { name: 'Technical settings' });
  await shortcut.click();
  await expect(main.getByRole('heading', { name: 'Enrichment providers' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(renderErrors).toEqual([]);
  expect(pages).toBeGreaterThanOrEqual(14);
  expect(sections).toBeGreaterThanOrEqual(11);
  console.log('Verified workspace pages:', pages, 'section links:', sections);
  await context.close();
});
