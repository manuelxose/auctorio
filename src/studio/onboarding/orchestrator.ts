// Website editorial onboarding: one durable "site_onboarding" Operation per pass, steps from
// ONBOARDING_STEPS run in order, every step's result persisted on the site's SiteOnboardingRun.
// One run row per site: activation resumes it, retry re-runs from the first failed/skipped step,
// and earlier results are never wiped. Read-only discovery: nothing is generated or published.

import { Prisma, type SiteOnboardingRun } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { structuredEvent } from "../../shared/utils/logger";
import { publishEvent } from "../events";
import { notify } from "../notifications";
import { completeOperation, createOperation, failOperation, startOperation, touchOperationProgress } from "../operations";
import { ONBOARDING_STEPS, getOnboardingStep, type OnboardingStepId } from "./contracts";
import { registerBuiltInOnboardingSteps } from "./steps";

const prisma = getPrismaClient();

registerBuiltInOnboardingSteps();

export type OnboardingStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export type OnboardingStepState = {
  id: OnboardingStepId;
  status: OnboardingStepStatus;
  summary: string | null;
  counts: Record<string, number> | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type OnboardingRunView = {
  id: string;
  siteId: string;
  operationId: string | null;
  status: "running" | "succeeded" | "failed";
  trigger: string;
  steps: OnboardingStepState[];
  completedSteps: number;
  totalSteps: number;
  currentStep: OnboardingStepId | null;
  /** First failed or skipped step: where a retry would resume. */
  retryFrom: OnboardingStepId | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
};

export type OnboardingStart = {
  started: boolean;
  run: OnboardingRunView;
  operationId: string | null;
  promise: Promise<void>;
};

/** Without these, later steps have nothing to work on, so a failure stops the pass. */
const CRITICAL_STEPS = new Set<OnboardingStepId>(["index", "profile"]);
/** A "running" row not owned by this process and untouched this long was interrupted (e.g. restart). */
const STALE_RUNNING_MS = 30 * 60_000;
const active = new Map<string, Promise<void>>();

function pendingSteps(): OnboardingStepState[] {
  return ONBOARDING_STEPS.map((id) => ({ id, status: "pending", summary: null, counts: null, error: null, startedAt: null, finishedAt: null }));
}

function readSteps(value: Prisma.JsonValue): OnboardingStepState[] {
  const stored = Array.isArray(value) ? (value as unknown as OnboardingStepState[]) : [];
  // Always the full registry order, so steps added to the contract later show up as pending.
  return ONBOARDING_STEPS.map((id) => stored.find((step) => step?.id === id) ?? pendingSteps().find((step) => step.id === id)!);
}

function firstRetryIndex(steps: OnboardingStepState[], include: OnboardingStepStatus[]): number {
  return steps.findIndex((step) => include.includes(step.status));
}

export function toRunView(run: SiteOnboardingRun): OnboardingRunView {
  const steps = readSteps(run.steps);
  const retryIndex = firstRetryIndex(steps, ["failed", "skipped"]);
  return {
    id: run.id,
    siteId: run.siteId,
    operationId: run.operationId,
    status: run.status as OnboardingRunView["status"],
    trigger: run.trigger,
    steps,
    completedSteps: steps.filter((step) => step.status === "succeeded" || step.status === "skipped" || step.status === "failed").length,
    totalSteps: steps.length,
    currentStep: steps.find((step) => step.status === "running")?.id ?? null,
    retryFrom: retryIndex >= 0 ? steps[retryIndex].id : null,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    updatedAt: run.updatedAt.toISOString(),
  };
}

async function saveSteps(runId: string, steps: OnboardingStepState[], data: Prisma.SiteOnboardingRunUpdateInput = {}) {
  return prisma.siteOnboardingRun.update({ where: { id: runId }, data: { ...data, steps: steps as unknown as Prisma.InputJsonArray } });
}

export async function getSiteOnboarding(tenantId: string, siteId: string): Promise<OnboardingRunView | null> {
  const run = await prisma.siteOnboardingRun.findFirst({ where: { tenantId, siteId } });
  return run ? toRunView(run) : null;
}

async function requireSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true } });
  if (!site) throw new Error("site_not_found");
}

/** A running row that no process is executing any more is closed as failed so it can resume. */
async function closeIfInterrupted(run: SiteOnboardingRun): Promise<SiteOnboardingRun> {
  if (run.status !== "running" || active.has(run.siteId) || Date.now() - run.updatedAt.getTime() < STALE_RUNNING_MS) {
    return run;
  }
  const steps = readSteps(run.steps).map((step) =>
    step.status === "running" ? { ...step, status: "failed" as const, error: "Interrupted before it finished (service restart).", finishedAt: new Date().toISOString() } : step,
  );
  if (run.operationId) {
    await failOperation(run.operationId, { errorCode: "onboarding_interrupted", errorSummary: "Onboarding was interrupted.", retryable: true }).catch(() => undefined);
  }
  return saveSteps(run.id, steps, { status: "failed", finishedAt: new Date() });
}

function unchanged(run: SiteOnboardingRun): OnboardingStart {
  return { started: false, run: toRunView(run), operationId: run.operationId, promise: active.get(run.siteId) ?? Promise.resolve() };
}

/**
 * Start (or join) the onboarding of a site. Idempotent: a running pass is returned as-is, a
 * completed one is not repeated, a failed one resumes from its first failed step.
 */
export async function startSiteOnboarding(
  tenantId: string,
  siteId: string,
  userId: string | null,
  options: { trigger?: string } = {},
): Promise<OnboardingStart> {
  await requireSite(tenantId, siteId);
  const trigger = options.trigger ?? "manual";
  let run = await prisma.siteOnboardingRun.findFirst({ where: { tenantId, siteId } });
  if (!run) {
    let created: SiteOnboardingRun;
    try {
      created = await prisma.siteOnboardingRun.create({
        data: { tenantId, siteId, status: "running", trigger, steps: pendingSteps() as unknown as Prisma.InputJsonArray },
      });
    } catch (error) {
      // Lost a creation race (unique siteId): join the winner.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return unchanged(await prisma.siteOnboardingRun.findFirstOrThrow({ where: { tenantId, siteId } }));
      }
      throw error;
    }
    return execute(created, 0, userId, trigger);
  }
  run = await closeIfInterrupted(run);
  if (run.status === "running") return unchanged(run);
  const fromIndex = firstRetryIndex(readSteps(run.steps), ["failed", "pending"]);
  if (fromIndex < 0) return unchanged(run);
  return claimAndExecute(run, fromIndex, userId, trigger);
}

/** Re-run from the first failed or skipped step only; earlier results are kept. */
export async function retrySiteOnboarding(tenantId: string, siteId: string, userId: string | null): Promise<OnboardingStart & { fromStep: OnboardingStepId }> {
  await requireSite(tenantId, siteId);
  const found = await prisma.siteOnboardingRun.findFirst({ where: { tenantId, siteId } });
  if (!found) throw new Error("onboarding_not_found");
  const run = await closeIfInterrupted(found);
  if (run.status === "running") throw new Error("onboarding_running");
  const steps = readSteps(run.steps);
  let fromIndex = firstRetryIndex(steps, ["failed", "skipped"]);
  if (fromIndex < 0) fromIndex = firstRetryIndex(steps, ["pending"]);
  if (fromIndex < 0) throw new Error("onboarding_nothing_to_retry");
  const start = await claimAndExecute(run, fromIndex, userId, "retry");
  if (!start.started) throw new Error("onboarding_running");
  return { ...start, fromStep: steps[fromIndex].id };
}

async function claimAndExecute(run: SiteOnboardingRun, fromIndex: number, userId: string | null, trigger: string): Promise<OnboardingStart> {
  // Atomic claim so two concurrent starts never run the same site twice.
  const claimed = await prisma.siteOnboardingRun.updateMany({ where: { id: run.id, status: { not: "running" } }, data: { status: "running", trigger } });
  if (claimed.count === 0) return unchanged(await prisma.siteOnboardingRun.findUniqueOrThrow({ where: { id: run.id } }));
  return execute(run, fromIndex, userId, trigger);
}

async function execute(run: SiteOnboardingRun, fromIndex: number, userId: string | null, trigger: string): Promise<OnboardingStart> {
  try {
    return await beginPass(run, fromIndex, userId, trigger);
  } catch (error) {
    // Could not even open the operation: release the claim so a later start/retry can proceed.
    await prisma.siteOnboardingRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}

async function beginPass(run: SiteOnboardingRun, fromIndex: number, userId: string | null, trigger: string): Promise<OnboardingStart> {
  const { tenantId, siteId } = run;
  const steps = readSteps(run.steps).map((step, index) =>
    index >= fromIndex ? { ...step, status: "pending" as const, summary: null, counts: null, error: null, startedAt: null, finishedAt: null } : step,
  );
  const operation = await createOperation({
    tenantId,
    siteId,
    type: "site_onboarding",
    initiatorUserId: userId,
    entityType: "site",
    entityId: siteId,
    totalSteps: steps.length,
    metadata: { trigger, onboardingRunId: run.id, fromStep: steps[fromIndex].id },
  });
  await startOperation(operation.id, steps[fromIndex].id);
  await touchOperationProgress(operation.id, { completedSteps: fromIndex, phase: steps[fromIndex].id });
  const updated = await saveSteps(run.id, steps, { operationId: operation.id, status: "running", trigger, finishedAt: null, ...(fromIndex === 0 ? { startedAt: new Date() } : {}) });
  await publishEvent({ tenantId, siteId, type: "operation.created", payload: { operationId: operation.id, type: "site_onboarding" } });
  structuredEvent("site_onboarding.started", { tenantId, siteId, operationId: operation.id, fromStep: steps[fromIndex].id, trigger });

  const promise = runSteps(run.id, tenantId, siteId, userId, operation.id, steps, fromIndex).finally(() => active.delete(siteId));
  active.set(siteId, promise);
  return { started: true, run: toRunView(updated), operationId: operation.id, promise };
}

async function runSteps(
  runId: string,
  tenantId: string,
  siteId: string,
  userId: string | null,
  operationId: string,
  steps: OnboardingStepState[],
  fromIndex: number,
): Promise<void> {
  try {
    for (let index = fromIndex; index < steps.length; index += 1) {
      const step = steps[index];
      steps[index] = { ...step, status: "running", startedAt: new Date().toISOString() };
      await saveSteps(runId, steps);
      await touchOperationProgress(operationId, { phase: step.id, completedSteps: index });

      const handler = getOnboardingStep(step.id);
      if (!handler) {
        steps[index] = { ...steps[index], status: "skipped", summary: "Not available yet: this workspace has no handler for this step.", finishedAt: new Date().toISOString() };
      } else {
        try {
          const result = await handler({ tenantId, siteId, userId, operationId });
          steps[index] = { ...steps[index], status: "succeeded", summary: result.summary, counts: result.counts ?? null, finishedAt: new Date().toISOString() };
        } catch (error) {
          const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
          steps[index] = { ...steps[index], status: "failed", error: message, finishedAt: new Date().toISOString() };
          structuredEvent("site_onboarding.step_failed", { tenantId, siteId, step: step.id, error: message }, "warn");
        }
      }
      await saveSteps(runId, steps);
      await touchOperationProgress(operationId, { completedSteps: index + 1 });
      if (steps[index].status === "failed" && CRITICAL_STEPS.has(step.id)) break;
    }
    await finish(runId, tenantId, siteId, operationId, steps);
  } catch (error) {
    // Persistence itself failed mid-pass: close everything as failed so the run can be retried.
    const message = error instanceof Error ? error.message : String(error);
    const closed = steps.map((step) => (step.status === "running" ? { ...step, status: "failed" as const, error: message.slice(0, 500), finishedAt: new Date().toISOString() } : step));
    await saveSteps(runId, closed, { status: "failed", finishedAt: new Date() }).catch(() => undefined);
    await failOperation(operationId, { errorCode: "onboarding_failed", errorSummary: message, retryable: true }).catch(() => undefined);
  }
}

async function finish(runId: string, tenantId: string, siteId: string, operationId: string, steps: OnboardingStepState[]) {
  const failed = steps.find((step) => step.status === "failed");
  await saveSteps(runId, steps, { status: failed ? "failed" : "succeeded", finishedAt: new Date() });
  if (failed) {
    await failOperation(operationId, { errorCode: "onboarding_step_failed", errorSummary: `${failed.id}: ${failed.error ?? "failed"}`, retryable: true, phase: failed.id });
    await publishEvent({ tenantId, siteId, type: "operation.failed", payload: { operationId } });
    await notify({
      tenantId,
      siteId,
      category: "editorial",
      severity: "warning",
      title: "Website onboarding needs attention",
      message: `The "${failed.id}" step failed: ${failed.error ?? "unknown error"}. Retry it from Site intelligence.`,
      entityType: "site",
      entityId: siteId,
      actionUrl: `/studio/site-intelligence?siteId=${siteId}`,
      dedupeKey: `onboarding.${siteId}.failed`,
    });
  } else {
    await completeOperation(operationId, { phase: "done" });
    await publishEvent({ tenantId, siteId, type: "operation.completed", payload: { operationId } });
  }
  structuredEvent("site_onboarding.finished", { tenantId, siteId, operationId, status: failed ? "failed" : "succeeded" });
}
