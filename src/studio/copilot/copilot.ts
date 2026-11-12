// Studio Copilot: persisted threads, context resolution and answer generation.
//
// Trust boundaries:
//  - tenant comes from the signed Studio context, never from the body;
//  - siteId / projectId from the client are re-checked against that tenant;
//  - threads are private to the Studio user who created them;
//  - competency evidence and conversation history reach the model only as
//    untrusted data blocks (see prompt-injection.ts).

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { getTextProvider } from "../../infrastructure/ai/text";
import { writeAudit } from "../audit";
import { hasStudioPermission } from "../security";
import { SOURCE_DATA_RULES, clampUntrustedContent, neutralizeInlineControlCharacters, wrapUntrustedContent } from "../prompt-injection";
import { availableCompetencies, findCompetency, selectCompetency, type CompetencyDefinition, type CompetencyEvidence } from "./competencies";

const prisma = getPrismaClient();

export const MAX_MESSAGE_LENGTH = 4000;

export class CopilotError extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

export type CopilotActor = { tenantId: string; userId: string; permissions: string[] };

export type CopilotPageContext = {
  siteId?: string | null;
  projectId?: string | null;
  route?: string | null;
};

type ResolvedContext = {
  siteId: string | null;
  siteName: string | null;
  projectId: string | null;
  projectTitle: string | null;
  route: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validates client-supplied context against the tenant. Exported for tests via injection of ids only. */
export async function resolveContext(tenantId: string, input: CopilotPageContext | undefined): Promise<ResolvedContext> {
  const route = typeof input?.route === "string" && input.route.startsWith("/studio") ? input.route.slice(0, 200) : null;
  let siteId = input?.siteId ?? null;
  const projectId = input?.projectId ?? null;
  if (siteId !== null && !UUID.test(siteId)) throw new CopilotError(400, "invalid siteId");
  if (projectId !== null && !UUID.test(projectId)) throw new CopilotError(400, "invalid projectId");

  let projectTitle: string | null = null;
  if (projectId) {
    const project = await prisma.contentProject.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { title: true, siteId: true } });
    if (!project) throw new CopilotError(404, "article not found");
    if (siteId && siteId !== project.siteId) throw new CopilotError(400, "article does not belong to the selected site");
    siteId = project.siteId;
    projectTitle = project.title;
  }

  let siteName: string | null = null;
  if (siteId) {
    const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { name: true } });
    if (!site) throw new CopilotError(404, "site not found");
    siteName = site.name;
  }
  return { siteId, siteName, projectId, projectTitle, route };
}

function serializeMessage(message: Prisma.CopilotMessageGetPayload<object>) {
  return {
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    status: message.status,
    competencyKey: message.competencyKey,
    context: message.context,
    evidence: message.evidence,
    provider: message.provider,
    model: message.model,
    tokensInput: message.tokensInput,
    tokensOutput: message.tokensOutput,
    durationMs: message.durationMs,
    error: message.error,
    createdAt: message.createdAt,
  };
}

export function listCompetencies(actor: CopilotActor) {
  return availableCompetencies({ projectId: "any" }).map((item) => ({
    key: item.key,
    label: item.label,
    description: item.description,
    scope: item.scope,
    permission: item.permission,
    mutates: item.mutates,
    allowed: hasStudioPermission(actor.permissions, item.permission),
  }));
}

export async function competencyRuns(actor: CopilotActor, input: { key?: string; limit: number }) {
  const rows = await prisma.copilotMessage.findMany({
    where: {
      tenantId: actor.tenantId,
      role: "assistant",
      competencyKey: input.key ? input.key : { not: null },
      thread: { studioUserId: actor.userId },
    },
    orderBy: { createdAt: "desc" },
    take: input.limit,
  });
  return rows.map(serializeMessage);
}

export async function competencyStats(actor: CopilotActor) {
  const rows = await prisma.copilotMessage.groupBy({
    by: ["competencyKey", "status"],
    where: { tenantId: actor.tenantId, role: "assistant", competencyKey: { not: null } },
    _count: { _all: true },
    _sum: { tokensInput: true, tokensOutput: true },
    _max: { createdAt: true },
  });
  return rows.map((row) => ({
    key: row.competencyKey,
    status: row.status,
    runs: row._count._all,
    tokensInput: row._sum.tokensInput,
    tokensOutput: row._sum.tokensOutput,
    lastRunAt: row._max.createdAt,
  }));
}

export async function listThreads(actor: CopilotActor, query: string | undefined) {
  const q = query?.trim().slice(0, 100);
  const threads = await prisma.copilotThread.findMany({
    where: {
      tenantId: actor.tenantId,
      studioUserId: actor.userId,
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { messages: { some: { content: { contains: q, mode: "insensitive" } } } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, siteId: true, createdAt: true, updatedAt: true },
  });
  return threads;
}

async function ownThread(actor: CopilotActor, threadId: string) {
  if (!UUID.test(threadId)) throw new CopilotError(400, "invalid thread id");
  const thread = await prisma.copilotThread.findFirst({ where: { id: threadId, tenantId: actor.tenantId, studioUserId: actor.userId } });
  if (!thread) throw new CopilotError(404, "conversation not found");
  return thread;
}

export async function getThread(actor: CopilotActor, threadId: string) {
  const thread = await ownThread(actor, threadId);
  const messages = await prisma.copilotMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  return { id: thread.id, title: thread.title, siteId: thread.siteId, createdAt: thread.createdAt, updatedAt: thread.updatedAt, messages: messages.map(serializeMessage) };
}

export async function deleteThread(actor: CopilotActor, threadId: string) {
  const thread = await ownThread(actor, threadId);
  await prisma.copilotThread.delete({ where: { id: thread.id } });
}

function pickCompetency(actor: CopilotActor, requestedKey: string | null | undefined, content: string, context: ResolvedContext): CompetencyDefinition | null {
  if (requestedKey) {
    const competency = findCompetency(requestedKey);
    if (!competency) throw new CopilotError(400, "unknown competency");
    if (!hasStudioPermission(actor.permissions, competency.permission)) throw new CopilotError(403, `Missing permission: ${competency.permission}`);
    if (competency.scope === "project" && !context.projectId) throw new CopilotError(400, `${competency.label} needs an open article`);
    return competency;
  }
  const selected = selectCompetency(content, { projectId: context.projectId });
  return selected && hasStudioPermission(actor.permissions, selected.permission) ? selected : null;
}

// Prompt budget stays under ~3.5k tokens so small local models (4k context) never truncate the rules.
const SYSTEM_PROMPT = [
  "You are the Auctorio Studio copilot, an assistant inside an editorial and publishing workspace.",
  "Answer in the language the user writes in. Be concise and specific; use short Markdown (lists, bold, inline code).",
  "Use only the data provided in this prompt. If the data does not answer the question, say what is missing and which Studio screen shows it.",
  "You cannot change anything yourself: never claim that you published, regenerated, approved or edited content. Suggest the action and the screen where the user can do it.",
  SOURCE_DATA_RULES,
].join("\n");

async function generateAnswer(
  actor: CopilotActor,
  threadId: string,
  question: string,
  context: ResolvedContext,
  competency: CompetencyDefinition | null,
  isAborted: () => boolean,
) {
  const started = Date.now();
  const history = await prisma.copilotMessage.findMany({
    where: { threadId, status: "completed" },
    orderBy: { createdAt: "desc" },
    take: 9,
  });
  // The newest row is the question itself; earlier turns give continuity.
  const transcript = history
    .reverse()
    .slice(0, -1)
    .map((m) => `${m.role}: ${m.content.slice(0, 1500)}`)
    .join("\n");

  let evidence: CompetencyEvidence | null = null;
  let failure: string | null = null;
  let result: Awaited<ReturnType<ReturnType<typeof getTextProvider>["generate"]>> | null = null;
  try {
    evidence = competency ? await competency.load({ tenantId: actor.tenantId, siteId: context.siteId, projectId: context.projectId }) : null;
    const prompt = [
      "## Page context (from the application)",
      `Route: ${context.route ?? "unknown"}`,
      `Site: ${context.siteName ?? "all sites"}`,
      `Open article: ${context.projectTitle ? neutralizeInlineControlCharacters(context.projectTitle).slice(0, 200) : "none"}`,
      competency ? `## Task: ${competency.label}\n${competency.instructions}` : "## Task: answer the question from the page context.",
      evidence ? wrapUntrustedContent(`competency-${competency!.key}`, clampUntrustedContent(neutralizeInlineControlCharacters(evidence.facts), 8_000)) : "",
      transcript ? wrapUntrustedContent("conversation-history", clampUntrustedContent(neutralizeInlineControlCharacters(transcript), 3_000)) : "",
      "## Question",
      wrapUntrustedContent("user-question", clampUntrustedContent(neutralizeInlineControlCharacters(question), MAX_MESSAGE_LENGTH)),
    ]
      .filter(Boolean)
      .join("\n\n");
    result = await getTextProvider().generate({ systemPrompt: SYSTEM_PROMPT, prompt, temperature: 0.3, maxTokens: 900 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Configuration details stay in the server log, not in the user's answer.
    failure = /TEXT_|not allowed in production/.test(message) ? "The text model is not configured on the server" : message.slice(0, 300) || "The answer could not be generated";
    if (message) console.warn("[copilot] generation failed:", message.slice(0, 500));
  }

  const status = isAborted() ? "cancelled" : failure ? "failed" : "completed";
  // Usage is MEASURED only when the provider reports it; otherwise null, never zero.
  const measured = result?.usage && typeof result.usage.promptTokens === "number" && typeof result.usage.completionTokens === "number" && result.provider !== "mock";
  return {
    data: {
      tenantId: actor.tenantId,
      threadId,
      role: "assistant",
      content: result?.output ?? "",
      status,
      competencyKey: competency?.key ?? null,
      context: context as unknown as Prisma.InputJsonObject,
      evidence: evidence ? ({ sources: evidence.sources, findings: evidence.findings ?? [] } as unknown as Prisma.InputJsonObject) : Prisma.JsonNull,
      provider: result?.provider ?? null,
      model: result?.model ?? null,
      tokensInput: measured ? result!.usage!.promptTokens! : null,
      tokensOutput: measured ? result!.usage!.completionTokens! : null,
      durationMs: Date.now() - started,
      error: failure,
    },
  };
}

export async function sendMessage(
  actor: CopilotActor,
  input: { threadId?: string | null; content?: unknown; competencyKey?: string | null; context?: CopilotPageContext },
  isAborted: () => boolean,
) {
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!content) throw new CopilotError(400, "message is required");
  if (content.length > MAX_MESSAGE_LENGTH) throw new CopilotError(400, `message is longer than ${MAX_MESSAGE_LENGTH} characters`);
  const context = await resolveContext(actor.tenantId, input.context);
  const competency = pickCompetency(actor, input.competencyKey, content, context);

  const thread = input.threadId
    ? await ownThread(actor, input.threadId)
    : await prisma.copilotThread.create({
        data: { tenantId: actor.tenantId, studioUserId: actor.userId, siteId: context.siteId, title: content.replace(/\s+/g, " ").slice(0, 80) },
      });

  const userMessage = await prisma.copilotMessage.create({
    data: { tenantId: actor.tenantId, threadId: thread.id, role: "user", content, competencyKey: competency?.key ?? null, context: context as unknown as Prisma.InputJsonObject },
  });
  const answer = await generateAnswer(actor, thread.id, content, context, competency, isAborted);
  const assistant = await prisma.copilotMessage.create(answer);
  await prisma.copilotThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
  if (competency) {
    await writeAudit({
      tenantId: actor.tenantId,
      action: "copilot.competency.run",
      entityType: context.projectId ? "content_project" : "site",
      entityId: context.projectId ?? context.siteId,
      actorType: "user",
      actorUserId: actor.userId,
      metadata: { competency: competency.key, status: assistant.status, messageId: assistant.id },
    });
  }
  return { threadId: thread.id, userMessage: serializeMessage(userMessage), message: serializeMessage(assistant) };
}

/** Regenerates a failed or cancelled answer in place, reusing its question and context. */
export async function retryMessage(actor: CopilotActor, messageId: string, isAborted: () => boolean) {
  if (!UUID.test(messageId)) throw new CopilotError(400, "invalid message id");
  const failed = await prisma.copilotMessage.findFirst({ where: { id: messageId, tenantId: actor.tenantId, role: "assistant", thread: { studioUserId: actor.userId } } });
  if (!failed) throw new CopilotError(404, "message not found");
  if (failed.status === "completed") throw new CopilotError(400, "only failed or cancelled answers can be retried");
  const question = await prisma.copilotMessage.findFirst({ where: { threadId: failed.threadId, role: "user", createdAt: { lte: failed.createdAt } }, orderBy: { createdAt: "desc" } });
  if (!question) throw new CopilotError(404, "question not found");
  const stored = (failed.context ?? {}) as CopilotPageContext;
  const context = await resolveContext(actor.tenantId, { siteId: stored.siteId ?? null, projectId: stored.projectId ?? null, route: stored.route ?? null });
  const competency = failed.competencyKey ? pickCompetency(actor, failed.competencyKey, question.content, context) : null;
  const answer = await generateAnswer(actor, failed.threadId, question.content, context, competency, isAborted);
  const { tenantId: _tenant, threadId: _thread, role: _role, ...changes } = answer.data;
  const updated = await prisma.copilotMessage.update({ where: { id: failed.id }, data: { ...changes, createdAt: new Date() } });
  return { threadId: failed.threadId, message: serializeMessage(updated) };
}
