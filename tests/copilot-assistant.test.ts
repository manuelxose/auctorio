// Contextual assistant: tools, permissions, tenant isolation (SEC-01) and the
// pending -> confirm / cancel lifecycle of write actions.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { STUDIO_PERMISSIONS } from "../src/studio/security";
import { CopilotError, sendMessage } from "../src/studio/copilot/copilot";
import { loadEditorialContext } from "../src/studio/copilot/assistant-context";
import { cancelAction, chooseTool, confirmAction, prepareAction, proposeAction, routeIntent } from "../src/studio/copilot/assistant";
import { weaknessFindings } from "../src/studio/copilot/tools";

process.env.TEXT_PROVIDER = "mock";
const prisma = getPrismaClient();
const never = () => false;

type Fixture = { tenantId: string; siteId: string; planId: string; itemIds: string[] };

async function createFixture(): Promise<Fixture> {
  const seed = `asst-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: `Site ${seed}`, type: "guiatv", locale: "es-ES", baseUrl: "https://example.test" } });
  const plan = await prisma.editorialPlan.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      name: `Plan ${seed}`,
      status: "partial",
      dateFrom: new Date("2026-11-16T00:00:00Z"),
      dateTo: new Date("2026-11-20T23:59:00Z"),
      timezone: "UTC",
      generatedOutput: { requestedCount: 4, unfilledSlots: [{ localDate: "2026-11-19", localTime: "09:00", scheduledFor: "2026-11-19T09:00:00.000Z", reason: "no_valid_brief" }] },
    },
  });
  const items = await Promise.all(
    [
      { title: "Champions league fixtures tonight guide", day: "2026-11-16", evidence: [{ title: "UEFA calendar", url: "https://uefa.example/cal" }], cluster: "football" },
      { title: "Champions league fixtures tonight preview", day: "2026-11-17", evidence: null, cluster: "football" },
      { title: "Weekend film premieres", day: "2026-11-18", evidence: null, cluster: "football" },
    ].map((entry) =>
      prisma.editorialPlanItem.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          siteId: site.id,
          title: entry.title,
          channel: "website",
          scheduledFor: new Date(`${entry.day}T09:00:00Z`),
          topicCluster: entry.cluster,
          rationale: "Seasonal demand",
          relevanceScore: 0.8,
          ...(entry.evidence ? { sourceEvidence: entry.evidence } : {}),
        },
      }),
    ),
  );
  return { tenantId: tenant.id, siteId: site.id, planId: plan.id, itemIds: items.map((item) => item.id) };
}

const editor = (tenantId: string, userId: string = randomUUID()) => ({ tenantId, userId, permissions: ["projects.manage", "analytics.read"] });
const viewer = (tenantId: string, userId: string = randomUUID()) => ({ tenantId, userId, permissions: ["analytics.read"] });

/** Audit rows reference a real Studio user. */
async function makeUser(tenantId: string): Promise<string> {
  const email = `asst-${randomUUID()}@example.test`;
  const account = await prisma.studioAccount.create({ data: { email } });
  const user = await prisma.studioUser.create({ data: { tenantId, accountId: account.id, email, displayName: "Assistant test", status: "active" } });
  return user.id;
}

let a: Fixture;
let b: Fixture;

test.before(async () => {
  a = await createFixture();
  b = await createFixture();
});

test.after(async () => {
  await prisma.$disconnect();
});

test("routeIntent maps explicit commands to write tools and questions to read tools", () => {
  assert.deepEqual(routeIntent('Set title "A better headline"'), { tool: "update_proposal", args: { title: "A better headline" } });
  assert.deepEqual(routeIntent('Set seo title: "Short SEO title"')?.args, { seoTitle: "Short SEO title" });
  assert.deepEqual(routeIntent("move it to 2026-11-21 with priority 5")?.args, { priority: 5, scheduledFor: "2026-11-21" });
  assert.equal(routeIntent("Regenerate this proposal")?.tool, "regenerate_proposal");
  assert.equal(routeIntent("Fill the missing slots")?.tool, "fill_missing_slots");
  assert.equal(routeIntent("propose source example.org because it covers local fixtures")?.tool, "propose_source");
  assert.equal(routeIntent("What are the weaknesses of this plan?")?.tool, "find_plan_weaknesses");
  assert.equal(routeIntent("Why did the last generation job fail?")?.tool, "explain_failed_job");
  assert.equal(routeIntent("Suggest a cadence")?.tool, "suggest_cadence");
  assert.deepEqual(routeIntent("Suggest proposals for 2026-11-19"), { tool: "suggest_proposals_for_day", args: { date: "2026-11-19" } });
  assert.equal(routeIntent("Why is this proposal relevant?")?.tool, "explain_proposal_relevance");
  assert.equal(routeIntent("Explain the strategy")?.tool, "explain_strategy");
  assert.equal(routeIntent("hello"), null);
});

test("weaknessFindings computes gaps from data", () => {
  const findings = weaknessFindings(
    { dateFrom: new Date("2026-11-16T00:00:00Z"), dateTo: new Date("2026-11-19T23:00:00Z"), timezone: "UTC", generatedOutput: { unfilledSlots: [{ localDate: "2026-11-19", localTime: "09:00", scheduledFor: "", reason: "" }] }, relevanceThreshold: null },
    [
      { id: "1", title: "Champions league fixtures tonight guide", status: "proposed", scheduledFor: new Date("2026-11-16T09:00:00Z"), topicCluster: "a", sourceEvidence: [{}], relevanceScore: 1 },
      { id: "2", title: "Champions league fixtures tonight preview", status: "proposed", scheduledFor: new Date("2026-11-16T12:00:00Z"), topicCluster: "a", sourceEvidence: null, relevanceScore: 1 },
    ],
  );
  const text = findings.map((finding) => finding.message).join(" | ");
  assert.match(text, /1 slot\(s\) have no proposal \(2026-11-19\)/);
  assert.match(text, /3 day\(s\) in the plan range have no active proposal \(2026-11-17, 2026-11-18, 2026-11-19\)/);
  assert.match(text, /near-duplicate/);
  assert.match(text, /1 of 2 active proposal\(s\) have no stored evidence/);
});

test("deterministic router answers read tools with real plan data", async () => {
  const actor = editor(a.tenantId, await makeUser(a.tenantId));
  const response = await sendMessage(actor, { content: "What are the weaknesses of this plan?", context: { siteId: a.siteId, planId: a.planId } }, never);
  const message = response.message;
  assert.equal(message.status, "completed");
  assert.equal(message.competencyKey, "tool:find_plan_weaknesses");
  assert.equal(message.provider, "deterministic");
  assert.match(message.content, /3 active proposal\(s\)/);
  assert.match(message.content, /deterministic intent router/);
  const findings = (message.evidence as { findings: Array<{ message: string }>; answeredBy: string }).findings.map((finding) => finding.message).join(" | ");
  assert.match(findings, /1 slot\(s\) have no proposal \(2026-11-19\)/);
  assert.match(findings, /near-duplicate/);
  assert.match(findings, /2 of 3 active proposal\(s\) have no stored evidence/);
  assert.match(findings, /Cluster imbalance: "football" holds 3 of 3/);
  // The plan is partial with an unfilled slot, so a fill action is offered as pending, not executed.
  assert.equal(message.actions.length, 1);
  assert.equal(message.actions[0].tool, "fill_missing_slots");
  assert.equal(message.actions[0].status, "pending");

  const relevance = await sendMessage(actor, { threadId: response.threadId, content: "Why is this proposal relevant?", context: { planItemId: a.itemIds[1] } }, never);
  assert.match(relevance.message.content, /Seasonal demand/);
  assert.match(JSON.stringify(relevance.message.evidence), /No evidence is stored for this proposal/);
});

test("viewer cannot stage or confirm write tools", async () => {
  const userId = await makeUser(a.tenantId);
  const response = await sendMessage(viewer(a.tenantId, userId), { content: 'Set title "Viewer rename"', context: { planItemId: a.itemIds[0] } }, never);
  assert.match(response.message.content, /needs the \*\*projects\.manage\*\* permission/);
  assert.equal(response.message.actions.length, 0);
  assert.equal(await prisma.copilotAction.count({ where: { tenantId: a.tenantId, studioUserId: userId } }), 0);

  // Same user, role downgraded after the action was staged: confirm is refused and nothing runs.
  const ctx = await loadEditorialContext(a.tenantId, { planItemId: a.itemIds[0] });
  const staged = await proposeAction(editor(a.tenantId, userId), await prepareAction(editor(a.tenantId, userId), ctx, "update_proposal", { title: "Should not apply" }), { threadId: null, messageId: null });
  await assert.rejects(confirmAction(viewer(a.tenantId, userId), staged.id), (error: unknown) => error instanceof CopilotError && error.status === 403);
  assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: staged.id } })).status, "pending");
  assert.notEqual((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: a.itemIds[0] } })).title, "Should not apply");
});

test("ids from another tenant are rejected (SEC-01)", async () => {
  const actor = editor(b.tenantId, await makeUser(b.tenantId));
  await assert.rejects(loadEditorialContext(b.tenantId, { planId: a.planId }), (error: unknown) => error instanceof CopilotError && error.status === 404);
  await assert.rejects(sendMessage(actor, { content: "Explain the strategy", context: { planItemId: a.itemIds[0] } }, never), (error: unknown) => error instanceof CopilotError && error.status === 404);
  await assert.rejects(sendMessage(actor, { content: "Explain the strategy", context: { siteId: a.siteId } }, never), (error: unknown) => error instanceof CopilotError && error.status === 404);
  // An id smuggled into tool args (e.g. by a model) is checked against the tenant too.
  const ownCtx = await loadEditorialContext(b.tenantId, { planId: b.planId });
  await assert.rejects(prepareAction(actor, ownCtx, "update_proposal", { itemId: a.itemIds[0], title: "x y" }), (error: unknown) => error instanceof CopilotError && error.status === 404);
  // A plan from tenant B combined with a site from tenant A never resolves.
  await assert.rejects(loadEditorialContext(b.tenantId, { planId: b.planId, siteId: a.siteId }), CopilotError);
  // Tenant A's action cannot be confirmed by tenant B, even with the same user id.
  const userId = await makeUser(a.tenantId);
  const ctx = await loadEditorialContext(a.tenantId, { planItemId: a.itemIds[2] });
  const staged = await proposeAction(editor(a.tenantId, userId), await prepareAction(editor(a.tenantId, userId), ctx, "update_proposal", { priority: 7 }), { threadId: null, messageId: null });
  await assert.rejects(confirmAction(editor(b.tenantId, userId), staged.id), (error: unknown) => error instanceof CopilotError && error.status === 404);
  await assert.rejects(cancelAction(editor(b.tenantId, userId), staged.id), (error: unknown) => error instanceof CopilotError && error.status === 404);
});

test("confirm executes a pending action exactly once and audits it", async () => {
  const actor = editor(a.tenantId, await makeUser(a.tenantId));
  const response = await sendMessage(actor, { content: 'Set title "Champions league: the definitive fixtures guide" and priority 9', context: { planItemId: a.itemIds[0] } }, never);
  assert.equal(response.message.actions.length, 1);
  const action = response.message.actions[0];
  assert.equal(action.tool, "update_proposal");
  assert.equal(action.status, "pending");
  assert.match(action.summary, /title → Champions league: the definitive fixtures guide; priority → 9/);
  // Proposing changed nothing.
  assert.equal((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: a.itemIds[0] } })).priority, 0);

  const [first, second] = await Promise.all([confirmAction(actor, action.id), confirmAction(actor, action.id)]);
  assert.deepEqual([first.replayed, second.replayed].sort(), [false, true]);
  const executed = first.replayed ? second : first;
  assert.equal(executed.action.status, "confirmed");
  assert.deepEqual((executed.action.result as { updatedFields: string[] }).updatedFields, ["title", "priority"]);
  const third = await confirmAction(actor, action.id);
  assert.equal(third.replayed, true);
  assert.equal(third.action.status, "confirmed");

  const item = await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: a.itemIds[0] } });
  assert.equal(item.title, "Champions league: the definitive fixtures guide");
  assert.equal(item.priority, 9);
  const audits = await prisma.auditLog.groupBy({ by: ["action"], where: { tenantId: a.tenantId, entityId: action.id }, _count: { _all: true } });
  assert.deepEqual(Object.fromEntries(audits.map((row) => [row.action, row._count._all])), { "copilot.action.proposed": 1, "copilot.action.confirmed": 1 });
});

test("cancel prevents execution", async () => {
  const actor = editor(a.tenantId, await makeUser(a.tenantId));
  const before = await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: a.itemIds[2] } });
  const ctx = await loadEditorialContext(a.tenantId, { planItemId: a.itemIds[2] });
  const staged = await proposeAction(actor, await prepareAction(actor, ctx, "update_proposal", { title: "Cancelled rename" }), { threadId: null, messageId: null });
  assert.equal((await cancelAction(actor, staged.id)).status, "cancelled");
  assert.equal((await cancelAction(actor, staged.id)).status, "cancelled");
  await assert.rejects(confirmAction(actor, staged.id), (error: unknown) => error instanceof CopilotError && error.status === 409);
  assert.equal((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: a.itemIds[2] } })).title, before.title);
  assert.equal(await prisma.auditLog.count({ where: { tenantId: a.tenantId, entityId: staged.id, action: "copilot.action.cancelled" } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { tenantId: a.tenantId, entityId: staged.id, action: "copilot.action.confirmed" } }), 0);
});

test("an action stuck in executing is failed once stale and never re-run", async () => {
  const actor = editor(a.tenantId, await makeUser(a.tenantId));
  const ctx = await loadEditorialContext(a.tenantId, { planItemId: a.itemIds[2] });
  const staged = await proposeAction(actor, await prepareAction(actor, ctx, "update_proposal", { title: "Crashed rename" }), { threadId: null, messageId: null });
  await prisma.copilotAction.update({ where: { id: staged.id }, data: { status: "executing" } });
  const fresh = await confirmAction(actor, staged.id);
  assert.equal(fresh.action.status, "executing");
  await prisma.$executeRaw`UPDATE copilot_actions SET updated_at = now() - interval '1 hour' WHERE id = ${staged.id}::uuid`;
  const recovered = await confirmAction(actor, staged.id);
  assert.equal(recovered.action.status, "failed");
  assert.notEqual((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: a.itemIds[2] } })).title, "Crashed rename");
});

test("update_proposal validates the date against the plan and refuses items already in production", async () => {
  const actor = editor(a.tenantId, await makeUser(a.tenantId));
  const ctx = await loadEditorialContext(a.tenantId, { planItemId: a.itemIds[1] });
  const prepare = (args: Record<string, unknown>) => prepareAction(actor, ctx, "update_proposal", args);
  const refused = (status: number) => (error: unknown) => error instanceof CopilotError && error.status === status;
  await assert.rejects(prepare({ scheduledFor: "2026-12-30" }), refused(400));
  await assert.rejects(prepare({ scheduledFor: "2026-11-01" }), refused(400));
  const ok = await prepare({ scheduledFor: "2026-11-18" });
  assert.equal(ok.args.scheduledFor, "2026-11-18T09:00:00.000Z");
  await prisma.editorialPlan.update({ where: { id: a.planId }, data: { timezone: "Europe/Madrid" } });
  try {
    assert.equal((await prepare({ scheduledFor: "2026-11-18" })).args.scheduledFor, "2026-11-18T08:00:00.000Z");
  } finally {
    await prisma.editorialPlan.update({ where: { id: a.planId }, data: { timezone: "UTC" } });
  }
  const busy = await prisma.editorialPlanItem.create({
    data: { tenantId: a.tenantId, planId: a.planId, siteId: a.siteId, title: "Already generating item", channel: "website", status: "generating", scheduledFor: new Date("2026-11-17T09:00:00Z"), topicCluster: "x", rationale: "r", relevanceScore: 0.5 },
  });
  await assert.rejects(prepareAction(actor, await loadEditorialContext(a.tenantId, { planItemId: busy.id }), "update_proposal", { title: "Nope" }), refused(409));
});

test("propose_source stores an open recommendation and never activates it", async () => {
  const actor = { ...editor(b.tenantId, await makeUser(b.tenantId)), permissions: ["integrations.manage", "analytics.read"] };
  const response = await sendMessage(actor, { content: "Propose source https://www.Fixtures-Example.org/path as competitor because it covers local fixtures", context: { siteId: b.siteId } }, never);
  const action = response.message.actions[0];
  assert.equal(action.tool, "propose_source");
  assert.deepEqual(action.args, { domain: "fixtures-example.org", relationship: "competitor", reason: "it covers local fixtures" });
  assert.equal(await prisma.sourceRecommendation.count({ where: { tenantId: b.tenantId } }), 0);
  const { action: done } = await confirmAction(actor, action.id);
  assert.equal(done.status, "confirmed");
  const row = await prisma.sourceRecommendation.findFirstOrThrow({ where: { tenantId: b.tenantId, siteId: null, domain: "fixtures-example.org" } });
  assert.equal(row.status, "open");
  assert.equal(row.sourceId, null);
  assert.match(row.reasonSummary ?? "", /^\[competitor\] it covers local fixtures/);
  assert.equal(await prisma.contentSource.count({ where: { tenantId: b.tenantId, name: "fixtures-example.org" } }), 0);
  await assert.rejects(
    prisma.sourceRecommendation.create({ data: { tenantId: b.tenantId, domain: "fixtures-example.org", status: "open", score: 0, searchesCount: 0 } }),
    (error: unknown) => (error as { code?: string }).code === "P2002",
    "the null-site partial unique index rejects a duplicate domain",
  );
});

test("every permission referenced by tools exists", async () => {
  const { toolRegistry } = await import("../src/studio/copilot/tools");
  for (const tool of toolRegistry([], () => false)) {
    assert.ok((STUDIO_PERMISSIONS as readonly string[]).includes(tool.permission), tool.name);
    assert.equal(tool.confirmation, tool.kind === "write");
  }
});

test("a configured model chooses the tool; a failing model falls back to the router", async () => {
  const ctx = await loadEditorialContext(a.tenantId, { planId: a.planId });
  const model = { generate: async () => ({ output: '{"tool":"suggest_cadence","planId":null}', provider: "fake", model: "fake-1" }) };
  assert.deepEqual(await chooseTool("how should I pace this?", ctx, model), { tool: "suggest_cadence", args: {}, via: "model", provider: "fake", model: "fake-1" });
  const broken = { generate: async () => Promise.reject(new Error("down")) };
  assert.deepEqual(await chooseTool("Explain the strategy", ctx, broken), { tool: "explain_strategy", args: {}, via: "deterministic" });
  const none = { generate: async () => ({ output: '{"tool":"none"}', provider: "fake", model: "fake-1" }) };
  assert.equal(await chooseTool("hello there", ctx, none), null);
});
