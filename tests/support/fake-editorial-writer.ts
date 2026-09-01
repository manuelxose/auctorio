// Deterministic fake editorial writer (test support, Phase 4).
//
// Reads the assembled writer prompt (fact ledger lines, primary keyword,
// structure template) and produces a synthetic original article that is
// grounded in the ledger: attributed claims, external links for attributed
// facts, structure-driven H2 sections and paraphrased headline text (never
// verbatim source spans). Deterministic for CI.

import type { WriterGenerationInput, WriterGenerationResult } from "../../src/studio/editorial-engine/writer-provider";
import type { ParsedArticle } from "../../src/studio/editorial-engine/types";

export type PromptFact = { key: string; statement: string; usage: string; publisher: string | null; url: string | null };

function isoToReadableDate(statement: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(statement);
  if (!match) {
    return statement;
  }
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = months[Number.parseInt(match[2], 10) - 1] ?? "";
  return `${month} ${Number.parseInt(match[3], 10)}, ${match[1]}`;
}

export function extractFactsFromPrompt(prompt: string): PromptFact[] {
  const facts: PromptFact[] = [];
  const regex = /^- \[([a-z_]+)\] "([^"]*)" — usage: ([a-z_]+)[^\n]*?sources: ([^—\n]+)/gm;
  for (const match of prompt.matchAll(regex)) {
    const sourcesRaw = (match[4] ?? "").trim();
    const publisher = sourcesRaw.split("<")[0]?.trim() || null;
    const urlMatch = /<(https?:\/\/[^>]+)>/.exec(sourcesRaw);
    facts.push({
      key: match[1],
      statement: match[2],
      usage: match[3],
      publisher: publisher && publisher !== "unknown" ? publisher : null,
      url: urlMatch?.[1] ?? null,
    });
  }
  return facts;
}

export function extractKeywordFromPrompt(prompt: string): string {
  const match = /Primary keyword: (.+)/.exec(prompt);
  return (match?.[1] ?? "Story").trim();
}

/** Required H2 headings declared in the structure template. */
export function extractRequiredHeadings(prompt: string): string[] {
  const headings: string[] = [];
  const regex = /\(heading: ([^)]+)\)\s*\[required\]/g;
  for (const match of prompt.matchAll(regex)) {
    headings.push(match[1].trim());
  }
  return headings;
}

export function buildFakeArticleFromPrompt(prompt: string, injectUnsupportedYear = false): ParsedArticle {
  const keyword = extractKeywordFromPrompt(prompt);
  const facts = extractFactsFromPrompt(prompt).filter((fact) => fact.usage !== "forbidden");
  const requiredHeadings = extractRequiredHeadings(prompt);

  const sentenceFor = (fact: PromptFact): string => {
    if (fact.key === "headline") {
      // Never reproduce the source headline verbatim.
      return `The story was reported by ${fact.publisher ?? "the original source"} and is covered in this report.`;
    }
    const statement = isoToReadableDate(fact.statement);
    if (fact.usage === "attribute" && fact.publisher) {
      return `According to ${fact.publisher}, ${statement}.`;
    }
    if (fact.usage === "represent_uncertainty") {
      return `Sources disagree on this detail. ${fact.publisher ? `One report from ${fact.publisher} says ${statement}.` : statement}`;
    }
    if (fact.usage === "temporal_language") {
      return `As of now, ${statement}.`;
    }
    return statement;
  };

  const claims = facts.map((fact) => ({
    text: sentenceFor(fact),
    factKey: fact.key,
    attributionRequired: fact.usage === "attribute" || fact.usage === "represent_uncertainty",
  }));

  const paragraphs: string[] = [];
  paragraphs.push(
    `<p>${keyword}: the story develops from verified reporting. ${claims.slice(0, 2).map((claim) => claim.text).join(" ")}</p>`,
  );

  const attributed = facts.find((fact) => fact.usage === "attribute" || fact.usage === "represent_uncertainty");
  if (attributed?.url) {
    paragraphs.push(
      `<p>Read the original report at <a href="${attributed.url}">${attributed.publisher ?? "the source"}</a>.</p>`,
    );
  }

  // Structure-driven sections: one H2 per required heading, claims distributed.
  let index = 2;
  for (const heading of requiredHeadings.slice(0, 3)) {
    const sectionClaims = claims.slice(index, index + 3);
    index += 3;
    const body =
      sectionClaims.length > 0
        ? sectionClaims.map((claim) => claim.text).join(" ")
        : "The verified facts for this section are covered in the rest of the report.";
    paragraphs.push(`<h2>${heading}</h2>`);
    paragraphs.push(`<p>${body} The information here comes from the verified fact ledger for this story.</p>`);
  }

  // Remaining claims.
  const rest = claims.slice(index);
  if (rest.length > 0) {
    paragraphs.push(`<h2>Further details</h2>`);
    paragraphs.push(`<p>${rest.map((claim) => claim.text).join(" ")}</p>`);
  }

  paragraphs.push(
    `<p>More verified details will be added as the story develops, in line with the editorial brief for this piece.</p>`,
  );
  if (injectUnsupportedYear) {
    paragraphs.push(`<p>The franchise traces back to 1931.</p>`);
  }

  const excerpt = `Everything verified so far about ${keyword}, synthesized from the fact ledger.`;
  const seoTitle = `${keyword}: todos los detalles`.slice(0, 66);
  const seoDescription =
    `${excerpt} Details confirmed by reporting, context from the editorial brief and validated availability data where present.`.slice(0, 160);

  return {
    title: keyword,
    h1: keyword,
    excerpt,
    bodyHtml: paragraphs.join("\n"),
    seoTitle,
    seoDescription,
    claims,
  };
}

export class FakeWriter {
  constructor(private readonly injectUnsupportedYear = false) {}
  async generate(input: WriterGenerationInput): Promise<WriterGenerationResult> {
    const parsed = buildFakeArticleFromPrompt(input.prompt, this.injectUnsupportedYear);
    return {
      output: JSON.stringify(parsed),
      provider: "fake-writer",
      model: "fake-model",
      usage: { promptTokens: 10, completionTokens: 10 },
    };
  }
}
