/** Every article carries at least this many images inside the body, besides the hero. */
export const INLINE_IMAGE_MIN = 3;

/** dedupeHash of an inline image: ties it to a version and a slot without a schema change. */
export function inlineImageHash(versionId: string, slot: number, nonce: string): string {
  return `inline:${versionId}:${slot}:${nonce}`;
}

export function parseInlineImageHash(hash: string | null | undefined): { versionId: string; slot: number } | null {
  const match = /^inline:([0-9a-f-]{36}):(\d+):/i.exec(hash ?? "");
  return match ? { versionId: match[1], slot: Number(match[2]) } : null;
}

/** Slots already filled in the body (figures carry data-auctorio-slot). */
export function filledInlineSlots(html: string): number[] {
  return [...html.matchAll(/data-auctorio-slot=["'](\d+)["']/gi)].map((match) => Number(match[1]));
}

/** H2 headings as plain text, used to give each inline image its own subject. */
export function h2Headings(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((match) => match[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
}

/** H2 index the image of `slot` goes under: spread through the body, skipping the opening section. */
export function headingIndexForSlot(slot: number, headingCount: number, total = INLINE_IMAGE_MIN): number {
  if (headingCount <= 0) return -1;
  return Math.min(headingCount - 1, Math.floor(((slot + 1) * headingCount) / (total + 1)));
}

/**
 * Inserts `figureHtml` after the first paragraph of the slot's section (or at the
 * matching paragraph when the body has no H2). Idempotent per slot.
 */
export function insertInlineFigure(html: string, figureHtml: string, slot: number, total = INLINE_IMAGE_MIN): string {
  if (filledInlineSlots(html).includes(slot)) return html;
  const headings = [...html.matchAll(/<h2[\s>]/gi)].map((match) => match.index ?? 0);
  let from: number;
  if (headings.length > 0) {
    from = headings[headingIndexForSlot(slot, headings.length, total)];
  } else {
    const paragraphs = [...html.matchAll(/<\/p>/gi)].map((match) => match.index ?? 0);
    if (paragraphs.length === 0) return `${html}\n${figureHtml}`;
    const index = Math.min(paragraphs.length - 1, Math.floor(((slot + 1) * paragraphs.length) / (total + 1)));
    const at = paragraphs[index] + "</p>".length;
    return `${html.slice(0, at)}\n${figureHtml}${html.slice(at)}`;
  }
  const close = html.toLowerCase().indexOf("</p>", from);
  const nextHeading = headings.find((index) => index > from) ?? html.length;
  const at = close >= 0 && close < nextHeading ? close + "</p>".length : nextHeading;
  return `${html.slice(0, at)}\n${figureHtml}${html.slice(at)}`;
}

export function inlineFigureHtml(src: string, alt: string, slot: number, contentImageId: string): string {
  const safeAlt = alt.replace(/[<>"&]/g, " ").replace(/\s+/g, " ").trim();
  return `<figure data-auctorio-slot="${slot}" data-auctorio-image="${contentImageId}"><img src="${src}" alt="${safeAlt}" loading="lazy" /></figure>`;
}
