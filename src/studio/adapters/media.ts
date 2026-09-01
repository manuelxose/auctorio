// Media extraction helpers shared by feed adapters.
// Order: media:content → media:thumbnail → enclosure (editorial images first).

import { normalizeCanonicalUrl } from "./normalize";

export function extractMedia(record: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") {
      const normalized = normalizeCanonicalUrl(value);
      if (normalized) {
        urls.add(normalized);
      }
    }
  };

  const media = record["media:content"];
  if (media && typeof media === "object") {
    if (Array.isArray(media)) {
      for (const entry of media) {
        add(typeof entry === "object" ? (entry as Record<string, unknown>)["@_url"] : entry);
      }
    } else {
      add((media as Record<string, unknown>)["@_url"]);
    }
  }
  const thumbnail = record["media:thumbnail"];
  if (thumbnail && typeof thumbnail === "object") {
    add((thumbnail as Record<string, unknown>)["@_url"]);
  }
  const enclosure = record.enclosure;
  if (enclosure && typeof enclosure === "object") {
    add((enclosure as Record<string, unknown>)["@_url"]);
  }

  return Array.from(urls);
}
