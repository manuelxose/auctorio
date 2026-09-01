// Provenance (Phase 4). Every licensed fact is mapped to the claims in the
// generated article that rely on it, so an editor can inspect why each
// important claim exists. Provenance is stored even when a fact does not
// require visible inline attribution.

import { sentenceSplit } from "./editorial-qa";
import type { FactLicense, ParsedArticle, ProvenanceEntry } from "./types";

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export type ProvenanceInput = {
  article: ParsedArticle;
  licenses: FactLicense[];
};

export function buildProvenance(input: ProvenanceInput): ProvenanceEntry[] {
  const { article, licenses } = input;
  const claims = article.claims.length > 0
    ? article.claims
    : sentenceSplit(article.bodyHtml.replace(/<[^>]+>/g, " ")).slice(0, 15).map((text) => ({
        text,
        factKey: null as string | null,
        attributionRequired: false,
      }));
  const bodyText = normalize(article.bodyHtml.replace(/<[^>]+>/g, " "));

  const entries: ProvenanceEntry[] = [];
  for (const license of licenses) {
    const statementNorm = normalize(license.statement);
    const matchingClaims: string[] = [];
    for (const claim of claims) {
      const claimNorm = normalize(claim.text);
      const factKeyMatch = claim.factKey !== null && claim.factKey === license.factKey;
      const tokenOverlap =
        claimNorm
          .split(/\s+/)
          .filter((token) => token.length > 4)
          .filter((token) => statementNorm.includes(token)).length >= 2;
      const statementContained = statementNorm.length > 10 && claimNorm.includes(statementNorm.slice(0, 40));
      if (factKeyMatch || tokenOverlap || statementContained) {
        matchingClaims.push(claim.text);
      }
    }

    const publisher = license.sources[0]?.publisher;
    const inlineAttributed =
      Boolean(publisher) &&
      matchingClaims.some((claim) => normalize(claim).includes(normalize(publisher ?? "")));

    entries.push({
      factKey: license.factKey,
      statement: license.statement,
      usage: license.usage,
      sensitivity: license.sensitivity,
      sources: license.sources,
      claims: matchingClaims.slice(0, 4),
      inlineAttributed,
    });
  }

  // Facts with no claim mapping are still kept (the editor sees unused
  // ledger facts), ordered so used facts come first.
  return entries.sort((left, right) => right.claims.length - left.claims.length);
}

/** Summary used by QA/gates: how many required-attribution facts were used. */
export function summarizeProvenance(entries: ProvenanceEntry[]): {
  usedFacts: number;
  attributedUsedFacts: number;
  unattributedUsedSingleSource: number;
  sourceGroups: Set<string>;
} {
  const sourceGroups = new Set<string>();
  let usedFacts = 0;
  let attributedUsedFacts = 0;
  let unattributedUsedSingleSource = 0;
  for (const entry of entries) {
    for (const source of entry.sources) {
      if (source.group) {
        sourceGroups.add(source.group);
      }
    }
    if (entry.claims.length === 0) {
      continue;
    }
    usedFacts += 1;
    if ((entry.usage === "attribute" || entry.usage === "represent_uncertainty" || entry.usage === "temporal_language") && entry.inlineAttributed) {
      attributedUsedFacts += 1;
    }
    if ((entry.usage === "attribute" || entry.usage === "represent_uncertainty") && !entry.inlineAttributed) {
      unattributedUsedSingleSource += 1;
    }
  }
  return { usedFacts, attributedUsedFacts, unattributedUsedSingleSource, sourceGroups };
}
