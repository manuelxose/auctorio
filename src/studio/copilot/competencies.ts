// Studio Copilot competencies.
//
// A competency is a declared, read-only capability the copilot can run on the
// server: what it needs (scope), who may run it (permission), and a loader that
// gathers tenant-scoped evidence from the database. The model only ever sees
// that evidence (wrapped as untrusted data) and writes the answer; it never
// calls tools itself. Pattern adapted from the REA/BLG reference project, where
// business code asks for a capability rather than a model and records usage
// provenance (MEASURED vs UNKNOWN) instead of inventing numbers.

import { getPrismaClient } from "../../infrastructure/db/prisma";
import type { StudioPermission } from "../security";

const prisma = getPrismaClient();

export type CompetencyScope = "workspace" | "site" | "project";

export type CompetencyContext = {
  tenantId: string;
  siteId: string | null;
  projectId: string | null;
};

export type CompetencyEvidence = {
  /** Plain-text facts handed to the model as untrusted data. */
  facts: string;
  /** Structured references shown to the user under the answer. */
  sources: Array<{ label: string; path: string }>;
  /** Deterministic findings, when the competency computes any. */
  findings?: Array<{ severity: "high" | "medium" | "low"; message: string }>;
};

export type CompetencyDefinition = {
  key: string;
  label: string;
  description: string;
  scope: CompetencyScope;
  permission: StudioPermission;
  /** Every competency here only reads. Mutating ones need an approval step first. */
  mutates: false;
  /** Lower-case phrases that select this competency from a free-form message. */
  intents: string[];
  instructions: string;
  load(context: CompetencyContext): Promise<CompetencyEvidence>;
};

function stripHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Deterministic SEO checks on one article version. Exported for tests. */
export function seoFindings(version: {
  title?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  bodyHtml?: string | null;
}): Array<{ severity: "high" | "medium" | "low"; message: string }> {
  const findings: Array<{ severity: "high" | "medium" | "low"; message: string }> = [];
  const seoTitle = (version.seoTitle || version.title || "").trim();
  const description = (version.seoDescription || "").trim();
  const html = version.bodyHtml || "";
  const words = stripHtml(html).split(" ").filter(Boolean).length;
  const h2 = (html.match(/<h2[\s>]/gi) || []).length;
  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  const links = (html.match(/<a\s[^>]*href=/gi) || []).length;
  const images = html.match(/<img\s[^>]*>/gi) || [];
  const imagesWithoutAlt = images.filter((tag) => !/\balt\s*=\s*"[^"]+"/i.test(tag)).length;

  if (!seoTitle) findings.push({ severity: "high", message: "No SEO title" });
  else if (seoTitle.length < 30 || seoTitle.length > 60) findings.push({ severity: "medium", message: `SEO title is ${seoTitle.length} characters (aim for 30–60)` });
  if (!description) findings.push({ severity: "high", message: "No meta description" });
  else if (description.length < 70 || description.length > 160) findings.push({ severity: "medium", message: `Meta description is ${description.length} characters (aim for 70–160)` });
  if (words < 300) findings.push({ severity: "high", message: `Body has ${words} words (under 300)` });
  if (h1 > 1) findings.push({ severity: "medium", message: `Body has ${h1} H1 headings (use one at most, the title)` });
  if (words >= 600 && h2 < 2) findings.push({ severity: "medium", message: `Only ${h2} H2 sections for ${words} words` });
  if (links === 0) findings.push({ severity: "low", message: "No links in the body (internal or source)" });
  if (imagesWithoutAlt > 0) findings.push({ severity: "medium", message: `${imagesWithoutAlt} image(s) without alt text` });
  return findings;
}

async function latestVersion(context: CompetencyContext) {
  return prisma.contentVersion.findFirst({
    where: { tenantId: context.tenantId, projectId: context.projectId! },
    orderBy: { versionNumber: "desc" },
  });
}

function projectPath(projectId: string) {
  return `/studio/content/${projectId}`;
}

export const COMPETENCIES: CompetencyDefinition[] = [
  {
    key: "seo-review",
    label: "SEO review",
    description: "Checks the latest version of an article for title, description, structure, links and alt text, then suggests fixes.",
    scope: "project",
    permission: "projects.manage",
    mutates: false,
    intents: ["seo", "meta description", "keyword", "structure", "headings", "posicionamiento"],
    instructions: "Explain the SEO findings in order of impact and give concrete rewrites (title, description, headings). Do not invent ranking data.",
    async load(context) {
      const version = await latestVersion(context);
      if (!version) return { facts: "This article has no generated version yet.", sources: [{ label: "Article", path: projectPath(context.projectId!) }], findings: [] };
      const findings = seoFindings(version);
      const body = stripHtml(version.bodyHtml || "").slice(0, 6000);
      return {
        findings,
        sources: [{ label: `Version ${version.versionNumber}`, path: projectPath(context.projectId!) }],
        facts: [
          `Version ${version.versionNumber} (${version.status})`,
          `Title: ${version.title ?? "-"}`,
          `SEO title: ${version.seoTitle ?? "-"}`,
          `Meta description: ${version.seoDescription ?? "-"}`,
          `Deterministic findings:\n${findings.map((f) => `- [${f.severity}] ${f.message}`).join("\n") || "- none"}`,
          `Body text (truncated):\n${body}`,
        ].join("\n"),
      };
    },
  },
  {
    key: "qa-explain",
    label: "Explain QA result",
    description: "Reads the QA report and repair attempts of the latest version and explains what failed and what to change.",
    scope: "project",
    permission: "projects.manage",
    mutates: false,
    intents: ["qa", "quality", "failed", "falló", "fallo", "why", "por qué", "repair", "blocker"],
    instructions: "Explain which QA checks failed and why, what the automatic repair attempts changed, and the next manual step. Quote check names exactly.",
    async load(context) {
      const version = await latestVersion(context);
      if (!version) return { facts: "This article has no generated version, so there is no QA report.", sources: [{ label: "Article", path: projectPath(context.projectId!) }] };
      const repairs = await prisma.qualityRepairAttempt.findMany({
        where: { tenantId: context.tenantId, versionId: version.id },
        orderBy: { attemptNumber: "desc" },
        take: 3,
      });
      return {
        sources: [{ label: `QA of version ${version.versionNumber}`, path: projectPath(context.projectId!) }],
        facts: [
          `Version ${version.versionNumber} (${version.status}); autonomous gate passed: ${version.autonomousGatePassed}`,
          `QA report: ${JSON.stringify(version.qaReport ?? null).slice(0, 5000)}`,
          `Autonomous gate report: ${JSON.stringify(version.autonomousGateReport ?? null).slice(0, 2000)}`,
          `Repair attempts (latest first): ${JSON.stringify(
            repairs.map((r) => ({ attempt: r.attemptNumber, status: r.status, before: r.qaScoreBefore, after: r.qaScoreAfter, changed: r.changedFields, blockers: r.remainingBlockers, error: r.error })),
          ).slice(0, 3000)}`,
        ].join("\n"),
      };
    },
  },
  {
    key: "publication-status",
    label: "Publication attempts",
    description: "Lists the latest publications and attempts for the article (or the site) with their real status and errors.",
    scope: "site",
    permission: "analytics.read",
    mutates: false,
    intents: ["publication", "publicación", "publish", "publicar", "attempt", "intento", "wordpress"],
    instructions: "Summarise the publication state per channel, the latest error and whether a retry is scheduled. Never claim something was published unless the data says so.",
    async load(context) {
      const publications = await prisma.publication.findMany({
        where: {
          tenantId: context.tenantId,
          ...(context.projectId ? { projectId: context.projectId } : context.siteId ? { siteId: context.siteId } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 3 } },
      });
      return {
        sources: [{ label: "Publications", path: "/studio/publications" }],
        facts: publications.length
          ? publications
              .map((p) =>
                [
                  `- ${p.channel} · ${p.status} · updated ${p.updatedAt.toISOString()}${p.externalUrl ? ` · ${p.externalUrl}` : ""}`,
                  p.lastError ? `  last error: ${p.lastError.slice(0, 300)}` : "",
                  p.nextRetryAt ? `  next retry: ${p.nextRetryAt.toISOString()}` : "",
                  ...p.attempts.map((a) => `  attempt ${a.attemptNumber}: ${a.status}${a.error ? ` (${a.error.slice(0, 200)})` : ""}`),
                ]
                  .filter(Boolean)
                  .join("\n"),
              )
              .join("\n")
          : "No publications found for this scope.",
      };
    },
  },
  {
    key: "workspace-brief",
    label: "Workspace brief",
    description: "Counts articles by status, failed publications and failed jobs for the active site, and says what needs attention.",
    scope: "workspace",
    permission: "analytics.read",
    mutates: false,
    intents: ["status", "estado", "attention", "pending", "pendiente", "summary", "resumen", "overview"],
    instructions: "Give a short operational brief: what needs attention first, then what is in progress. Use only the counts provided.",
    async load(context) {
      const siteFilter = context.siteId ? { siteId: context.siteId } : {};
      const [byStatus, failedPublications, failedJobs] = await Promise.all([
        prisma.contentProject.groupBy({ by: ["status"], where: { tenantId: context.tenantId, deletedAt: null, ...siteFilter }, _count: { _all: true } }),
        prisma.publication.count({ where: { tenantId: context.tenantId, status: "failed", ...siteFilter } }),
        prisma.job.count({ where: { tenantId: context.tenantId, status: "failed", updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
      ]);
      return {
        sources: [
          { label: "Content", path: "/studio/content" },
          { label: "Activity", path: "/studio/activity" },
        ],
        facts: [
          `Articles by status: ${byStatus.map((row) => `${row.status}=${row._count._all}`).join(", ") || "none"}`,
          `Failed publications: ${failedPublications}`,
          `Failed jobs in the last 7 days (whole workspace): ${failedJobs}`,
        ].join("\n"),
      };
    },
  },
];

export function findCompetency(key: string | null | undefined): CompetencyDefinition | null {
  return COMPETENCIES.find((item) => item.key === key) ?? null;
}

/** Competencies whose scope the current context can satisfy. */
export function availableCompetencies(context: { projectId: string | null }): CompetencyDefinition[] {
  return COMPETENCIES.filter((item) => item.scope !== "project" || context.projectId);
}

/**
 * Picks the competency a free-form message asks for, limited to what the context allows.
 * Returns null for general questions, which are answered from the page context alone.
 */
export function selectCompetency(message: string, context: { projectId: string | null }): CompetencyDefinition | null {
  const text = message.toLowerCase();
  const scored = availableCompetencies(context)
    .map((item) => ({ item, score: item.intents.filter((phrase) => text.includes(phrase)).length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item ?? null;
}
