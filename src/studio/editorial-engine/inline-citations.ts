// Inline attribution links (BLG parity): writers name their sources in the text («Según television.digital.gob.es…»)
// but often leave them unlinked, so every external link ended up only in «Fuentes». This links the first unlinked
// mention of each source's publisher or domain in the body to that source's URL, once per URL.

import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

type Source = { publisher: string | null; sourceUrl: string | null };

const TAIL_SECTIONS = /^(fuentes|sources|lecturas recomendadas|recommended read|recomendaciones|preguntas frecuentes|frequently asked)/i;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function needlesOf(source: Source): string[] {
  let domain = "";
  try {
    domain = new URL(source.sourceUrl ?? "").hostname.replace(/^www\./, "");
  } catch {
    domain = "";
  }
  return [...new Set([source.publisher?.trim() ?? "", domain].filter((value) => value.length >= 4))].sort((a, b) => b.length - a.length);
}

/** Body blocks that may carry an inline citation: paragraphs, list items and cells outside cards, the TOC and the tail lists. */
function bodyBlocks($: CheerioAPI): AnyNode[] {
  const blocks: AnyNode[] = [];
  let inTail = false;
  $.root()
    .children()
    .each((_, el) => {
      const node = $(el);
      if (node.is("h2")) inTail = TAIL_SECTIONS.test(node.text().trim());
      if (inTail || node.is("aside, nav, h2, h3")) return;
      node.find("p, li, td").addBack("p, li, td").each((__, block) => void blocks.push(block));
    });
  return blocks;
}

export function linkInlineAttributions(html: string, sources: Source[]): string {
  const $ = load(html, null, false);
  const blocks = bodyBlocks($);
  // Only body links count: every source is also listed in «Fuentes», which must not block its inline link.
  const linked = new Set(blocks.flatMap((block) => $(block).find("a[href]").map((_, a) => $(a).attr("href")).get()));
  for (const source of sources) {
    const url = source.sourceUrl;
    if (!url || !/^https?:\/\//i.test(url) || linked.has(url)) continue;
    const pattern = needlesOf(source).map(escapeRegex).join("|");
    if (!pattern) continue;
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}.])(${pattern})(?![\\p{L}\\p{N}]|\\.[\\p{L}])`, "iu");
    search: for (const block of blocks) {
      for (const textNode of $(block).contents().toArray()) {
        if (textNode.type !== "text") continue;
        const text = (textNode as unknown as { data: string }).data;
        const match = regex.exec(text);
        if (!match) continue;
        const start = match.index + match[1].length;
        const end = start + match[2].length;
        $(textNode).replaceWith(`${escapeHtml(text.slice(0, start))}<a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(match[2])}</a>${escapeHtml(text.slice(end))}`);
        linked.add(url);
        break search;
      }
    }
  }
  return $.html();
}
