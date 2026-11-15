import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || process.env.QA_STUDIO_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || process.env.QA_STUDIO_PASSWORD || '';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4420';

// STUDIO-08: one canonical publication per content+destination, past times refused,
// calendar distinguishes proposals (publish-now gating is covered by tests/phase5-operations). No live publish:
// the scheduled time is far in the future and the record is canceled at the end.
test('STUDIO-08: one canonical schedule, past-time guard and calendar projection', async ({ browser }) => {
  expect(EMAIL && PASSWORD, 'E2E_EMAIL and E2E_PASSWORD required').toBeTruthy();
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  const api = context.request;
  expect((await api.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } })).status()).toBe(200);

  const projects = await (await api.get('/studio/api/backend/v2/projects?page=1&pageSize=50')).json();
  const project = (projects.items as Array<{ id: string; siteId: string | null; versions?: unknown[] }>).find((item) => item.siteId);
  test.skip(!project, 'needs a content project with a site');

  const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const create = (scheduledFor: string) => api.post('/studio/api/backend/v2/publications', { data: { projectId: project!.id, channel: 'website', scheduledFor } });

  // Past time is refused deterministically.
  const past = await create(new Date(Date.now() - 3_600_000).toISOString());
  expect(past.status()).toBe(400);
  expect(await past.text()).toContain('scheduled_in_past');

  // Scheduling twice keeps one record and moves it.
  const first = await create(at(300));
  expect([200, 201]).toContain(first.status());
  const firstBody = await first.json();
  const later = at(301);
  const second = await (await create(later)).json();
  expect(second.id).toBe(firstBody.id);
  expect(second.scheduledFor).toBe(later);

  // Calendar move uses the same record.
  const moved = await (await api.post(`/studio/api/backend/v2/publications/${firstBody.id}/reschedule`, { data: { scheduledFor: at(302) } })).json();
  expect(moved.id).toBe(firstBody.id);
  expect((await api.post(`/studio/api/backend/v2/publications/${firstBody.id}/reschedule`, { data: { scheduledFor: new Date(Date.now() - 3_600_000).toISOString() } })).status()).toBe(400);

  // Calendar projection returns the site timezone and the publication once.
  const calendar = await (await api.get(`/studio/api/backend/v2/calendar?from=${at(301)}&to=${at(303)}&siteId=${project!.siteId}`)).json();
  expect(calendar.timeZone).toBeTruthy();
  expect((calendar.items as Array<{ id: string }>).filter((item) => item.id === firstBody.id)).toHaveLength(1);

  // Calendar UI: legend, timezone and accessible kinds, at three widths.
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/studio/calendar', { waitUntil: 'networkidle' });
    await expect(page.getByText('Dashed: proposal, not scheduled to publish')).toBeVisible();
    await expect(page.getByText(`Times in ${calendar.timeZone}`)).toBeVisible();
    await page.screenshot({ path: `test-results/studio-08-calendar-${width}.png`, fullPage: true });
  }

  // Cancel restores a non-executable state; nothing was published.
  const canceled = await (await api.post(`/studio/api/backend/v2/publications/${firstBody.id}/cancel`)).json();
  expect(canceled.status).toBe('canceled');
});
