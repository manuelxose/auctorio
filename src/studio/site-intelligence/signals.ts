/** Pure aggregations over analysed pages: SEO hygiene signals and inferential content opportunities. */

export type SignalPage = {
  url: string;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  wordCount: number | null;
  structuredData: unknown;
  canonicalUrl: string | null;
};

export type SeoSignal = { id: string; label: string; count: number; of: number; samples: string[] };

export type SiteOpportunity = {
  pillar: string;
  subtopic: string;
  reason: string;
  confidence: "low" | "medium" | "high";
  pagesRead: number;
};

const THIN_WORDS = 300;

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Counts of analysed pages with a given on-page issue. Facts about our crawl sample, not Google data. */
export function computeSeoSignals(pages: SignalPage[]): SeoSignal[] {
  const checks: Array<[string, string, (page: SignalPage) => boolean]> = [
    ["missing_meta_description", "No meta description", (p) => !p.metaDescription?.trim()],
    ["missing_h1", "No H1", (p) => !p.h1?.trim()],
    ["thin_content", `Under ${THIN_WORDS} words`, (p) => (p.wordCount ?? 0) < THIN_WORDS],
    ["no_structured_data", "No structured data (JSON-LD)", (p) => !Array.isArray(p.structuredData) || p.structuredData.length === 0],
    ["canonical_differs", "Canonical points to another URL", (p) => !!p.canonicalUrl && stripSlash(p.canonicalUrl) !== stripSlash(p.url)],
  ];
  return checks.map(([id, label, test]) => {
    const hits = pages.filter(test);
    return { id, label, count: hits.length, of: pages.length, samples: hits.slice(0, 3).map((p) => p.url) };
  });
}

function norm(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Subtopics of each pillar that no analysed page title/H1 mentions. Inferential: absence in our sample is
 * not absence on the site, so confidence follows how much of the site was actually read.
 */
export function computeOpportunities(
  pages: SignalPage[],
  pillars: Array<{ name: string; subtopics: string[] }>,
  discovered: number,
): SiteOpportunity[] {
  const haystack = pages.map((p) => norm(`${p.title ?? ""} ${p.h1 ?? ""}`));
  const ratio = discovered > 0 ? pages.length / discovered : 0;
  const confidence: SiteOpportunity["confidence"] = ratio >= 0.5 ? "high" : ratio >= 0.1 ? "medium" : "low";
  const out: SiteOpportunity[] = [];
  for (const pillar of pillars) {
    for (const subtopic of pillar.subtopics.slice(0, 20)) {
      const needle = norm(subtopic).trim();
      if (needle.length < 3) continue;
      if (haystack.some((text) => text.includes(needle))) continue;
      out.push({
        pillar: pillar.name,
        subtopic,
        reason: `No analysed page title or H1 mentions "${subtopic}" (${pages.length} of ${discovered} discovered pages read).`,
        confidence,
        pagesRead: pages.length,
      });
    }
  }
  return out.slice(0, 40);
}
