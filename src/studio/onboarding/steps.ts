// Built-in onboarding step handlers (index, profile, strategy, first_plan_offer).
// "sources" and "competitors" are registered by their own modules.

import { getPrismaClient } from "../../infrastructure/db/prisma";
import { buildSiteEditorialProfile } from "../intelligence/site-editorial-profile";
import { notify } from "../notifications";
import { refreshSiteIntelligence } from "../site-intelligence";
import { rebuildSiteProfile } from "../site-intelligence/profile";
import { getApprovedStrategy, regenerateStrategySuggestion } from "../site-intelligence/strategy";
import { getOnboardingStep, registerOnboardingStep, type OnboardingStepHandler, type OnboardingStepId } from "./contracts";

const prisma = getPrismaClient();

const indexStep: OnboardingStepHandler = async ({ tenantId, siteId }) => {
  const alreadyIndexed = await prisma.siteIndexedPage.count({ where: { tenantId, siteId } });
  // Joins an in-flight manual index for the same site instead of starting a second crawl.
  const result = await refreshSiteIntelligence(tenantId, siteId, { crawl: true, changedOnly: alreadyIndexed > 0 });
  const pages = await prisma.siteIndexedPage.count({ where: { tenantId, siteId } });
  if (pages === 0) {
    throw new Error(`no pages could be discovered on the website${result.warnings.length ? ` (${result.warnings.slice(0, 2).join("; ")})` : ""}`);
  }
  return {
    summary: `Found ${result.urlsFromSitemaps} URL(s) in ${result.sitemapsDiscovered} sitemap(s); crawled ${result.pagesExtracted} page(s)${result.pagesFailed ? `, ${result.pagesFailed} failed` : ""}.`,
    counts: {
      sitemaps: result.sitemapsDiscovered,
      urls: result.urlsFromSitemaps,
      pagesIndexed: pages,
      pagesCrawled: result.pagesExtracted,
      pagesFailed: result.pagesFailed,
    },
  };
};

const profileStep: OnboardingStepHandler = async ({ tenantId, siteId }) => {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) throw new Error("site_not_found");
  // The index step rebuilds the detected profile; rebuild only if it is missing. Both upsert by site.
  const existing = await prisma.siteIntelligenceProfile.findUnique({ where: { siteId } });
  const profile = existing ? null : await rebuildSiteProfile(site);
  const row = existing ?? (await prisma.siteIntelligenceProfile.findUnique({ where: { siteId } }));
  const editorial = await buildSiteEditorialProfile(tenantId, siteId);
  const topics = Array.isArray(row?.mainTopics) ? row.mainTopics.length : 0;
  const clusters = Array.isArray(row?.topicClusters) ? row.topicClusters.length : 0;
  return {
    summary: `Site profile v${row?.version ?? profile?.version ?? 1}: ${topics} topic(s), ${clusters} cluster(s), language ${row?.detectedLanguage ?? editorial?.language ?? "unknown"}.`,
    counts: { topics, clusters, pages: row?.pageCount ?? 0 },
  };
};

const strategyStep: OnboardingStepHandler = async ({ tenantId, siteId }) => {
  const suggestion = await regenerateStrategySuggestion(tenantId, siteId);
  if (!suggestion.generated) throw new Error(suggestion.reason ?? "strategy suggestion could not be generated");
  const approved = await getApprovedStrategy(tenantId, siteId);
  return {
    summary: approved
      ? `Suggested ${suggestion.pillars} pillar(s) (${suggestion.source}). Your approved strategy v${approved.version} is unchanged.`
      : `Suggested ${suggestion.pillars} pillar(s) (${suggestion.source}). Review and approve it in Site intelligence.`,
    counts: { pillars: suggestion.pillars, approvedVersion: approved?.version ?? 0 },
  };
};

const firstPlanOfferStep: OnboardingStepHandler = async ({ tenantId, siteId, userId }) => {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { name: true } });
  if (!site) throw new Error("site_not_found");
  const actionUrl = `/studio/editorial-plan?siteId=${siteId}`;
  // Only an offer: no plan or content is generated or published here.
  await notify({
    tenantId,
    userId,
    siteId,
    category: "editorial",
    severity: "success",
    title: "Ready for the first editorial plan",
    message: `${site.name} has been analysed. Review the suggested strategy, then create its first editorial plan.`,
    entityType: "site",
    entityId: siteId,
    actionUrl,
    dedupeKey: `onboarding.${siteId}.first_plan`,
  });
  return { summary: "The site is ready for its first editorial plan.", counts: {} };
};

const BUILT_IN: Array<[OnboardingStepId, OnboardingStepHandler]> = [
  ["index", indexStep],
  ["profile", profileStep],
  ["strategy", strategyStep],
  ["first_plan_offer", firstPlanOfferStep],
];

/** Registers the built-ins without replacing a handler another module (or a test) already set. */
export function registerBuiltInOnboardingSteps(): void {
  for (const [id, handler] of BUILT_IN) {
    if (!getOnboardingStep(id)) registerOnboardingStep(id, handler);
  }
}
