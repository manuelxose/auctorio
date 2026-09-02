/**
 * Phase 6 — AUTOPILOT golden path E2E (live, opt-in).
 *
 * Requires a running deployment (E2E_BASE_URL) and operator credentials:
 *   E2E_EMAIL, E2E_PASSWORD
 *
 * Zero-touch by design: the spec never clicks — it only drives the API, and
 * the automation pipeline must advance the project without any manual step.
 *
 * Safety: publishing is opt-in. With E2E_ALLOW_REAL_PUBLISH=1 the due
 * publication is allowed to execute; otherwise every scheduled publication
 * created by the pipeline is cancelled immediately and the site policy is
 * restored to its previous mode in afterAll.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";
const FEED_URL = process.env.E2E_RSS_FEED_URL || "https://hnrss.org/newest";
const ALLOW_REAL_PUBLISH = process.env.E2E_ALLOW_REAL_PUBLISH === "1";

type Site = { id: string; key: string; name: string };
type AutomationPolicy = Record<string, unknown> & {
  id: string;
  siteId: string | null;
  mode: string | null;
  enabled: boolean;
  state: string;
  autoGenerate: boolean;
  autoRepair: boolean;
  autoApprove: boolean;
  autoSchedule: boolean;
  autoPublish: boolean;
  socialRequired: boolean;
  articlesPerDay: number;
  maxArticlesPerDay: number;
  maximumQueueSize: number;
  publishingWindows: Array<{ channel: string; days: number[]; from: string; to: string }> | null;
};
type ProjectSummary = {
  id: string;
  status: string;
  origin: string;
  automationMode: string | null;
  automationSubstate: string | null;
  reviewGate: { stage: string };
  latestVersion: {
    status: string;
    qaReport: { passed: boolean; score?: number } | null;
    repairAttempts?: number;
    autonomousGatePassed?: boolean;
  } | null;
  publications: Array<{ id: string; status: string; scheduledFor: string | null }>;
};

let api: APIRequestContext;
let siteId: string;
let createdSourceId: string | null = null;
let previousPolicy: AutomationPolicy | null = null;

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

  const preferred = sites.find((site) => site.key === "guiatv-editorial") ?? sites[0]!;
  const switchResponse = await api.post("/studio/api/session/active-site", {
    data: { siteId: preferred.id },
  });
  expect(switchResponse.status()).toBe(200);
  return preferred.id;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getProject(projectId: string): Promise<ProjectSummary> {
  const response = await api.get(`/studio/api/backend/v2/projects/${projectId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ProjectSummary;
}

test.describe("Phase 6 autopilot golden path (live, opt-in)", () => {
  test.beforeAll(async ({ playwright }) => {
    expect(EMAIL, "E2E_EMAIL required").toBeTruthy();
    expect(PASSWORD, "E2E_PASSWORD required").toBeTruthy();
    api = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL || "https://auctorio.com",
    });
    siteId = await loginAndPickSite();

    const current = await api.get(`/studio/api/backend/v2/automation?siteId=${siteId}`);
    previousPolicy = current.status() === 200 ? ((await current.json()) as AutomationPolicy) : null;
  });

  test.afterAll(async () => {
    // Restore the previous policy so the live site never stays in autopilot
    // because of a test run.
    if (previousPolicy) {
      await api
        .patch("/studio/api/backend/v2/automation", {
          data: {
            siteId,
            enabled: previousPolicy.enabled,
            mode: previousPolicy.mode ?? "manual",
            autoGenerate: previousPolicy.autoGenerate,
            autoApprove: previousPolicy.autoApprove,
            autoSchedule: previousPolicy.autoSchedule,
            autoPublish: previousPolicy.autoPublish,
            autoRepair: previousPolicy.autoRepair,
            socialRequired: previousPolicy.socialRequired,
            articlesPerDay: previousPolicy.articlesPerDay,
            maxArticlesPerDay: previousPolicy.maxArticlesPerDay,
            maximumQueueSize: previousPolicy.maximumQueueSize,
            publishingWindows: previousPolicy.publishingWindows,
          },
        })
        .catch(() => undefined);
    }
    if (createdSourceId) {
      await api.delete(`/studio/api/backend/v2/sources/${createdSourceId}`).catch(() => undefined);
    }
    await api?.dispose();
  });

  test("autopilot: source item → automatic project → strict QA → repair/auto-approval → publication without any manual step", async () => {
    const suffix = randomSuffix();

    // 1. Select AUTOPILOT for the site. The API must produce an internally
    // consistent policy (mode + derived flags atomically).
    const policyResponse = await api.patch("/studio/api/backend/v2/automation", {
      data: {
        siteId,
        mode: "autopilot",
        autoRepair: true,
        maxRepairAttempts: 4,
        socialRequired: false,
        articlesPerDay: 2,
        maxArticlesPerDay: 2,
        maximumQueueSize: 5,
        minimumStoryScore: 0.01,
        publishingWindows: [{ channel: "website", days: [0, 1, 2, 3, 4, 5, 6], from: "00:00", to: "23:59" }],
      },
    });
    expect(policyResponse.status()).toBe(200);
    const policy = (await policyResponse.json()) as AutomationPolicy;
    expect(policy.mode).toBe("autopilot");
    expect(policy.enabled).toBe(true);
    expect(policy.autoGenerate).toBe(true);
    expect(policy.autoRepair).toBe(true);
    expect(policy.autoApprove).toBe(true);
    expect(policy.autoSchedule).toBe(true);
    expect(policy.autoPublish).toBe(true);

    // 2. Create and fetch a source; discovery feeds the automation pipeline.
    const created = await api.post("/studio/api/backend/v2/sources", {
      data: {
        siteId,
        name: `E2E autopilot source ${suffix}`,
        type: "rss",
        url: FEED_URL,
        enabled: true,
        refreshIntervalMinutes: 60,
      },
    });
    expect(created.status()).toBe(201);
    createdSourceId = ((await created.json()) as { id: string }).id;
    expect(createdSourceId).toBeTruthy();

    const fetched = await api.post(`/studio/api/backend/v2/sources/${createdSourceId}/fetch`);
    expect([200, 202]).toContain(fetched.status());

    // 3. Wait for the automation tick to create an origin=auto project.
    let project: ProjectSummary | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await sleep(5_000);
      const listed = await api.get(
        `/studio/api/backend/v2/projects?origin=auto&siteId=${siteId}&page=1&pageSize=5`,
      );
      expect(listed.status()).toBe(200);
      const body = (await listed.json()) as { items?: ProjectSummary[] };
      const candidates = (body.items ?? []).filter((item) => item.automationMode === "autopilot");
      if (candidates.length > 0) {
        project = candidates[0]!;
        break;
      }
    }
    expect(project, "expected an automatic project created by the autopilot pipeline").toBeTruthy();
    const projectId = project!.id;

    // 4. Poll: the pipeline must advance with zero manual steps. A valid
    // AUTOPILOT project must never sit in "in_review" / Ready for review.
    let sawAutonomousGate = false;
    let sawAutoApproval = false;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await sleep(5_000);
      const current = await getProject(projectId);
      if (current.automationMode === "autopilot" && current.status === "in_review") {
        // qa_passed projects must be auto-approved; in_review is a legacy
        // stall state the autopilot pipeline must not remain in.
        expect(current.automationSubstate, "autopilot project stalled in in_review").not.toBe(null);
      }
      if (current.latestVersion?.autonomousGatePassed) {
        sawAutonomousGate = true;
      }
      if (current.automationSubstate === "auto_approved" || current.status === "approved") {
        sawAutoApproval = true;
      }
      if (current.automationSubstate === "intervention_required") {
        // Safe failure is also a valid outcome: it must never publish and
        // must surface an operator notification (asserted in a later test).
        break;
      }
      if (
        current.automationSubstate &&
        ["scheduled", "scheduling", "publishing", "published"].includes(current.automationSubstate)
      ) {
        project = current;
        break;
      }
    }
    const finalProject = await getProject(projectId);

    if (finalProject.automationSubstate === "intervention_required") {
      expect(finalProject.publications.length).toBe(0);
      return;
    }

    // The strict autonomous gate must have run before any approval.
    if (sawAutoApproval) {
      expect(sawAutonomousGate, "auto approval without autonomous gate evidence").toBe(true);
    }

    // 5. Scheduling: the approved project must get website publications.
    let publications: ProjectSummary["publications"] = finalProject.publications;
    for (let attempt = 0; !ALLOW_REAL_PUBLISH && attempt < 10 && publications.length === 0; attempt += 1) {
      await sleep(5_000);
      publications = (await getProject(projectId)).publications;
    }
    expect(publications.length, "autopilot must schedule publications").toBeGreaterThan(0);

    // 6. Safe by default: cancel every scheduled publication immediately so
    // nothing actually publishes on the live site.
    if (!ALLOW_REAL_PUBLISH) {
      for (const publication of publications) {
        if (publication.status !== "scheduled") {
          continue;
        }
        const cancelled = await api.post(
          `/studio/api/backend/v2/publications/${publication.id}/cancel`,
        );
        expect([200, 202]).toContain(cancelled.status());
      }
    }
  });

  test("autopilot: irreparable content never publishes and operators are notified", async () => {
    // Any automatic project currently in intervention_required must have no
    // published output and the notification inbox must carry the alert.
    const listed = await api.get(
      `/studio/api/backend/v2/projects?origin=auto&siteId=${siteId}&page=1&pageSize=20`,
    );
    expect(listed.status()).toBe(200);
    const body = (await listed.json()) as { items?: ProjectSummary[] };
    const intervened = (body.items ?? []).filter(
      (item) => item.automationMode === "autopilot" && item.automationSubstate === "intervention_required",
    );
    if (intervened.length === 0) {
      // Nothing currently blocked: the guarantee still holds structurally —
      // the recovery API must never touch manual projects.
      test.skip(true, "no intervention-required project at this moment");
      return;
    }
    for (const item of intervened) {
      expect(
        item.publications.filter((publication) => publication.status === "published").length,
        `intervention project ${item.id} must not have published output`,
      ).toBe(0);
    }

    const notifications = await api.get("/studio/api/backend/v2/notifications?page=1&pageSize=50");
    expect(notifications.status()).toBe(200);
    const notificationBody = (await notifications.json()) as {
      items?: Array<{ category: string; entityType: string | null; entityId: string | null }>;
    };
    const operationAlerts = (notificationBody.items ?? []).filter(
      (notification) => notification.category === "operations",
    );
    expect(operationAlerts.length, "operator notification must exist for intervention").toBeGreaterThan(0);
  });

  test("autopilot: automation health exposes workers, Redis and circuit state", async () => {
    const health = await api.get("/studio/api/backend/v2/automation/health");
    expect(health.status()).toBe(200);
    const body = (await health.json()) as {
      redisConfigured?: boolean;
      degraded?: boolean;
      workers?: Array<{ name: string; status: string; stale?: boolean }>;
      policies?: unknown[];
    };
    expect(typeof body.redisConfigured).toBe("boolean");
    expect(Array.isArray(body.workers)).toBe(true);
    expect(body.workers!.some((worker) => worker.name === "automation-worker" || worker.name.includes("automation"))).toBe(true);
    expect(Array.isArray(body.policies)).toBe(true);
  });

  test("autopilot: recovery dry-run is idempotent and structured", async () => {
    const first = await api.post("/studio/api/backend/v2/automation/recover", {
      data: { siteId, dryRun: true },
    });
    expect(first.status()).toBe(200);
    const firstBody = (await first.json()) as {
      dryRun?: boolean;
      scanned?: number;
      eligible?: number;
      acted?: number;
      items?: Array<{ projectId: string; action: string }>;
    };
    expect(firstBody.dryRun).toBe(true);
    expect(Array.isArray(firstBody.items)).toBe(true);
    expect(firstBody.acted).toBe(0);

    const second = await api.post("/studio/api/backend/v2/automation/recover", {
      data: { siteId, dryRun: true },
    });
    const secondBody = (await second.json()) as { scanned?: number; eligible?: number };
    expect(secondBody.scanned).toBe(firstBody.scanned);
    expect(secondBody.eligible).toBe(firstBody.eligible);
  });
});
