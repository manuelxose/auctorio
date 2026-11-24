import { parseTweet } from "twitter-text";

export const X_POST_LIMIT = 280;

export function xWeightedLength(text: string): number {
  return parseTweet(text).weightedLength;
}

export function xArticleText(body: string, articleUrl: string | null): string {
  const text = body.replaceAll("[URL]", "").trim();
  if (!articleUrl) return text;
  const withoutLink = text.split(/(\s+)/).filter((token) => token !== articleUrl).join("").trim();
  return `${withoutLink}\n${articleUrl}`.trim();
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function formatXThread(body: string): Array<{ body: string }> {
  // Reserve enough space for numbering up to 99 posts before splitting.
  const limit = X_POST_LIMIT - "99/99 ".length;
  const parts: string[] = [];
  for (const paragraph of body.trim().split(/\r?\n\s*\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (xWeightedLength(next) <= limit) {
        current = next;
        continue;
      }
      if (current) parts.push(current);
      current = "";
      const units = xWeightedLength(word) <= limit ? [word] : Array.from(graphemes.segment(word), ({ segment }) => segment);
      for (const unit of units) {
        if (xWeightedLength(unit) > limit) throw new Error("x_thread_unsplittable_text");
        if (current && xWeightedLength(current + unit) > limit) {
          parts.push(current);
          current = "";
        }
        current += unit;
      }
    }
    if (current) parts.push(current);
  }
  if (parts.length > 99) throw new Error("x_thread_exceeds_99_posts");
  return parts.map((part, index) => ({ body: parts.length > 1 ? `${index + 1}/${parts.length} ${part}` : part }));
}
