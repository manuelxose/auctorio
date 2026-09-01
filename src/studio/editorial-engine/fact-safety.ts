// Fact safety (Phase 4): the Fact Ledger is turned into per-fact usage
// licenses that the writer must obey. Dates and availability are
// high-sensitivity editorial facts and are validated here.

import type {
  FactLicense,
  FactSensitivity,
  FactUsage,
  LedgerFact,
} from "./types";

/** Fact keys that are high-sensitivity editorial facts. */
export const HIGH_SENSITIVITY_FACT_KEYS = new Set([
  "published_at",
  "release_year",
  "release_date",
  "streaming_availability",
  "title_identity",
  "cast_member",
]);

/** Fact keys whose different statements mean a real conflict. */
export const CONFLICT_SENSITIVE_KEYS = new Set(["published_at", "release_year", "release_date", "title_identity"]);

const USAGE_HINTS: Record<FactUsage, string> = {
  state_confidently: "State this fact confidently without hedging.",
  state: "State this fact; no attribution needed.",
  attribute: "Attribute this fact to its source (e.g. «according to Variety»).",
  temporal_language: "Use temporal language («as of», «so far», «reported») and avoid definitive phrasing.",
  represent_uncertainty: "Represent the uncertainty explicitly («sources disagree: X says A, Y says B»).",
  forbidden: "Do NOT state this fact in the article.",
};

export function sensitivityForFact(factKey: string): FactSensitivity {
  return HIGH_SENSITIVITY_FACT_KEYS.has(factKey) ? "high" : "normal";
}

export function isDateLikeFact(factKey: string): boolean {
  return factKey === "published_at" || factKey === "release_date" || factKey === "release_year";
}

/** Validate an ISO date or year statement. Returns a reason when invalid. */
export function validateDateStatement(statement: string): { valid: boolean; reason: string | null } {
  const trimmed = statement.trim();
  if (/^\d{4}$/.test(trimmed)) {
    const year = Number.parseInt(trimmed, 10);
    if (year < 1888 || year > 2100) {
      return { valid: false, reason: `implausible year ${trimmed}` };
    }
    return { valid: true, reason: null };
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return { valid: false, reason: `unparseable date ${trimmed}` };
  }
  const year = new Date(parsed).getUTCFullYear();
  if (year < 1888 || year > 2100) {
    return { valid: false, reason: `implausible date ${trimmed}` };
  }
  return { valid: true, reason: null };
}

export type FactSafetyContext = {
  clusterVerificationState: string;
  independentPublisherGroups: number;
};

/**
 * Compute the usage license for one fact given its ledger evidence.
 * Pure function — no model involved.
 */
export function licenseFact(
  fact: LedgerFact,
  context: FactSafetyContext,
): FactLicense {
  const reasons: string[] = [];
  const sensitivity = sensitivityForFact(fact.factKey);
  const alternatives = fact.conflictingStatements.slice();

  let usage: FactUsage;
  const cluster = context.clusterVerificationState;

  if (fact.verificationStatus === "conflicting") {
    usage = "represent_uncertainty";
    reasons.push("conflicting statements recorded in the ledger");
  } else if (cluster === "disputed") {
    usage = "represent_uncertainty";
    reasons.push("cluster verification is disputed");
  } else if (cluster === "developing" || fact.verificationStatus === "developing") {
    usage = "temporal_language";
    reasons.push("story is actively developing");
  } else if (cluster === "high_confidence" || fact.supportingGroups >= 2 || (cluster === "corroborated" && fact.supportingGroups >= 2)) {
    usage = "state_confidently";
    reasons.push(`supported by ${fact.supportingGroups} independent publisher group(s)`);
  } else if (cluster === "corroborated") {
    usage = "state";
    reasons.push("cluster corroborated across publishers");
  } else if (cluster === "single_source" || fact.supportingGroups <= 1) {
    usage = "attribute";
    reasons.push("single-source fact; attribution may be required");
  } else {
    usage = "attribute";
    reasons.push("unverified fact");
  }

  // High-sensitivity facts (dates, availability) must be corroborated to be
  // stated without attribution; otherwise hedge or attribute.
  if (sensitivity === "high") {
    reasons.push("high-sensitivity editorial fact");
    if (usage === "state" || usage === "state_confidently") {
      // confirmed usage stays; corroboration already checked above
    } else if (usage === "attribute") {
      usage = "temporal_language";
      reasons.push("single-source date/availability must use temporal language and attribution");
    }
  }

  // Invalid or implausible dates can never be stated.
  if (isDateLikeFact(fact.factKey)) {
    const check = validateDateStatement(fact.statement);
    if (!check.valid) {
      usage = "forbidden";
      reasons.push(`date validation failed: ${check.reason}`);
    }
  }

  return {
    factKey: fact.factKey,
    statement: fact.statement,
    usage,
    sensitivity,
    reasons,
    phrasingHint: USAGE_HINTS[usage],
    sources: [
      {
        publisher: fact.publisher,
        url: fact.sourceUrl,
        group: fact.publisherGroup,
      },
    ],
    alternatives,
  };
}

/** License every fact variant in the ledger (one license per fact row). */
export function buildFactLicenses(facts: LedgerFact[], context: FactSafetyContext): FactLicense[] {
  return facts.map((fact) => licenseFact(fact, context));
}

export type FactSafetyReport = {
  licenses: FactLicense[];
  /** Facts the writer must not state at all. */
  forbidden: FactLicense[];
  /** High-sensitivity facts with a non-confident usage. */
  hedgedHighSensitivity: FactLicense[];
  /** Facts requiring visible attribution. */
  requireAttribution: FactLicense[];
  dateProblems: Array<{ factKey: string; statement: string; reason: string }>;
};

export function buildFactSafetyReport(facts: LedgerFact[], context: FactSafetyContext): FactSafetyReport {
  const licenses = buildFactLicenses(facts, context);
  return {
    licenses,
    forbidden: licenses.filter((license) => license.usage === "forbidden"),
    hedgedHighSensitivity: licenses.filter(
      (license) =>
        license.sensitivity === "high" &&
        (license.usage === "attribute" || license.usage === "temporal_language" || license.usage === "represent_uncertainty"),
    ),
    requireAttribution: licenses.filter(
      (license) => license.usage === "attribute" || license.usage === "represent_uncertainty",
    ),
    dateProblems: facts
      .filter((fact) => isDateLikeFact(fact.factKey))
      .map((fact) => ({ factKey: fact.factKey, statement: fact.statement, reason: validateDateStatement(fact.statement).reason ?? "" }))
      .filter((entry) => entry.reason),
  };
}

// ────────────────────────────────────────────────────────────── Copyright

const COPYRIGHT_CUES = [
  /all rights reserved/i,
  /copyright\s+[©(]/i,
  /do not reproduce/i,
  /reprinted with permission/i,
  /exclusive:\s*["']/i,
];

/** Long verbatim excerpts from a source can never appear in an original
 *  article. This detector flags them before QA runs. */
export function detectVerbatimOverlap(
  bodyText: string,
  sourceTexts: string[],
  options: { minSpan?: number; minOverlap?: number } = {},
): Array<{ excerpt: string; ratio: number }> {
  const minSpan = options.minSpan ?? 9;
  const minOverlap = options.minOverlap ?? 0.7;
  const findings: Array<{ excerpt: string; ratio: number }> = [];
  const body = bodyText.replace(/\s+/g, " ").trim();
  if (body.length < minSpan) {
    return findings;
  }
  const bodyWords = body.split(" ");
  for (const sourceText of sourceTexts) {
    const source = sourceText.replace(/\s+/g, " ").trim();
    if (source.length < minSpan) {
      continue;
    }
    const sourceWords = source.split(" ");
    for (let start = 0; start + minSpan <= Math.min(bodyWords.length, 400); start += 1) {
      const span = bodyWords.slice(start, start + minSpan).join(" ");
      if (!source.includes(span)) {
        continue;
      }
      // Extend the matched span forward.
      let end = start + minSpan;
      while (end < bodyWords.length && end - start < 80 && source.includes(bodyWords.slice(start, end + 1).join(" "))) {
        end += 1;
      }
      const excerpt = bodyWords.slice(start, end).join(" ");
      const ratio = (end - start) / Math.max(1, sourceWords.length);
      if (ratio >= minOverlap) {
        findings.push({ excerpt: excerpt.slice(0, 160), ratio: Math.round(ratio * 100) / 100 });
      }
      start = end - 1;
    }
  }
  return findings.slice(0, 5);
}

export function hasCopyrightWarningCues(sourceTitles: string[]): boolean {
  return sourceTitles.some((title) => COPYRIGHT_CUES.some((cue) => cue.test(title)));
}
