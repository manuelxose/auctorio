import { load, type Cheerio } from "cheerio";

/**
 * Allowlist sanitizer for editorial HTML. Preserves semantic structure
 * (headings, bold, lists, links, tables, images) and strips scripts,
 * event handlers, unsafe urls and unknown tags.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "h2",
  "h3",
  "h4",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "hr",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "br",
  "figure",
  "figcaption",
]);

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "title", "rel", "target"],
  img: ["src", "alt", "width", "height", "loading"],
  table: [],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ["scope"],
  td: [],
};

/**
 * Scheme check for href/src values. Normalizes embedded control characters
 * (tabs, CR/LF, NUL) that browsers strip but naive regexes miss — e.g.
 * `java&#x09;script:` — and only allows http(s), mailto, tel or relative URLs.
 */
function isSafeUrl(value: string): boolean {
  // Strip ASCII control characters and whitespace that browsers ignore when
  // parsing URL schemes (URL spec removes tabs/CR/LF from the string).
  const normalized = value.replace(/[\u0000-\u0020\u007f]/g, "");
  if (!normalized) {
    return false;
  }
  const schemeMatch = normalized.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    return scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel";
  }
  // Relative URLs (path, protocol-relative, anchors, query strings).
  return !normalized.startsWith("//") || /^\/\/[a-z0-9.-]+\//i.test(normalized);
}

export function sanitizeEditorialHtml(html: string | null | undefined): string {
  if (!html) {
    return "";
  }
  const $ = load(html);
  $("script, style, iframe, object, embed, form, input, button, select, textarea, noscript, link, meta").remove();

  const walk = (parent: Cheerio<any>) => {
    parent.children().each((_index, el) => {
      const node = $(el);
      const tagName = (el.tagName || el.name || "").toLowerCase();

      if (tagName === "html" || tagName === "body" || tagName === "#root" || tagName === "root") {
        walk(node);
        return;
      }

      if (!ALLOWED_TAGS.has(tagName)) {
        node.replaceWith(node.contents());
        return;
      }

      const allowedAttrs = ALLOWED_ATTRIBUTES[tagName] ?? [];
      for (const attribute of Object.keys(el.attribs ?? {})) {
        const name = attribute.toLowerCase();
        if (!allowedAttrs.includes(name) && !name.startsWith("data-")) {
          node.removeAttr(attribute);
        }
      }

      if (tagName === "a") {
        const href = node.attr("href");
        if (!href || !isSafeUrl(href)) {
          node.removeAttr("href");
        } else {
          node.attr("rel", "noopener noreferrer");
        }
      }
      if (tagName === "img") {
        const src = node.attr("src");
        if (src && !isSafeUrl(src)) {
          node.removeAttr("src");
        }
        if (!node.attr("alt")) {
          node.attr("alt", "");
        }
      }

      walk(node);
    });
  };

  const body = $("body");
  walk(body);
  return body.html() ?? "";
}
