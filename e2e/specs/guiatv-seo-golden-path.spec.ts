import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * GUIATV SEO GOLDEN PATH (M22).
 * Login → site intelligence → index → plan (SEO growth, informational) →
 * structured briefs with relevance → approve → generate → QA → semantic HTML →
 * save as GuiaTV draft → destination metadata contract.
 */

// Plan generation + article generation + hero image + QA can take several
// minutes against production; the default 120s is too tight.
test.setTimeout(420_000);

const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';

let api: APIRequestContext;
let guiatvSiteId = '';
let goldenProjectId = '';

type SessionView = {
  user: { email: string };
  sites: Array<{ id: string; key: string; name: string }>;
  activeSiteId: string | null;
};

type PlanView = {
  id: string;
  status: string;
  error: string | null;
  items: Array<{
    id: string;
    title: string;
    status: string;
    contentType: string | null;
    primaryIntent: string | null;
    relevanceScore: number | null;
    recommendedWordCountMin: number | null;
    recommendedWordCountMax: number | null;
    outline: unknown;
    suggestedInternalLinks: unknown;
    projectId: string | null;
  }>;
};

async function waitFor(fn: () => Promise<boolean>, label: string, timeoutMs = 240_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error(`timeout waiting for ${label}`);
}

test.beforeAll(async ({ playwright }) => {
  expect(EMAIL, 'E2E_EMAIL required').toBeTruthy();
  expect(PASSWORD, 'E2E_PASSWORD required').toBeTruthy();
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'https://auctorio.com' });
  const login = await api.post('/studio/api/auth/login/password', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);
  const sites = ((await (await api.get('/studio/api/sites')).json()) as { items: SessionView['sites'] }).items;
  const guiatv = sites.find((site) => site.key === 'guiatv-editorial');
  expect(guiatv).toBeTruthy();
  guiatvSiteId = guiatv!.id;
  await api.post('/studio/api/session/active-site', { data: { siteId: guiatvSiteId } });
});

test.afterAll(async () => {
  await api?.dispose();
});

test('1. Site intelligence: index the destination and confirm real crawl data', async () => {
  // Bounded index (small budget) for the E2E run; full indexing is the
  // production workflow.
  const index = await api.post(`/studio/api/backend/v2/site-intelligence/${guiatvSiteId}/index`, {
    data: { crawl: true, budget: 15, wait: true },
  });
  expect(index.status()).toBe(200);
  const indexResult = (await index.json()) as { started: boolean; result?: { pagesExtracted?: number; pagesSkipped?: number; sitemapsDiscovered?: number } };
  expect(indexResult.result?.sitemapsDiscovered ?? 0).toBeGreaterThanOrEqual(1);
  // Incremental indexing may find nothing new on a previously indexed site;
  // the durable inventory is asserted from the overview below.

  const overviewResponse = await api.get(`/studio/api/backend/v2/site-intelligence/${guiatvSiteId}`);
  expect(overviewResponse.status()).toBe(200);
  const overview = (await overviewResponse.json()) as {
    totalPages: number;
    extractedPages: number;
    sitemaps: unknown[];
    profile: { mainTopics: string[]; detectedSiteType: string | null; version: number } | null;
  };
  expect(overview.totalPages).toBeGreaterThan(0);
  expect(overview.extractedPages).toBeGreaterThan(0);
  expect(overview.sitemaps.length).toBeGreaterThanOrEqual(1);
  expect(overview.profile).toBeTruthy();
  expect(overview.profile!.detectedSiteType).toContain('tv');
  expect(overview.profile!.mainTopics.length).toBeGreaterThan(0);
});

function madridDate(offsetDays: number): string {
  // Local calendar date in Europe/Madrid, the plan's timezone.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(Date.now() + offsetDays * 86400000));
}

for (const perDay of [1, 2, 3]) {
  test(`2.${perDay} Editorial plan: 7 days × ${perDay}/day yields exactly ${7 * perDay} site-aware briefs on their dates`, async () => {
    test.skip(perDay > 1 && process.env.E2E_PLAN_ALL_CADENCES !== '1', 'set E2E_PLAN_ALL_CADENCES=1 to also run the 2/day and 3/day live cadences');
    const from = madridDate(1);
    const to = madridDate(7);
    const expected = 7 * perDay;
    const response = await api.post('/studio/api/backend/v2/editorial-plans/generate', {
      data: {
        siteId: guiatvSiteId,
        dateFrom: from,
        dateTo: to,
        timezone: 'Europe/Madrid',
        channels: ['website'],
        articlesPerDay: perDay,
        strategyMode: 'seo-growth',
        primaryIntent: 'informational',
        contentFormats: ['guide', 'ranking', 'where-to-watch'],
        language: 'es',
      },
      timeout: 120_000,
    });
    expect(response.status(), `plan generation must be accepted (${await response.text()})`).toBe(202);
    const accepted = (await response.json()) as { planId: string; operationId: string; expectedCount: number; slots: Array<{ localDate: string }> };
    expect(accepted.planId).toBeTruthy();
    expect(accepted.operationId, 'async contract exposes a durable operation').toBeTruthy();
    expect(accepted.expectedCount).toBe(expected);
    expect(new Set(accepted.slots.map((slot) => slot.localDate)).size).toBe(7);

    // Poll the durable operation (the same contract the Studio uses) to a terminal state.
    let operation: { status: string; completedSteps: number; totalSteps: number } | null = null;
    await waitFor(async () => {
      const opResponse = await api.get(`/studio/api/backend/v2/operations/${accepted.operationId}`);
      if (opResponse.status() !== 200) return false;
      operation = await opResponse.json();
      return !['queued', 'running', 'retrying'].includes(operation!.status);
    }, 'plan generation operation');
    const planResponse = await api.get(`/studio/api/backend/v2/editorial-plans/${accepted.planId}`);
    const plan = (await planResponse.json()) as PlanView & { items: Array<PlanView['items'][number] & { scheduledFor: string }> };

    // No tolerance: every slot must be filled, otherwise the plan is partial and this fails.
    expect(plan.status, `plan error: ${plan.error}`).toBe('ready');
    expect(operation!.status).toBe('succeeded');
    expect(plan.items.length).toBe(expected);
    const perDate = new Map<string, number>();
    for (const item of plan.items) {
      const date = madridLocalDate(item.scheduledFor);
      perDate.set(date, (perDate.get(date) ?? 0) + 1);
      expect(item.relevanceScore ?? 0).toBeGreaterThanOrEqual(45);
      expect(item.contentType).toBeTruthy();
      expect(item.primaryIntent).toBeTruthy();
      expect(item.recommendedWordCountMin ?? 0).toBeGreaterThan(0);
      expect(item.outline).toBeTruthy();
    }
    expect([...perDate.keys()].sort()).toEqual(accepted.slots.map((slot) => slot.localDate).filter((d, i, all) => all.indexOf(d) === i));
    expect([...perDate.values()].every((count) => count === perDay)).toBe(true);

    // CAL-01: proposals appear in the calendar before any publication exists.
    const calendar = await api.get(`/studio/api/backend/v2/calendar?from=${encodeURIComponent(plan.items[0].scheduledFor)}&to=${encodeURIComponent(new Date(Date.parse(plan.items[plan.items.length - 1].scheduledFor) + 1).toISOString())}&siteId=${guiatvSiteId}`);
    const events = ((await calendar.json()) as { items: Array<{ kind: string; planId: string | null }> }).items.filter((event) => event.kind === 'plan_item' && event.planId === plan.id);
    expect(events.length).toBe(expected);
  });
}

function madridLocalDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));
}

test('3. Brief → content: approve one row and generate a deep, semantic article', async () => {
  const plans = await api.get('/studio/api/backend/v2/editorial-plans?page=1&pageSize=5');
  const list = (await plans.json()) as { items: Array<{ id: string; siteId: string | null; items?: PlanView['items'] }> };
  const recent = list.items.find((entry) => entry.siteId === guiatvSiteId);
  expect(recent).toBeTruthy();
  const detail = (await api.get(`/studio/api/backend/v2/editorial-plans/${recent!.id}`)).json() as Promise<PlanView>;
  const plan = await detail;
  const candidate = plan.items.find((item) => item.status === 'proposed' && !item.projectId);
  expect(candidate).toBeTruthy();

  const approve = await api.post(`/studio/api/backend/v2/editorial-plan-items/${candidate!.id}/approve`, {});
  expect(approve.status()).toBe(200);

  const generate = await api.post(`/studio/api/backend/v2/editorial-plan-items/${candidate!.id}/generate-content`, {});
  expect(generate.status()).toBe(202);
  const generated = (await generate.json()) as { item: { projectId: string | null }; project: { id: string } };
  const projectId = generated.project.id;
  goldenProjectId = projectId;
  expect(projectId).toBeTruthy();

  let article: {
    wordCount: number;
    bodyHtml: string;
    seoTitle: string | null;
    qaState: string;
    qaReport?: { passed: boolean; score?: number };
  } | null = null;
  await waitFor(async () => {
    const projectResponse = await api.get(`/studio/api/backend/v2/projects/${projectId}`);
    if (projectResponse.status() !== 200) return false;
    const project = (await projectResponse.json()) as { latestVersion: { wordCount: number; bodyHtml: string; seoTitle: string | null; qaState: string; qaReport?: { passed: boolean; score?: number } } | null };
    const version = project.latestVersion;
    if (!version?.bodyHtml) return false;
    if (!['passed', 'failed', 'approved'].includes(version.qaState)) return false;
    article = version;
    return true;
  }, 'article generation and QA');

  expect(article!.qaState).toBe('passed');
  expect(article!.wordCount).toBeGreaterThanOrEqual(500);
  expect(article!.bodyHtml.toLowerCase()).toContain('<h2');
  expect(article!.bodyHtml.toLowerCase()).toContain('<p');
  expect(article!.qaReport?.passed).toBe(true);
  expect(typeof article!.qaReport?.score).toBe('number');
});

test('4. Publishing fidelity: save to GuiaTV as draft and verify destination metadata', async () => {
  const projectId = goldenProjectId;
  expect(projectId, 'golden path article must exist').toBeTruthy();

  // Editorial approval is a production gate: QA passed → approve → publish.
  const approve = await api.post(`/studio/api/backend/v2/projects/${projectId}/approve`, {});
  expect(approve.status(), `version approval must succeed (${await approve.text()})`).toBe(200);

  const publish = await api.post(`/studio/api/backend/v2/projects/${projectId}/publish`, {
    data: { action: 'update', targetStatus: 'draft' },
  });
  expect([200, 201, 202], `draft publication must be accepted (${await publish.text()})`).toContain(publish.status());

  let publication: { id: string; status: string; externalId: string | null; externalUrl: string | null; error: string | null } | null = null;
  await waitFor(async () => {
    const jobResponse = await api.get(`/studio/api/backend/v2/projects/${projectId}`);
    const project = (await jobResponse.json()) as { latestPublicationJob: { id: string; status: string; externalId: string | null; externalUrl: string | null; error: string | null } | null };
    const job = project.latestPublicationJob;
    if (!job) return false;
    if (['queued', 'processing', 'publishing'].includes(job.status)) return false;
    publication = job;
    return true;
  }, 'draft publication to GuiaTV');

  // A draft publication to GuiaTV terminates in `draft_synced`; a live
  // publish terminates in `published`. Both prove destination fidelity.
  expect(['draft_synced', 'published'], `publication must reach a healthy terminal state (${publication!.status})`).toContain(publication!.status);
  expect(publication!.externalId).toBeTruthy();
  expect(publication!.error ?? null).toBeNull();
  expect(publication!.externalUrl).toBeTruthy();
});
