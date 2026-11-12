// Contextual assistant turn: pick a tool, run read tools, stage write tools.
//
// Tool choice: a language model picks a tool through a validated schema when
// one is configured; with the mock provider (or any model failure) the
// deterministic intent router below answers instead. Either way the arguments
// are re-validated by the tool against the tenant, and the reply says which
// path chose the tool.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { generateStructured } from "../../infrastructure/ai/structured";
import type { TextProvider } from "../../infrastructure/ai/text";
import { activeAiSelection } from "../../infrastructure/ai/ai-settings";
import { getEnv } from "../../shared/utils/env";
import { enums, num, obj, optNul, optionalString } from "../../shared/schema";
import { writeAudit } from "../audit";
import { hasStudioPermission } from "../security";
import { SOURCE_DATA_RULES, clampUntrustedContent, neutralizeInlineControlCharacters, wrapUntrustedContent } from "../prompt-injection";
import type { AssistantContext } from "./assistant-context";
import { CopilotError } from "./errors";
import { READ_TOOLS, TOOL_NAMES, WRITE_TOOLS, findTool, type ReadResult, type ToolArgs, type ToolLink, type ToolName, type WriteToolName } from "./tools";

const prisma = getPrismaClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AssistantActor = { tenantId: string; userId: string; permissions: string[] };
export type ToolChoice = { tool: ToolName; args: ToolArgs; via: "model" | "deterministic"; provider?: string; model?: string };

// ── Deterministic intent router ──────────────────────────────────────────

const quoted = (source: string, label: string) => new RegExp(`(?:${label})\\s*(?:to|a|:|=)?\\s*["“']([^"”']{2,320})["”']`, "i").exec(source)?.[1];

/** Maps an explicit command or a plain question to a tool. Write intents need explicit verbs. */
export function routeIntent(message: string): { tool: ToolName; args: ToolArgs } | null {
  const text = message.trim();
  const lower = text.toLowerCase();
  const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];

  // Explicit write commands first.
  const domain = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,63})\b/i.exec(text)?.[1];
  if (/\b(propose|add|suggest|propón|proponer|añade|añadir)\b.*\b(source|fuente)\b/i.test(lower) && domain) {
    const reason = /\b(?:because|reason:?|porque|motivo:?)\s+(.{3,600})$/i.exec(text)?.[1]?.trim();
    const relationship = /\b(competitor|competidor|news|noticias|partner|reference|referencia)\b/i.exec(lower)?.[1];
    return { tool: "propose_source", args: { domain, reason, relationship } };
  }
  if (/\b(fill|rellena|rellenar|completa)\b.*\b(slot|slots|hueco|huecos|missing|vac[ií]os?)\b/i.test(lower)) return { tool: "fill_missing_slots", args: {} };
  if (/\b(regenerate|regenera|regenerar|replace this proposal|reemplaza)\b/i.test(lower)) return { tool: "regenerate_proposal", args: {} };

  const update: ToolArgs = {};
  const title = quoted(text, "(?<!seo |seo|meta |meta)(?:title|t[ií]tulo)(?! seo)");
  const seoTitle = quoted(text, "seo ?title|t[ií]tulo seo");
  const metaDescription = quoted(text, "meta ?description|meta ?descripci[oó]n");
  const primaryKeyword = quoted(text, "(?:primary )?keyword|palabra clave");
  const priority = /\b(?:priority|prioridad)\s*(?:to|a|:|=)?\s*(\d{1,3})\b/i.exec(text)?.[1];
  const moveTo = /\b(?:move|reschedule|schedule|mueve|mover|reprograma)\b[^0-9]*(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1];
  if (seoTitle) update.seoTitle = seoTitle;
  if (title) update.title = title;
  if (metaDescription) update.metaDescription = metaDescription;
  if (primaryKeyword) update.primaryKeyword = primaryKeyword;
  if (priority) update.priority = Number(priority);
  if (moveTo) update.scheduledFor = moveTo;
  if (Object.keys(update).length) return { tool: "update_proposal", args: update };

  // Read intents.
  if (/\b(fail|failed|failure|error|falló|fallo|fallido|error(es)?)\b/i.test(lower) && /\b(job|operation|task|generation|tarea|operaci[oó]n|trabajo|why|por qu[eé])\b/i.test(lower)) return { tool: "explain_failed_job", args: {} };
  if (/\b(cadence|frequency|how often|cadencia|frecuencia|cada cu[aá]nto)\b/i.test(lower)) return { tool: "suggest_cadence", args: {} };
  if (/\b(suggest|ideas?|propose|sugiere|proponer|propón)\b/i.test(lower) && (date || /\b(day|d[ií]a)\b/i.test(lower))) return { tool: "suggest_proposals_for_day", args: date ? { date } : {} };
  if (/\b(weak|weakness|weaknesses|gaps?|problems?|issues?|debilidad(es)?|huecos?|problemas?)\b/i.test(lower)) return { tool: "find_plan_weaknesses", args: {} };
  if (/\b(why|relevan|evidence|por qu[eé]|evidencia)\b/i.test(lower) && /\b(proposal|item|this|propuesta|esta)\b/i.test(lower)) return { tool: "explain_proposal_relevance", args: {} };
  if (/\b(strategy|estrategia|positioning|posicionamiento)\b/i.test(lower)) return { tool: "explain_strategy", args: {} };
  return null;
}

// ── Model tool choice ────────────────────────────────────────────────────

const choiceSchema = obj({
  tool: enums([...TOOL_NAMES, "none"] as const),
  itemId: optionalString({ maxLength: 36 }),
  planId: optionalString({ maxLength: 36 }),
  operationId: optionalString({ maxLength: 36 }),
  date: optionalString({ maxLength: 10 }),
  title: optionalString({ maxLength: 200 }),
  seoTitle: optionalString({ maxLength: 120 }),
  metaDescription: optionalString({ maxLength: 320 }),
  primaryKeyword: optionalString({ maxLength: 120 }),
  scheduledFor: optionalString({ maxLength: 30 }),
  priority: optNul(num({ min: 0, max: 100, integer: true })),
  domain: optionalString({ maxLength: 253 }),
  relationship: optionalString({ maxLength: 40 }),
  reason: optionalString({ maxLength: 600 }),
});

function contextFacts(ctx: AssistantContext): string {
  return [
    `site: ${ctx.site ? `${ctx.site.name} (${ctx.site.id})` : "none"}`,
    `plan: ${ctx.plan ? `${ctx.plan.name} (${ctx.plan.id}), status ${ctx.plan.status}, ${ctx.plan.itemCount} items, ${ctx.plan.unfilledSlots} unfilled slots` : "none"}`,
    `proposal: ${ctx.proposal ? `${ctx.proposal.title} (${ctx.proposal.id}), status ${ctx.proposal.status}` : "none"}`,
    `period: ${ctx.period ? `${ctx.period.from}..${ctx.period.to}, ${ctx.period.items.length} items` : "none"}`,
    `recent failed operations: ${ctx.recentFailures.map((entry) => `${entry.type} (${entry.id})`).join(", ") || "none"}`,
  ].join("\n");
}

const TOOL_SYSTEM = [
  "You route requests inside an editorial Studio to exactly one tool, or \"none\" for general questions.",
  `Tools: ${TOOL_NAMES.map((name) => `${name}: ${findTool(name)!.description}`).join(" | ")}`,
  "Only choose a write tool (update_proposal, regenerate_proposal, fill_missing_slots, propose_source) when the user explicitly asks for that change.",
  "Ids default to the context selection; never invent ids. Answer with a single JSON object.",
  SOURCE_DATA_RULES,
].join("\n");

/** False when only the mock provider would answer, so the router serves without a pointless model call. */
function modelConfigured(): boolean {
  try {
    return Boolean(activeAiSelection()) || getEnv("TEXT_PROVIDER", "mock").toLowerCase() !== "mock";
  } catch {
    return false;
  }
}

export async function chooseTool(message: string, ctx: AssistantContext, providerOverride?: TextProvider): Promise<ToolChoice | null> {
  try {
    if (!providerOverride && !modelConfigured()) throw new Error("no language model configured");
    const result = await generateStructured({
      schemaName: "copilot_tool_choice",
      schema: choiceSchema,
      systemPrompt: TOOL_SYSTEM,
      prompt: [wrapUntrustedContent("studio-context", contextFacts(ctx)), wrapUntrustedContent("user-request", clampUntrustedContent(neutralizeInlineControlCharacters(message), 4000))].join("\n\n"),
      temperature: 0,
      maxTokens: 300,
      maxAttempts: 1,
      providerOverride,
    });
    const last = result.attempts[result.attempts.length - 1];
    if (last?.provider === "mock") throw new Error("mock provider");
    const { tool, ...rest } = result.data;
    if (tool === "none") return null;
    const args = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined && value !== null));
    return { tool, args, via: "model", provider: last?.provider, model: last?.model };
  } catch {
    const routed = routeIntent(message);
    return routed ? { ...routed, via: "deterministic" } : null;
  }
}

// ── Pending actions ──────────────────────────────────────────────────────

export type ActionView = {
  id: string;
  tool: string;
  args: unknown;
  summary: string;
  status: string;
  result: unknown;
  error: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
};

export function serializeAction(row: Prisma.CopilotActionGetPayload<object>): ActionView {
  return { id: row.id, tool: row.tool, args: row.args, summary: row.summary, status: row.status, result: row.result, error: row.error, createdAt: row.createdAt, confirmedAt: row.confirmedAt, cancelledAt: row.cancelledAt };
}

export type PreparedAction = { tool: WriteToolName; args: ToolArgs; summary: string };

/** Validates a write tool's arguments against the tenant. Never executes it. */
export async function prepareAction(actor: AssistantActor, ctx: AssistantContext, tool: WriteToolName, args: ToolArgs): Promise<PreparedAction> {
  const definition = WRITE_TOOLS[tool];
  if (!hasStudioPermission(actor.permissions, definition.permission)) throw new CopilotError(403, `Missing permission: ${definition.permission}`);
  const prepared = await definition.prepare(ctx, args);
  return { tool, args: prepared.args, summary: prepared.summary.slice(0, 2000) };
}

/** Stores a prepared action as pending; it runs only through confirmAction. */
export async function proposeAction(actor: AssistantActor, prepared: PreparedAction, link: { threadId: string | null; messageId: string | null }) {
  const row = await prisma.copilotAction.create({
    data: { tenantId: actor.tenantId, studioUserId: actor.userId, threadId: link.threadId, messageId: link.messageId, tool: prepared.tool, args: prepared.args as Prisma.InputJsonObject, summary: prepared.summary },
  });
  await writeAudit({ tenantId: actor.tenantId, action: "copilot.action.proposed", entityType: "copilot_action", entityId: row.id, actorType: "user", actorUserId: actor.userId, metadata: { tool: prepared.tool, args: prepared.args } });
  return serializeAction(row);
}

async function ownAction(actor: AssistantActor, actionId: string) {
  if (!UUID.test(actionId)) throw new CopilotError(400, "invalid action id");
  const row = await prisma.copilotAction.findFirst({ where: { id: actionId, tenantId: actor.tenantId, studioUserId: actor.userId } });
  if (!row) throw new CopilotError(404, "action not found");
  return row;
}

/**
 * Executes a pending action exactly once. The pending -> executing claim is a
 * conditional update, so a double click or a retried request gets the stored
 * outcome back (replayed: true) instead of a second execution.
 */
export async function confirmAction(actor: AssistantActor, actionId: string): Promise<{ action: ActionView; replayed: boolean }> {
  const row = await ownAction(actor, actionId);
  const definition = (WRITE_TOOLS as Record<string, (typeof WRITE_TOOLS)[WriteToolName]>)[row.tool];
  if (!definition) throw new CopilotError(400, "unknown tool");
  if (!hasStudioPermission(actor.permissions, definition.permission)) throw new CopilotError(403, `Missing permission: ${definition.permission}`);
  const claimed = await prisma.copilotAction.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "executing" } });
  if (claimed.count !== 1) {
    const current = await prisma.copilotAction.findUniqueOrThrow({ where: { id: row.id } });
    if (current.status === "cancelled") throw new CopilotError(409, "This action was cancelled and cannot be confirmed.");
    return { action: serializeAction(current), replayed: true };
  }
  try {
    const outcome = await definition.execute(actor.tenantId, actor.userId, row.args as ToolArgs);
    const done = await prisma.copilotAction.update({
      where: { id: row.id },
      data: { status: "confirmed", confirmedAt: new Date(), result: { ...outcome.result, links: outcome.links } as Prisma.InputJsonObject },
    });
    await writeAudit({ tenantId: actor.tenantId, action: "copilot.action.confirmed", entityType: "copilot_action", entityId: row.id, actorType: "user", actorUserId: actor.userId, metadata: { tool: row.tool, args: row.args, result: outcome.result } });
    return { action: serializeAction(done), replayed: false };
  } catch (error) {
    const message = error instanceof CopilotError ? error.message : "The action failed on the server";
    if (!(error instanceof CopilotError)) console.warn("[copilot] action failed:", error instanceof Error ? error.message.slice(0, 500) : error);
    const failed = await prisma.copilotAction.update({ where: { id: row.id }, data: { status: "failed", error: message.slice(0, 1000) } });
    await writeAudit({ tenantId: actor.tenantId, action: "copilot.action.failed", entityType: "copilot_action", entityId: row.id, actorType: "user", actorUserId: actor.userId, metadata: { tool: row.tool, error: message } });
    return { action: serializeAction(failed), replayed: false };
  }
}

export async function cancelAction(actor: AssistantActor, actionId: string): Promise<ActionView> {
  const row = await ownAction(actor, actionId);
  const claimed = await prisma.copilotAction.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "cancelled", cancelledAt: new Date() } });
  const current = await prisma.copilotAction.findUniqueOrThrow({ where: { id: row.id } });
  if (claimed.count !== 1) {
    if (current.status === "cancelled") return serializeAction(current);
    throw new CopilotError(409, `This action is already ${current.status}.`);
  }
  await writeAudit({ tenantId: actor.tenantId, action: "copilot.action.cancelled", entityType: "copilot_action", entityId: row.id, actorType: "user", actorUserId: actor.userId, metadata: { tool: row.tool } });
  return serializeAction(current);
}

export async function listActions(actor: AssistantActor, status: string | undefined) {
  const rows = await prisma.copilotAction.findMany({
    where: { tenantId: actor.tenantId, studioUserId: actor.userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(serializeAction);
}

// ── A whole assistant turn ───────────────────────────────────────────────

export type ToolTurn = {
  content: string;
  tool: ToolName;
  via: ToolChoice["via"];
  provider: string;
  model: string;
  findings: ReadResult["findings"];
  sources: ToolLink[];
  /** Validated write actions to store as pending once the assistant message row exists. */
  stage: PreparedAction[];
  status: "completed" | "failed";
  error: string | null;
};

function footer(choice: ToolChoice): string {
  return choice.via === "model"
    ? `\n\n_Tool \`${choice.tool}\` chosen by ${choice.provider ?? "the model"}; the figures above come from Studio data, not from the model._`
    : `\n\n_Answered by the deterministic intent router (no language model chose this tool); the figures come from Studio data._`;
}

/** Runs the chosen tool. Read tools answer now; write tools only produce a staged action. */
export async function runToolTurn(actor: AssistantActor, ctx: AssistantContext, choice: ToolChoice): Promise<ToolTurn> {
  const base = { tool: choice.tool, via: choice.via, provider: choice.via === "model" ? choice.provider ?? "model" : "deterministic", model: choice.via === "model" ? choice.model ?? "unknown" : "intent-router" };
  const definition = findTool(choice.tool)!;
  if (!hasStudioPermission(actor.permissions, definition.permission)) {
    return { ...base, content: `“${definition.label}” needs the **${definition.permission}** permission, which your role does not have. Nothing was changed.`, findings: [], sources: [], stage: [], status: "completed", error: null };
  }
  try {
    if (definition.kind === "write") {
      const prepared = await prepareAction(actor, ctx, choice.tool as WriteToolName, choice.args);
      return { ...base, content: `I prepared **${definition.label}**: ${prepared.summary}\n\nNothing has changed yet — confirm or cancel below.${footer(choice)}`, findings: [], sources: [], stage: [prepared], status: "completed", error: null };
    }
    const result = await (READ_TOOLS as Record<string, (typeof READ_TOOLS)[keyof typeof READ_TOOLS]>)[choice.tool].run(ctx, choice.args);
    const stage: PreparedAction[] = [];
    for (const offer of result.offers ?? []) {
      if (!hasStudioPermission(actor.permissions, WRITE_TOOLS[offer.tool].permission)) continue;
      // An offer that no longer validates is simply not offered.
      const prepared = await prepareAction(actor, ctx, offer.tool, offer.args).catch(() => null);
      if (prepared) stage.push(prepared);
    }
    return { ...base, content: result.content + footer(choice), findings: result.findings ?? [], sources: result.sources ?? [], stage, status: "completed", error: null };
  } catch (error) {
    if (!(error instanceof CopilotError)) throw error;
    return { ...base, content: "", findings: [], sources: [], stage: [], status: "failed", error: error.message };
  }
}
