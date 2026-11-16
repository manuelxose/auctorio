import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

test.beforeAll(async () => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
});

test('Pages & crawl states what was read, never claims Google indexation, and is keyboard operable', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  const login = await context.request.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);

  await page.goto('/studio/site-intelligence', { waitUntil: 'networkidle' });
  // Sections live in the sidebar (or the strip above the page when the sidebar is an icon rail).
  const section = (name: string) => page.getByRole('link', { name, exact: true });
  await expect(section('Profile & strategy')).toHaveAttribute('aria-current', 'location');

  // Keyboard: focus Pages & crawl and activate it with Enter.
  const crawl = section('Pages & crawl');
  await crawl.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/tab=crawl/);
  await expect(crawl).toHaveAttribute('aria-current', 'location');

  const panel = page.locator('section.au-panel', { hasText: 'What was actually read' });
  await expect(panel).toBeVisible();
  // Discovered / fetched / analysed are reported as distinct counts, with the Search Console caveat.
  await expect(panel).toContainText(/URLs found in sitemaps · \d+ fetched · \d+ analysed · \d+ failed/);
  await expect(panel).toContainText('nothing about Google indexation');
  await expect(panel.getByRole('columnheader', { name: 'Section' })).toBeVisible();

  // The inventory (same section) is labelled as discovered, not indexed.
  await expect(page.getByRole('heading', { name: /Discovered pages/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Indexed pages$/ })).toHaveCount(0);

  // SEO signals: facts about our sample, with the no-Search-Console caveat; never rankings or traffic.
  await section('SEO signals').click();
  const seo = page.locator('section.au-panel', { hasText: 'On-page signals' });
  await expect(seo).toContainText('connect Search Console');
  await expect(seo.getByRole('row', { name: /No H1/ })).toBeVisible();
  await expect(seo).not.toContainText(/ranking position|clicks|impressions/i);

  // Content gaps (under Pillars & gaps): inferential, labelled with confidence or an explicit "no pillars" explanation.
  await section('Pillars & gaps').click();
  const opp = page.locator('section.au-panel', { hasText: 'Content gaps' });
  await expect(opp).toBeVisible();
  await expect(opp).toContainText(/Confidence|No pillars with subtopics|No uncovered subtopics/);
  await expect(opp).not.toContainText(/search volume:|difficulty:/i);
  await context.close();
});
