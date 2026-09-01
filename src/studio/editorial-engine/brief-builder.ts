// Editorial brief builder (Phase 4). Pure assembly of the structured brief
// from the classification, fact safety report, entities, enrichment and
// site knowledge. The full article is never generated before the brief.

import { LENGTH_BY_TYPE, type ClassificationResult } from "./classifier";
import type { FactSafetyReport } from "./fact-safety";
import { describeSiteValueProposition } from "./site-value";
import { getStructureSpec } from "./structure";
import type {
  EditorialBrief,
  EngineEnrichment,
  EngineEntity,
  SiteKnowledge,
} from "./types";

export type BriefInput = {
  headline: string;
  summary: string | null;
  classification: ClassificationResult;
  factSafety: FactSafetyReport;
  entities: EngineEntity[];
  enrichments: EngineEnrichment[];
  site: SiteKnowledge;
  ageHours: number;
  now?: Date;
};

const STORY_ANGLE_BY_TYPE: Record<string, string> = {
  breaking_news: "report the event as it is developing, prioritizing verified facts",
  standard_news: "report the event factually with verified context and attribution",
  developing_story: "track an actively developing story with explicit temporal language",
  movie_announcement: "explain what was announced, by whom, and what is confirmed",
  casting_news: "report the casting change and its context",
  release_date_news: "report the confirmed release date and where it comes from",
  trailer_news: "report the trailer release and what it shows (as verified)",
  streaming_availability: "explain where and when the title is available to stream",
  tv_programming: "report the programming/schedule facts and the channel",
  review_info: "inform the reader about the work using validated metadata",
  evergreen_explainer: "explain the work or topic durably for search readers",
  list_ranking: "rank/select works using only grounded facts",
  what_to_watch: "recommend what to watch using only validated availability",
  article_update: "update the existing article with the new verified facts",
};

function stripPunctuation(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function titleCaseStops(value: string): string {
  const stops = new Set(["the", "a", "an", "de", "la", "el", "los", "las", "y", "and", "of", "en", "for", "with"]);
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && stops.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Primary keyword: the strongest entity name or the headline's leading nouns. */
function derivePrimaryKeyword(entities: EngineEntity[], headline: string, type: string): string {
  const workEntity = entities.find((entity) => ["movie", "tv_series", "creative_work"].includes(entity.type));
  if (workEntity) {
    return workEntity.name;
  }
  const headlineWords = stripPunctuation(headline).split(" ").filter((word) => word.length > 3);
  const candidate = titleCaseStops(headlineWords.join(" "));
  return candidate || type;
}

function deriveSecondaryKeywords(entities: EngineEntity[], categories: string[], primary: string): string[] {
  const keywords = new Set<string>();
  for (const entity of entities) {
    if (entity.name.toLowerCase() !== primary.toLowerCase()) {
      keywords.add(entity.name);
    }
  }
  for (const category of categories) {
    keywords.add(category);
  }
  return Array.from(keywords).slice(0, 6);
}

export function buildStoryBrief(input: BriefInput): EditorialBrief {
  const now = input.now ?? new Date();
  const { classification } = input;
  const spec = getStructureSpec(classification.articleType);
  const primaryKeyword = derivePrimaryKeyword(input.entities, input.headline, classification.articleType);

  const verifiedFacts = input.factSafety.licenses
    .filter((license) => license.usage === "state" || license.usage === "state_confidently" || license.usage === "temporal_language")
    .map((license) => ({ factKey: license.factKey, statement: license.statement }));

  const unresolvedFacts = Array.from(
    new Map(
      input.factSafety.licenses
        .filter((license) => license.alternatives.length > 0 || license.usage === "represent_uncertainty")
        .map((license) => [license.factKey, { factKey: license.factKey, statements: [license.statement, ...license.alternatives] }]),
    ).values(),
  );

  const requiredAttribution = input.factSafety.requireAttribution.map((license) => ({
    publisher: license.sources[0]?.publisher ?? null,
    url: license.sources[0]?.url ?? null,
    reason: license.reasons.join("; "),
  }));

  const contentWarnings: string[] = [];
  if (input.factSafety.forbidden.length > 0) {
    contentWarnings.push(`forbidden facts detected (${input.factSafety.forbidden.map((license) => license.factKey).join(", ")}) — these must not appear in the article`);
  }
  if (input.factSafety.dateProblems.length > 0) {
    contentWarnings.push("date validation problems found in the ledger — affected dates must not be stated");
  }
  for (const license of input.factSafety.hedgedHighSensitivity) {
    contentWarnings.push(`high-sensitivity fact ${license.factKey} must use temporal language + attribution`);
  }
  if (classification.articleType === "developing_story") {
    contentWarnings.push("story is developing: use temporal language and mark the article as developing");
  }
  if (input.factSafety.licenses.some((license) => license.usage === "represent_uncertainty")) {
    contentWarnings.push("conflicting statements exist in the ledger — represent uncertainty explicitly, never pick one side silently");
  }

  const freshnessConstraints: string[] = [];
  if (input.ageHours <= 24) {
    freshnessConstraints.push(`story is ${Math.round(input.ageHours)}h old — write as current news`);
  } else if (input.ageHours <= 72) {
    freshnessConstraints.push(`story is ${Math.round(input.ageHours)}h old — avoid stale framing, use dates`);
  } else {
    freshnessConstraints.push(`story is ${Math.round(input.ageHours)}h old — frame as a durable/update piece if facts allow`);
  }
  freshnessConstraints.push("all dates and availability statements must come from the fact ledger");

  const relatedSiteContent = input.site.internalLinks.slice(0, 5).map((link) => link.title);
  const uniqueValueProposition = describeSiteValueProposition(input.site.siteValueBlocks);

  const audienceParts = [
    input.site.siteName ? `readers of ${input.site.siteName}` : null,
    input.site.siteType ? `(${input.site.siteType})` : null,
    classification.searchIntent === "commercial_investigation" ? "comparing options before deciding" : null,
  ].filter(Boolean);
  const audience = audienceParts.join(" ") || "general readers";

  return {
    storyAngle: STORY_ANGLE_BY_TYPE[classification.articleType] ?? "report the story factually",
    targetSite: {
      id: input.site.siteId,
      name: input.site.siteName,
      type: input.site.siteType,
      locale: input.site.locale,
    },
    audience,
    searchIntent: classification.searchIntent,
    articleType: classification.articleType,
    primaryKeyword,
    secondaryKeywords: deriveSecondaryKeywords(input.entities, [], primaryKeyword),
    entities: input.entities.map((entity) => ({
      name: entity.name,
      type: entity.type,
      externalIds: entity.externalIds,
    })),
    verifiedFacts,
    unresolvedFacts,
    requiredAttribution,
    internalLinkOpportunities: input.site.internalLinks.slice(0, 6),
    relatedSiteContent,
    uniqueValueProposition,
    targetLengthRange: { ...LENGTH_BY_TYPE[classification.articleType] },
    freshnessConstraints,
    contentWarnings,
    generatedAt: now.toISOString(),
  };
}

/** Render the brief as a compact text block for the writer prompt. */
export function renderBriefForWriter(brief: EditorialBrief): string {
  return [
    `Story angle: ${brief.storyAngle}`,
    `Target site: ${brief.targetSite.name ?? "n/a"} (${brief.targetSite.type ?? "n/a"}, ${brief.targetSite.locale ?? "n/a"})`,
    `Audience: ${brief.audience}`,
    `Search intent: ${brief.searchIntent}`,
    `Article type: ${brief.articleType}`,
    `Primary keyword: ${brief.primaryKeyword}`,
    `Secondary keywords: ${brief.secondaryKeywords.join(", ") || "(none)"}`,
    `Entities: ${brief.entities.map((entity) => `${entity.name} (${entity.type})`).join(", ") || "(none)"}`,
    `Verified facts:`,
    ...(brief.verifiedFacts.length
      ? brief.verifiedFacts.map((fact) => `- [${fact.factKey}] ${fact.statement}`)
      : ["- (none)"]),
    `Unresolved facts:`,
    ...(brief.unresolvedFacts.length
      ? brief.unresolvedFacts.map((fact) => `- [${fact.factKey}] ${fact.statements.join(" | ")}`)
      : ["- (none)"]),
    `Required attribution:`,
    ...(brief.requiredAttribution.length
      ? brief.requiredAttribution.map((entry) => `- ${entry.publisher ?? "source"} — ${entry.reason}`)
      : ["- (none)"]),
    `Internal link opportunities (real URLs only):`,
    ...(brief.internalLinkOpportunities.length
      ? brief.internalLinkOpportunities.map((link) => `- ${link.title} → ${link.url}`)
      : ["- (none)"]),
    `Related site content: ${brief.relatedSiteContent.join("; ") || "(none)"}`,
    `Unique value proposition: ${brief.uniqueValueProposition}`,
    `Target length: ${brief.targetLengthRange.min}–${brief.targetLengthRange.max} words`,
    `Freshness constraints:`,
    ...brief.freshnessConstraints.map((constraint) => `- ${constraint}`),
    `Content warnings:`,
    ...(brief.contentWarnings.length ? brief.contentWarnings.map((warning) => `- ${warning}`) : ["- (none)"]),
    `Structure template:`,
    ...renderStructureLines(brief),
  ].join("\n");
}

function renderStructureLines(brief: EditorialBrief): string[] {
  const spec = getStructureSpec(brief.articleType);
  const lines = [spec.description, "Sections:"];
  for (const section of spec.sections) {
    const heading = section.heading ? ` — H2 «${section.heading}»` : "";
    const required = section.required ? " (required)" : " (optional)";
    lines.push(`- ${section.kind}${heading}${required}: ${section.instruction}`);
  }
  lines.push(`Conclusion: ${spec.allowsConclusion ? "allowed when it adds value" : "do NOT add a conclusion"}.`);
  lines.push(`FAQ section: ${spec.allowsFaq ? "only if genuinely useful" : "do NOT force a FAQ"}.`);
  return lines;
}
