import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getTextProvider } from "../infrastructure/ai/text";
import { extractJsonObject } from "./social";
import { SOURCE_DATA_RULES, wrapUntrustedContent } from "./prompt-injection";

const prisma = getPrismaClient();

export type DiscoveryQueryPlan = {
  queries: Array<{
    queryText: string;
    category: "breaking" | "latest" | "official_announcement" | "primary_source" | "industry" | "local" | "expert" | "followup";
  }>;
  entities: string[];
  topics: string[];
  freshness: "breaking" | "recent" | "evergreen";
  preferredDomains: string[];
  excludedDomains: string[];
  language: string;
  country: string | null;
  reasoningSummary: string;
};

const QUERY_CATEGORIES = [
  "breaking",
  "latest",
  "official_announcement",
  "primary_source",
  "industry",
  "local",
  "expert",
  "followup",
] as const;

export type EditorialDiscoveryContext = {
  siteName: string;
  siteKey: string;
  locale: string;
  topics: string[];
  priorityTopics: string[];
  excludedCategories: string[];
  existingSources: string[];
  recentTitles: string[];
  language: string;
  country: string | null;
};

export async function gatherEditorialContext(tenantId: string, siteId: string | null): Promise<EditorialDiscoveryContext | null> {
  const where = siteId ? { tenantId, siteId } : { tenantId };
  const site = siteId
    ? await prisma.site.findFirst({ where: { id: siteId, tenantId } })
    : await prisma.site.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" } });

  const since = new Date(Date.now() - 7 * 24 * 3_600_000);
  const [sources, recentItems, recentProjects, policy] = await Promise.all([
    prisma.contentSource.findMany({ where, orderBy: { priority: "desc" }, take: 30, select: { name: true, url: true, categories: true } }),
    prisma.sourceItem.findMany({ where: { ...where, discoveredAt: { gte: since } }, orderBy: { discoveredAt: "desc" }, take: 40, select: { title: true } }),
    prisma.contentProject.findMany({ where: { ...where, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20, select: { title: true } }),
    prisma.automationPolicy.findFirst({ where }),
  ]);

  const topics = new Set<string>();
  const categories = new Set<string>();
  for (const source of sources) {
    topics.add(source.name);
    for (const category of Array.isArray(source.categories) ? source.categories.map(String) : []) {
      categories.add(category);
    }
  }
  for (const category of Array.isArray(policy?.categories) ? policy.categories.map(String) : []) {
    categories.add(category);
  }
  for (const category of Array.isArray(policy?.priorityTopics) ? policy.priorityTopics.map(String) : []) {
    categories.add(category);
  }

  if (!site) {
    return null;
  }

  return {
    siteName: site.name,
    siteKey: site.key,
    locale: site.locale,
    topics: Array.from(categories).slice(0, 20),
    priorityTopics: Array.isArray(policy?.priorityTopics) ? policy.priorityTopics.map(String) : [],
    excludedCategories: Array.isArray(policy?.excludedCategories) ? policy.excludedCategories.map(String) : [],
    existingSources: sources.map((source) => source.url ?? source.name).filter(Boolean),
    recentTitles: [...recentItems.map((item) => item.title), ...recentProjects.map((project) => project.title)],
    language: site.locale?.startsWith("en") ? "en" : "es",
    country: null,
  };
}

function buildPlanPrompt(context: EditorialDiscoveryContext): { systemPrompt: string; userPrompt: string } {
  const locale = context.language === "en" ? "English" : "Spanish";
  const dataBlock = wrapUntrustedContent(
    "editorial-context",
    [
      `Publication: ${context.siteName} (${context.siteKey}), locale ${context.locale}`,
      `Known topics: ${context.topics.join(", ") || "none recorded"}`,
      `Priority topics: ${context.priorityTopics.join(", ") || "none"}`,
      `Excluded subjects: ${context.excludedCategories.join(", ") || "none"}`,
      `Existing sources: ${context.existingSources.slice(0, 15).join(", ") || "none"}`,
      `Recently covered (avoid duplicates): ${context.recentTitles.slice(0, 15).join(" | ") || "none"}`,
    ].join("\n"),
  );
  return {
    systemPrompt: `You are the editorial discovery planner for ${context.siteName}, an editorial publication. You decide what the live web should be monitored for, and produce several independent, concrete web-search queries.
${SOURCE_DATA_RULES}
You return ONLY valid JSON with exactly this shape:
{
  "queries": [{"queryText": string, "category": "breaking"|"latest"|"official_announcement"|"primary_source"|"industry"|"local"|"expert"|"followup"}],
  "entities": [string],
  "topics": [string],
  "freshness": "breaking"|"recent"|"evergreen",
  "preferredDomains": [string],
  "excludedDomains": [string],
  "language": string,
  "country": string|null,
  "reasoningSummary": string
}
Rules:
- Write queries in ${locale}. Each query must be concrete and searchable (4-9 queries).
- Never include hidden reasoning: reasoningSummary must be a short operational note under 200 characters describing the plan.
- Exclude subjects listed as excluded. Do not repeat coverage already produced.
- Respect the publication niche. Prefer queries that surface primary sources and official announcements.`,
    userPrompt: [
      dataBlock,
      ``,
      `Produce the discovery plan JSON now.`,
    ].join("\n"),
  };
}

export function parseDiscoveryPlan(output: string): DiscoveryQueryPlan | null {
  const parsed = extractJsonObject(output);
  if (!parsed) {
    return null;
  }
  const rawQueries = Array.isArray(parsed.queries) ? parsed.queries : [];
  const queries = rawQueries
    .map((entry): DiscoveryQueryPlan["queries"][number] | null => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const queryText = typeof record.queryText === "string" ? record.queryText.trim() : "";
      const category = typeof record.category === "string" ? record.category : "";
      if (!queryText || !QUERY_CATEGORIES.includes(category as (typeof QUERY_CATEGORIES)[number])) {
        return null;
      }
      return { queryText: queryText.slice(0, 240), category: category as DiscoveryQueryPlan["queries"][number]["category"] };
    })
    .filter((entry): entry is DiscoveryQueryPlan["queries"][number] => entry !== null)
    .slice(0, 9);

  if (queries.length === 0) {
    return null;
  }

  const stringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 30) : [];

  const freshness =
    parsed.freshness === "breaking" || parsed.freshness === "recent" || parsed.freshness === "evergreen"
      ? parsed.freshness
      : "recent";

  return {
    queries,
    entities: stringList(parsed.entities),
    topics: stringList(parsed.topics),
    freshness,
    preferredDomains: stringList(parsed.preferredDomains),
    excludedDomains: stringList(parsed.excludedDomains),
    language: typeof parsed.language === "string" && parsed.language ? parsed.language : "es",
    country: typeof parsed.country === "string" && parsed.country ? parsed.country : null,
    reasoningSummary: typeof parsed.reasoningSummary === "string" ? parsed.reasoningSummary.slice(0, 300) : "",
  };
}

export async function planDiscovery(
  tenantId: string,
  siteId: string | null,
): Promise<{ plan: DiscoveryQueryPlan; provider: string; model: string } | null> {
  const context = await gatherEditorialContext(tenantId, siteId);
  if (!context) {
    return null;
  }
  const provider = getTextProvider();
  const prompt = buildPlanPrompt(context);
  const result = await provider.generate({
    prompt: prompt.userPrompt,
    systemPrompt: prompt.systemPrompt,
    temperature: 0.4,
    maxTokens: 1_200,
  });
  const plan = parseDiscoveryPlan(result.output);
  if (!plan) {
    throw new Error("discovery_plan_parse_failed");
  }
  return { plan, provider: result.provider, model: result.model };
}
