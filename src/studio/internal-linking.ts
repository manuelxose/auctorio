import { getPrismaClient } from "../infrastructure/db/prisma";

const prisma = getPrismaClient();

export type InternalLinkSuggestion = {
  url: string;
  title: string;
  anchor: string;
  reason: string;
  score: number;
};

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 3);
}

function slugTokens(url: string): string[] {
  const path = new URL(url).pathname;
  return tokenize(path.replace(/[-_/]+/g, " "));
}

function anchorFromTitle(title: string): string {
  const cleaned = title.replace(/[|—–-].*$/, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}…` : cleaned;
}

/**
 * Deterministic internal-linking engine. Every suggested URL comes from the
 * site's indexed inventory — the AI never invents internal URLs.
 */
export async function suggestInternalLinks(
  tenantId: string,
  siteId: string,
  options: { keyword?: string | null; topic?: string | null; query?: string | null; excludeUrl?: string | null; limit?: number; fillWithHubs?: boolean } = {},
): Promise<InternalLinkSuggestion[]> {
  const limit = Math.min(40, Math.max(1, options.limit ?? 5));
  const queryTokens = tokenize(`${options.keyword ?? ""} ${options.topic ?? ""} ${options.query ?? ""}`);
  if (queryTokens.length === 0) {
    return [];
  }

  const pages = await prisma.siteIndexedPage.findMany({
    where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } },
    select: { url: true, title: true, contentType: true, wordCount: true, modifiedAt: true },
    take: 1500,
  });

  const suggestions: InternalLinkSuggestion[] = [];
  const hubs: Array<InternalLinkSuggestion & { depth: number; words: number }> = [];
  for (const page of pages) {
    if (options.excludeUrl && page.url === options.excludeUrl) {
      continue;
    }
    const title = page.title ?? page.url;
    const titleTokens = tokenize(title);
    const urlTokens = slugTokens(page.url);
    const titleHits = queryTokens.filter((token) => titleTokens.includes(token)).length;
    const urlHits = queryTokens.filter((token) => urlTokens.includes(token)).length;
    const keywordMatchScore = titleHits * 3 + urlHits * 2;
    if (keywordMatchScore === 0) {
      // Guides need ≥10 internal links (BLG parity): top up with the site's shallowest pages (hubs, sections).
      if (options.fillWithHubs) hubs.push({ url: page.url, title, anchor: anchorFromTitle(title), reason: "site hub page", score: 0, depth: urlDepth(page.url), words: page.wordCount ?? 0 });
      continue;
    }

    const contentTypeAffinity = options.topic && page.contentType && tokenize(options.topic).some((token) => tokenize(page.contentType ?? "").includes(token) || tokenize(page.contentType ?? "").length === 0) ? 2 : 0;
    const depthBonus = (page.wordCount ?? 0) > 600 ? 1 : 0;
    const score = Math.round(Math.min(100, keywordMatchScore * 8 + contentTypeAffinity * 5 + depthBonus * 3));

    const reasons: string[] = [];
    if (titleHits > 0) {
      reasons.push("title matches keywords");
    }
    if (urlHits > 0) {
      reasons.push("slug matches keywords");
    }
    if (contentTypeAffinity > 0 && options.topic) {
      reasons.push(`same content type (${page.contentType})`);
    }
    if ((page.wordCount ?? 0) > 600) {
      reasons.push("authoritative page");
    }

    suggestions.push({
      url: page.url,
      title,
      anchor: anchorFromTitle(title),
      reason: reasons.join(", "),
      score,
    });
  }

  const ranked = suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
  const fill = hubs.sort((a, b) => a.depth - b.depth || b.words - a.words).slice(0, limit - ranked.length);
  return [...ranked, ...fill.map(({ depth: _depth, words: _words, ...link }) => link)];
}

function urlDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 99;
  }
}
