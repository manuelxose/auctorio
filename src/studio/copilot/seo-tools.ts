// SEO tools of the assistant (SEO-V2-06). They read the same workspace views as the screens, so they show no more than a person may
// see, and the only action asks for research through the same request, budgets and governor. Topics and queries come from outside:
// they are shown as plain text and never followed.

import { getPrismaClient } from "../../infrastructure/db/prisma";
import { normalizeKeyword } from "../../infrastructure/seo/contract";
import { listSeoOpportunities } from "../seo-intelligence";
import type { OpportunityExplanation } from "../seo-intelligence/select";
import { getResearchProfile } from "../seo-research/profile";
import { PLANNABLE } from "../seo-research/reservoir";
import { getResearchOverview, requestResearch } from "../seo-research/runs";
import { previewResearch, researchAllowance, runForWorkspace, withoutCosts, workspaceOverview, type ResearchAllowance } from "../seo-workspace";
import { neutralizeInlineControlCharacters } from "../prompt-injection";
import type { AssistantContext } from "./assistant-context";
import { CopilotError } from "./errors";
import type { ReadTool, ToolArgs, WriteTool } from "./tools";

const prisma = getPrismaClient();

/** Text from search results, competitors or pages, on one line and without markup of its own. */
export const plain = (value: string | null | undefined, max = 160): string => neutralizeInlineControlCharacters(withoutCosts(value ?? "")).replace(/[\r\n`*_<>[\]()#|\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const LINKS = {
  overview: { label: "Site Intelligence", path: "/studio/site-intelligence" },
  opportunities: { label: "Oportunidades SEO", path: "/studio/seo-opportunities" },
  research: { label: "Investigación SEO", path: "/studio/seo-research" },
} as const;

const siteOf = (ctx: AssistantContext) => {
  if (!ctx.site) throw new CopilotError(400, "Selecciona un sitio para consultar su inteligencia SEO.");
  return ctx.site;
};

const ALLOWANCE: Record<ResearchAllowance["state"], string> = {
  available: "hay asignación disponible", low: "queda poca asignación", exhausted: "la asignación del sitio o del workspace está agotada", platform_limit: "la plataforma ha llegado a su límite general",
  stopped: "la plataforma ha parado todas las consultas externas", disabled: "la plataforma tiene desactivados los datos externos", no_provider: "no hay ningún proveedor de datos disponible para este mercado",
};
const BLOCKED: Record<string, string> = {
  budget_exhausted: "asignación agotada", emergency_stop: "parada de emergencia", external_disabled: "datos externos desactivados", provider_disabled: "proveedor desactivado", not_configured: "proveedor sin configurar",
  unsupported_market: "mercado no disponible", unknown_price: "coste máximo sin confirmar", paid_automation_locked: "automatización de pago cerrada", billing_uncertain: "una petición anterior está sin confirmar",
  unexpected_failure: "Falló por un problema interno.", enough_opportunities: "ya había suficientes", run_limit: "superaba el límite de la investigación", timeout: "el proveedor no respondió", rate_limited: "el proveedor limitó las consultas", upstream_error: "el proveedor falló",
  circuit_open: "proveedor en pausa por fallos", not_worth_cost: "no compensa todavía", insufficient_balance: "proveedor sin saldo", run_stopped: "investigación detenida",
};
const allowanceLine = (allowance: ResearchAllowance) =>
  `Asignación de investigación: ${ALLOWANCE[allowance.state]} (${allowance.usedPercent} % usado${allowance.renewsAt ? `, se renueva el ${allowance.renewsAt.slice(0, 10)}` : ""}).${allowance.held ? ` La plataforma no deja que empiece sola aquí: ${plain(allowance.held)}.` : ""}`;

export const seoSiteKnowledge: ReadTool = {
  kind: "read", label: "Qué sabe Auctorio del sitio", permission: "analytics.read", needs: "site",
  description: "What is already known of the site's SEO: pages read, Search Console, keywords, opportunity coverage by topic and the next recommended action.",
  async run(ctx) {
    const site = siteOf(ctx);
    const view = await workspaceOverview(ctx.tenantId, site.id);
    const { organic, coverage, research, connection } = view;
    const trend = organic ? `${organic.current.clicks} clics y ${organic.current.impressions} impresiones en ${organic.days} días hasta el ${organic.through}${organic.previous ? ` (antes: ${organic.previous.clicks} clics)` : "; sin periodo anterior completo para comparar"}` : null;
    const gaps = coverage.gaps.slice(0, 6).map((topic) => plain(topic, 60));
    return {
      content: [
        `- Páginas conocidas: ${research.pages.total}, leídas ${research.pages.read}.`,
        `- Search Console: ${connection.status === "active" ? `conectado, datos hasta ${connection.syncedThrough ?? "sin sincronizar"}` : "sin conectar: no hay datos propios de búsqueda"}.`,
        ...(trend ? [`- Rendimiento orgánico: ${trend}.`] : []),
        `- Palabras clave conocidas: ${research.keywords}.`,
        `- Oportunidades de calidad disponibles: ${coverage.available} de ${coverage.wanted}${coverage.days === null ? "" : `, unos ${coverage.days} días de publicación`}.`,
        ...(gaps.length ? [`- Temas del sitio sin oportunidades: ${gaps.join(", ")}.`] : []),
        `- ${allowanceLine(view.allowance)}`,
      ].join("\n"),
      sources: [LINKS.overview],
    };
  },
};

export const explainSeoOpportunity: ReadTool = {
  kind: "read", label: "Por qué esta oportunidad", permission: "analytics.read", needs: "site",
  description: "Explains why one SEO opportunity was selected: evidence, score, confidence, risks. Optional title: its topic; otherwise the best open one.",
  async run(ctx, args) {
    const site = siteOf(ctx);
    const wanted = typeof args.title === "string" ? normalizeKeyword(args.title) : typeof args.primaryKeyword === "string" ? normalizeKeyword(args.primaryKeyword) : "";
    const rows = await listSeoOpportunities(ctx.tenantId, site.id, { take: 500 });
    const row = wanted ? rows.find((entry) => normalizeKeyword(entry.topic).includes(wanted) || (entry.query && normalizeKeyword(entry.query).includes(wanted))) : rows.find((entry) => entry.status === "open" || entry.status === "approved");
    if (!row) return { content: wanted ? `No hay ninguna oportunidad sobre «${plain(wanted, 80)}» en este sitio.` : "No hay oportunidades abiertas en este sitio.", sources: [LINKS.opportunities] };
    const detail = row.explanation as unknown as OpportunityExplanation | null;
    return {
      content: [
        `**${plain(row.topic)}** → ${row.action} (estado ${row.status}).`, plain(row.rationale, 400),
        ...(detail?.evidence ?? []).slice(0, 8).map((entry) => `- ${plain(entry.metric, 60)}: ${entry.value === null || entry.value === undefined ? "sin dato" : plain(String(entry.value), 60)} (${entry.kind})`),
        `Puntuación ${row.score ?? "sin calcular"}, confianza ${row.confidence ?? "desconocida"}. La puntuación ordena el trabajo; no es una probabilidad de posicionar.`,
        ...(detail?.risks ?? []).slice(0, 3).map((risk) => `- Riesgo: ${plain(risk, 200)}`),
      ].filter(Boolean).join("\n"),
      sources: [LINKS.opportunities],
    };
  },
};

export const seoContentToImprove: ReadTool = {
  kind: "read", label: "Contenido que conviene mejorar", permission: "analytics.read", needs: "site",
  description: "Lists the existing pages of the site that should be improved first, with the reason.",
  async run(ctx) {
    const site = siteOf(ctx);
    const rows = (await listSeoOpportunities(ctx.tenantId, site.id, { take: 500 })).filter((row) => row.targetUrl && ["open", "approved"].includes(row.status) && !PLANNABLE.includes(row.action ?? "")).slice(0, 10);
    if (!rows.length) return { content: "No hay páginas del sitio con una mejora propuesta ahora mismo.", sources: [LINKS.opportunities] };
    return { content: rows.map((row) => `- ${plain(row.targetUrl, 200)} → ${row.action} (puntuación ${row.score ?? "sin calcular"}, confianza ${row.confidence ?? "desconocida"}). ${plain(row.rationale, 240)}`).join("\n"), sources: [LINKS.opportunities] };
  },
};

export const seoResearchStatus: ReadTool = {
  kind: "read", label: "Estado de la investigación SEO", permission: "analytics.read", needs: "site",
  description: "Whether SEO research is necessary now, its allowance, its current state and why anything is blocked.",
  async run(ctx) {
    const site = siteOf(ctx);
    const [overview, allowance] = await Promise.all([getResearchOverview(ctx.tenantId, site.id), researchAllowance(ctx.tenantId, site.id)]);
    const last = overview.active ?? overview.runs[0] ?? null;
    const run = last && runForWorkspace(last);
    const tasks = run ? await prisma.seoResearchTask.findMany({ where: { tenantId: ctx.tenantId, siteId: site.id, runId: run.id, status: { in: ["skipped", "failed"] } }, select: { subject: true, reason: true, status: true }, take: 6 }) : [];
    const needed = overview.triggers.length > 0;
    return {
      content: [
        overview.coverage.sufficient ? `No hace falta investigar: hay ${overview.coverage.available} oportunidades de calidad y se querían ${overview.coverage.wanted}.` : `Hay ${overview.coverage.available} oportunidades de calidad de ${overview.coverage.wanted}.`,
        ...(needed ? overview.triggers.slice(0, 3).map((trigger) => `- Motivo: ${plain(trigger.detail, 240)}`) : ["- Ningún motivo justifica investigar ahora."]),
        allowanceLine(allowance),
        ...(run ? [`Última investigación: ${run.status}, ${run.progress} % completada.${run.error ? ` ${plain(BLOCKED[run.error] ?? run.error, 200)}` : ""}`] : ["Todavía no se ha investigado este sitio."]),
        ...tasks.map((task) => `- ${task.status === "failed" ? "Falló" : "No se hizo"}: ${plain(task.subject, 80) || "un paso"}${task.reason ? ` (${BLOCKED[task.reason] ?? "fallo interno"})` : ""}`),
      ].join("\n"),
      sources: [LINKS.research],
    };
  },
};

const topicsOf = (args: ToolArgs): string[] => {
  const value = typeof args.title === "string" ? args.title : typeof args.primaryKeyword === "string" ? args.primaryKeyword : "";
  return value.split(",").map((topic) => topic.replace(/\s+/g, " ").trim()).filter((topic) => topic && topic.length <= 80).slice(0, 5);
};

/** The same request as the research screen: one open run per site, the site's policy, the allowance and the governor all apply. */
export const requestSeoResearch: WriteTool = {
  kind: "write", label: "Pedir investigación SEO", permission: "projects.manage", needs: "site",
  description: "Asks for paid SEO research of the selected site, only when the user explicitly asks to start it. Optional title: up to five topics separated by commas.",
  async prepare(ctx, args) {
    const site = siteOf(ctx);
    const topics = topicsOf(args);
    const profile = await getResearchProfile(ctx.tenantId, site.id);
    if (profile.policy.mode === "off") throw new CopilotError(409, "La investigación está desactivada en los ajustes de este sitio.");
    const preview = await previewResearch(ctx.tenantId, site.id, topics.length ? { topics } : {});
    if (["stopped", "disabled", "no_provider", "exhausted", "platform_limit"].includes(preview.allowance.state)) throw new CopilotError(409, `No se puede investigar ahora: ${ALLOWANCE[preview.allowance.state]}.`);
    const subjects = preview.acquisitions.filter((entry) => !entry.blocked).map((entry) => plain(entry.subject, 60));
    return {
      args: { siteId: site.id, topics },
      summary: `Investigar ${site.name}${topics.length ? ` sobre ${topics.map((topic) => plain(topic, 80)).join(", ")}` : ""}: ${subjects.length ? `consultaría ${subjects.join(", ")} y usaría como máximo el ${preview.maxPercent} % de la asignación` : "no hay nada que comprar, se analiza lo guardado"}.`,
    };
  },
  async execute(tenantId, userId, args) {
    const siteId = typeof args.siteId === "string" ? args.siteId : "";
    const topics = Array.isArray(args.topics) ? (args.topics as string[]) : [];
    try {
      const { runId, created } = await requestResearch({ tenantId, siteId, userId, trigger: "manual", triggerKey: null, detail: "Pedida con el asistente.", focus: topics.length ? { topics } : {} });
      return { result: { runId, created }, links: [LINKS.research] };
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "research_disabled") throw new CopilotError(409, "La investigación está desactivada en los ajustes de este sitio.");
      if (code === "site_not_found") throw new CopilotError(404, "El sitio ya no existe.");
      throw error;
    }
  },
};
