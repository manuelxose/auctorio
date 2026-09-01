// Level 1 deterministic entity extraction — no AI, no external calls.
// Produces confidence + source evidence for every mention.

import { buildEntityCanonicalKey, clampConfidence, type EntityEvidence, type EntityExtraction } from "./model";

const STOPWORDS = new Set([
  "the", "a", "an", "de", "la", "el", "los", "las", "del", "y", "e", "o", "u",
  "en", "con", "para", "por", "que", "news", "report", "how", "why", "what",
  "when", "who", "after", "before", "says", "said", "new", "first", "against",
  "over", "this", "that", "with", "from", "for", "and", "per", "via", "his",
  "her", "its", "their", "are", "was", "were", "will", "has", "have", "had",
  "not", "but", "as", "at", "in", "on", "of", "to", "is", "be", "by", "or",
]);

const PERSON_CUE = /\b(says|said|tells|told|director|directed by|stars?|starring|actor|actress|producer|executive|ceo|president)\s+(.+)$/i;

/** Suffix cues that classify a capitalized phrase as a company/studio. */
const COMPANY_CUES = /(studios?|pictures|films?|entertainment|productions?|media|network|corporation|inc|llc|group|co)$/i;

export type ExtractionInput = {
  title: string;
  description?: string | null;
  text?: string | null;
};

export type ExtractionOptions = {
  /** Max entities returned from one item (defensive cap). */
  maxEntities?: number;
};

function isCapitalizedWord(token: string): boolean {
  const cleaned = token.replace(/[^\p{L}\p{N}]/gu, "");
  return cleaned.length >= 2 && /^\p{Lu}/u.test(cleaned) && !/^\p{Lu}{2,}$/u.test(cleaned);
}

function collectPhrases(text: string): Array<{ phrase: string; start: number }> {
  const phrases: Array<{ phrase: string; start: number }> = [];
  const tokens = String(text ?? "").split(/\s+/);
  let baseIndex = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const cleaned = token.replace(/[^\p{L}\p{N}]/gu, "");
    if (!isCapitalizedWord(cleaned) || STOPWORDS.has(cleaned.toLowerCase())) {
      baseIndex += token.length + 1;
      continue;
    }
    // Extend into a run of up to 3 capitalized words.
    let phrase = cleaned;
    let run = 0;
    for (let next = index + 1; next < tokens.length && run < 2; next += 1) {
      const nextToken = tokens[next].replace(/[^\p{L}\p{N}]/gu, "");
      if (!/^\p{Lu}/u.test(nextToken) || STOPWORDS.has(nextToken.toLowerCase())) {
        break;
      }
      phrase += ` ${nextToken}`;
      run += 1;
    }
    phrases.push({ phrase, start: baseIndex });
    baseIndex += token.length + 1;
  }
  return phrases;
}

/** Classify a capitalized phrase using cheap deterministic cues. */
export function classifyCapitalizedPhrase(phrase: string): { type: string; confidence: number } {
  if (COMPANY_CUES.test(phrase)) {
    return { type: "organization", confidence: 0.8 };
  }
  const words = phrase.split(" ");
  if (words.length >= 2) {
    // Multi-word capitalized phrases in editorial text are usually proper nouns.
    return { type: "organization", confidence: 0.55 };
  }
  return { type: "person", confidence: 0.4 };
}

/** Extract quoted fragments as creative_work candidates. */
function extractQuotedWorks(text: string): EntityExtraction[] {
  const extractions: EntityExtraction[] = [];
  const pattern = /["“”']([^"“”'\n]{2,60})["“”']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length < 2 || /^\W+$/.test(name)) {
      continue;
    }
    extractions.push({
      domain: "generic",
      type: "creative_work",
      name,
      confidence: 0.6,
      evidence: [{ field: text.startsWith(match[1]) ? "title" : "description", match: name, method: "quote_pattern" }],
    });
  }
  return extractions;
}

/** Level 1 deterministic extraction over title + description + text. */
export function extractEntitiesFromText(input: ExtractionInput, options: ExtractionOptions = {}): EntityExtraction[] {
  const maxEntities = options.maxEntities ?? 20;
  const out: EntityExtraction[] = [];

  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();

  // 1. Quoted creative works (title strongest).
  for (const work of extractQuotedWorks(title)) {
    work.evidence[0].field = "title";
    work.confidence = 0.8;
    out.push(work);
  }

  // 2. Person cues in the description ("...says Scarlett Johansson").
  const personCue = PERSON_CUE.exec(description);
  if (personCue) {
    const name = personCue[2].trim();
    const words = name.split(/\s+/).filter(isCapitalizedWord);
    if (words.length >= 2 && words.length <= 4 && !STOPWORDS.has(words[words.length - 1].toLowerCase())) {
      out.push({
        domain: "generic",
        type: "person",
        name: words.join(" "),
        confidence: 0.7,
        evidence: [{ field: "description", match: name, method: "person_cue" }],
      });
    }
  }

  // 3. Capitalized phrases across title (strong) then description (weak).
  const titlePhrases = collectPhrases(title);
  const seen = new Set<string>();
  for (const { phrase } of titlePhrases) {
    if (seen.has(phrase.toLowerCase())) {
      continue;
    }
    seen.add(phrase.toLowerCase());
    const { type, confidence } = classifyCapitalizedPhrase(phrase);
    out.push({
      domain: "generic",
      type,
      name: phrase,
      confidence: clampConfidence(confidence + 0.1), // title evidence
      evidence: [{ field: "title", match: phrase, method: "capitalized_phrase" }],
    });
  }
  if (description) {
    for (const { phrase } of collectPhrases(description).slice(0, 12)) {
      if (seen.has(phrase.toLowerCase())) {
        continue;
      }
      seen.add(phrase.toLowerCase());
      const { type, confidence } = classifyCapitalizedPhrase(phrase);
      if (confidence < 0.5) {
        continue;
      }
      out.push({
        domain: "generic",
        type,
        name: phrase,
        confidence,
        evidence: [{ field: "description", match: phrase, method: "capitalized_phrase" }],
      });
    }
  }

  return out.slice(0, maxEntities);
}

/** Identity helper for tests and stores. */
export function extractionCanonicalKey(extraction: EntityExtraction): string {
  return buildEntityCanonicalKey(extraction.domain, extraction.type, extraction.name);
}

/** Merge evidence across duplicate extractions for the same entity. */
export function mergeExtractions(extractions: EntityExtraction[]): EntityExtraction[] {
  const byKey = new Map<string, EntityExtraction>();
  for (const extraction of extractions) {
    const key = extractionCanonicalKey(extraction);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...extraction, evidence: [...extraction.evidence] });
      continue;
    }
    existing.evidence.push(...extraction.evidence);
    existing.confidence = clampConfidence(Math.max(existing.confidence, extraction.confidence));
    if (extraction.externalIds) {
      existing.externalIds = { ...existing.externalIds, ...extraction.externalIds };
    }
    if (extraction.aliases) {
      existing.aliases = Array.from(new Set([...(existing.aliases ?? []), ...extraction.aliases]));
    }
  }
  return Array.from(byKey.values());
}

export type { EntityEvidence };
