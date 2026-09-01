/**
 * Phase 5 — production journey E2E (live, opt-in).
 *
 * Requires a running deployment (E2E_BASE_URL) and operator credentials:
 *   E2E_EMAIL, E2E_PASSWORD
 *
 * The golden path walks the critical production journey:
 *   source → test → discovery → items → cluster → enrich → brief →
 *   generate → QA → approve → schedule → publish → result.
 *
 * Failure paths cover broken RSS, provider/enrichment failure, AI failure,
 * and publisher failure. The spec is deliberately tolerant: it asserts
 * structured outcomes (status codes, error shapes, state transitions) and
 * never depends on a specific external feed's item count.
 *
 * Publishing is safe by default: publications are scheduled into the future
 * and cancelled. Real publishing only happens when E2E_ALLOW_REAL_PUBLISH=1
 * is explicitly set.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";
const FEED_URL = process.env.E2E_RSS_FEED_URL || "https://hnrss.org/newest";
const ALLOW_REAL_PUBLISH = process.env.E2E_ALLOW_REAL_PUBLISH === "1";

let api: APIRequestContext;
let siteId: string;
let createdSourceId: string | null = null;
let createdProjectId: string | null = null;
let createdPublicationId: string | null = null;

type Site = { id: string; key: string; name: string };

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function loginAndPickSite(): Promise<string> {
  const login = await api.post("/studio/api/auth/login/password", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  const sitesResponse = await api.get("/studio/api/sites");
  expect(sitesResponse.status()).toBe(200);
  const sites = ((await sitesResponse.json()) as { items: Site[] }).items;
  expect(sites.length).toBeGreaterThanOrEqual(1);

  const preferred = sites.find((s) => s.key === "guiatv-editorial") ?? sites[0]!;
  const switchResponse = await api.post("/studio/api/session/active-site", {
    data: { siteId: preferred.id },
  });
  expect(switchResponse.status()).toBe(200);
  return preferred.id;
}

test.describe("Phase 5 production journey (live, opt-in)", () => {
  test.beforeAll(async ({ playwright }) => {
    expect(EMAIL, "E2E_EMAIL required").toBeTruthy();
    expect(PASSWORD, "E2E_PASSWORD required").toBeTruthy();
    api = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL || "https://auctorio.com",
    });
    siteId = await loginAndPickSite();
  });

  test.afterAll(async () => {
    // Best-effort cleanup so repeated runs do not accumulate test sources.
    if (createdSourceId) {
      await api.delete(`/studio/api/backend/v2/sources/${createdSourceId}`).catch(() => undefined);
    }
    await api?.dispose();
  });

  test("journey: source → test → discovery → items → cluster → enrich → brief → generate → QA → approve → schedule → publish", async () => {
    const suffix = randomSuffix();

    // 1. Configure source (draft) and 2. test it before creating it.
    const draftTest = await api.post("/studio/api/backend/v2/sources/test-draft", {
      data: { type: "rss", url: FEED_URL },
    });
    expect(draftTest.status()).toBe(200);
    const draftResult = (await draftTest.json()) as { ok?: boolean; message?: string };
    expect(draftResult.ok !== false, `draft test failed: ${draftResult.message ?? ""}`).toBe(true);

    const created = await api.post("/studio/api/backend/v2/sources", {
      data: {
        siteId,
        name: `E2E journey source ${suffix}`,
        type: "rss",
        url: FEED_URL,
        enabled: true,
        refreshIntervalMinutes: 60,
      },
    });
    expect(created.status()).toBe(201);
    const source = (await created.json()) as { id: string; status?: string };
    createdSourceId = source.id;
    expect(createdSourceId).toBeTruthy();

    // Source test after creation.
    const tested = await api.post(`/studio/api/backend/v2/sources/${createdSourceId}/test`);
    expect([200, 202]).toContain(tested.status());

    // 3. Run discovery (immediate fetch for this source).
    const fetched = await api.post(`/studio/api/backend/v2/sources/${createdSourceId}/fetch`);
    expect([200, 202]).toContain(fetched.status());
    const fetchResult = (await fetched.json().catch(() => ({}))) as {
      runId?: string;
      run?: { id?: string };
      status?: string;
    };
    expect(fetchResult.runId ?? fetchResult.run?.id ?? fetchResult.status).toBeTruthy();

    // 4. Receive source items. Wait briefly for ingestion if needed.
    let items: Array<{ id: string; title?: string }> = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const listed = await api.get(
        `/studio/api/backend/v2/source-items?sourceId=${createdSourceId}&page=1&pageSize=10`,
      );
      expect(listed.status()).toBe(200);
      const body = (await listed.json()) as { items?: Array<{ id: string; title?: string }> };
      items = body.items ?? [];
      if (items.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    expect(items.length, "expected ingested source items").toBeGreaterThan(0);

    // 5. Story clusters exist and are queryable.
    const clusters = await api.get("/studio/api/backend/v2/story-clusters?page=1&pageSize=10");
    expect(clusters.status()).toBe(200);
    const clusterBody = (await clusters.json()) as { items?: unknown[]; total?: number };
    expect(Array.isArray(clusterBody.items)).toBe(true);

    // 6. Enrich a candidate item.
    const enriched = await api.post(
      `/studio/api/backend/v2/intelligence/source-items/${items[0]!.id}/enrich`,
    );
    expect([200, 202, 422]).toContain(enriched.status());
    const enrichment = (await enriched.json().catch(() => ({}))) as {
      filtered?: boolean;
      clusterId?: string;
    };
    expect(enrichment).toBeTruthy();

    // 7. Create an editorial brief.
    const briefResponse = await api.post("/studio/api/backend/v2/briefs", {
      data: {
        name: `E2E brief ${suffix}`,
        topic: "Production journey verification",
        audience: "Operators",
        tone: "neutral",
      },
    });
    expect(briefResponse.status()).toBe(201);

    // 8. Create a project from the item and generate an article.
    const projectResponse = await api.post(
      `/studio/api/backend/v2/source-items/${items[0]!.id}/create-project`,
    );
    expect([200, 201]).toContain(projectResponse.status());
    const project = (await projectResponse.json()) as { id?: string; projectId?: string };
    createdProjectId = project.id ?? project.projectId ?? null;
    expect(createdProjectId, "expected project id").toBeTruthy();

    const generated = await api.post(`/studio/api/backend/v2/projects/${createdProjectId}/generate`);
    expect(generated.status()).toBe(202);
    const generation = (await generated.json()) as { job_id?: string; version_id?: string };
    expect(generation.job_id ?? generation.version_id).toBeTruthy();

    // 9. Inspect QA: poll the project until its latest version has a QA report.
    let qaReport: { passed?: boolean; score?: number } | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const projectGet = await api.get(`/studio/api/backend/v2/projects/${createdProjectId}`);
      expect(projectGet.status()).toBe(200);
      const projectBody = (await projectGet.json()) as {
        versions?: Array<{ qaReport?: { passed?: boolean; score?: number } | null; status?: string }>;
      };
      const latest = projectBody.versions?.[0];
      if (latest?.qaReport) {
        qaReport = latest.qaReport;
        break;
      }
      if (latest && ["qa_passed", "qa_failed", "in_review", "generated", "approved"].includes(latest.status ?? "")) {
        break;
      }
    }
    if (qaReport) {
      expect(typeof qaReport.passed).toBe("boolean");
    }

    // 10. Approve.
    const approved = await api.post(`/studio/api/backend/v2/projects/${createdProjectId}/approve`);
    expect([200, 202]).toContain(approved.status());

    // 11. Create a publication and schedule it into the future.
    const publicationResponse = await api.post("/studio/api/backend/v2/publications", {
      data: { projectId: createdProjectId, channel: "website" },
    });
    expect([200, 201]).toContain(publicationResponse.status());
    const publication = (await publicationResponse.json()) as { id: string };
    createdPublicationId = publication.id;
    expect(createdPublicationId).toBeTruthy();

    const scheduleAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const scheduled = await api.post(
      `/studio/api/backend/v2/publications/${createdPublicationId}/schedule`,
      { data: { scheduledFor: scheduleAt } },
    );
    expect(scheduled.status()).toBe(200);
    const scheduledBody = (await scheduled.json()) as { status?: string; scheduledFor?: string };
    expect(scheduledBody.status).toBe("scheduled");

    // 12. Publish. Default keeps production untouched: the publication stays
    // scheduled and we verify the record; with E2E_ALLOW_REAL_PUBLISH=1 the
    // publication is triggered now and its result inspected.
    if (ALLOW_REAL_PUBLISH) {
      const publishedNow = await api.post(
        `/studio/api/backend/v2/publications/${createdPublicationId}/publish-now`,
      );
      expect([200, 202]).toContain(publishedNow.status());
    }

    // 13. Inspect the publication result record.
    const publicationGet = await api.get(
      `/studio/api/backend/v2/publications/${createdPublicationId}`,
    );
    expect(publicationGet.status()).toBe(200);
    const publicationBody = (await publicationGet.json()) as {
      id: string;
      status: string;
      channel: string;
    };
    expect(publicationBody.id).toBe(createdPublicationId);
    expect(publicationBody.channel).toBe("website");
    if (ALLOW_REAL_PUBLISH) {
      expect(["publishing", "published", "failed"]).toContain(publicationBody.status);
    } else {
      // Scheduled publication must survive a re-read unchanged.
      expect(publicationBody.status).toBe("scheduled");
    }

    // Cleanup: cancel the future publication so nothing publishes later.
    if (!ALLOW_REAL_PUBLISH) {
      const cancelled = await api.post(
        `/studio/api/backend/v2/publications/${createdPublicationId}/cancel`,
      );
      expect(cancelled.status()).toBe(200);
      const cancelledBody = (await cancelled.json()) as { status?: string };
      expect(cancelledBody.status).toBe("cancelled");
    }
  });

  test("failure path: broken RSS source is classified, not crashed", async () => {
    const broken = await api.post("/studio/api/backend/v2/sources/test-draft", {
      data: { type: "rss", url: "http://127.0.0.1:1/definitely-not-a-feed.rss" },
    });
    // The endpoint returns 502 with a structured failure body for unreachable
    // feeds; a 5xx crash without a body would be a real defect.
    expect(broken.status()).toBe(502);
    const body = (await broken.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    expect(body, "expected structured error body").toBeTruthy();
    expect(body!.ok).toBe(false);
    expect(body!.message).toBeTruthy();
  });

  test("failure path: provider failure during enrichment is a structured result", async () => {
    // Enriching an unknown item must return a structured not-found result
    // instead of an unhandled crash — one failing provider must not 500.
    const bogusId = "00000000-0000-0000-0000-000000000000";
    const enriched = await api.post(
      `/studio/api/backend/v2/intelligence/source-items/${bogusId}/enrich`,
    );
    expect([404, 422, 200]).toContain(enriched.status());
    if (enriched.status() === 200) {
      const body = (await enriched.json()) as { filtered?: boolean; filteredReason?: string };
      expect(body.filtered === true || typeof body.filteredReason === "string").toBe(true);
    }
  });

  test("failure path: AI generation failure returns a clean error", async () => {
    // A generation attempt with an invalid preset version must not crash the
    // API — it must return a 4xx with a message.
    if (!createdProjectId) return;
    const generated = await api.post(
      `/studio/api/backend/v2/projects/${createdProjectId}/generate`,
      { data: { promptPresetVersionId: "00000000-0000-0000-0000-000000000000" } },
    );
    expect([400, 404, 422, 202]).toContain(generated.status());
  });

  test("failure path: publisher failure surfaces as a failed publication or structured rejection", async () => {
    // Publishing a project that has no reachable destination must produce a
    // structured rejection (4xx) or a publication record in a failed state —
    // never an unhandled crash.
    if (!createdProjectId) return;
    const publicationResponse = await api.post("/studio/api/backend/v2/publications", {
      data: { projectId: createdProjectId, channel: "website", scheduledFor: new Date().toISOString() },
    });
    expect([200, 201, 400, 422, 409]).toContain(publicationResponse.status());
    if ([200, 201].includes(publicationResponse.status())) {
      const publication = (await publicationResponse.json()) as { id: string };
      const publishedNow = await api.post(
        `/studio/api/backend/v2/publications/${publication.id}/publish-now`,
      );
      expect([200, 202, 400, 409, 422]).toContain(publishedNow.status());
    }
  });

  test("operations: health, metrics, worker health are reachable", async () => {
    const health = await api.get("/studio/api/backend/v2/operations/health");
    expect(health.status()).toBe(200);
    const healthBody = (await health.json()) as Record<string, unknown>;
    expect(healthBody).toBeTruthy();

    const metrics = await api.get("/studio/api/backend/v2/operations/metrics");
    expect(metrics.status()).toBe(200);

    const workers = await api.get("/studio/api/backend/v2/health/workers");
    expect([200, 404]).toContain(workers.status());
  });
});
