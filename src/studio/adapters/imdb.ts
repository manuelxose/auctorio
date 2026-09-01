// IMDb public dataset adapter (`imdb`): streams the official TSV dump
// (datasets.imdbws.com), no scraping involved.

import { getEnv } from "../../shared/utils/env";
import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceRef } from "./types";
import { emptyDiscoveredItem, readConfigObject } from "./normalize";
import { validateScrapeUrl } from "../../infrastructure/scraping";

export type ImdbDatasetOptions = {
  /** titleType values to keep (default: movie, tvMovie, tvSeries, tvMiniSeries). */
  types?: string[];
  /** Only titles with startYear >= this year (default: current year - 1). */
  fromYear?: number;
  maxItems?: number;
};

/** Parse IMDb title.basics TSV lines. Pure — deterministic tests. */
export function parseImdbTsvLines(lines: string[], options: ImdbDatasetOptions = {}): DiscoveredSourceItem[] {
  const fromYear = options.fromYear ?? new Date().getFullYear() - 1;
  const types = new Set(options.types ?? ["movie", "tvMovie", "tvSeries", "tvMiniSeries"]);
  const maxItems = Math.max(1, Math.min(options.maxItems ?? 250, 1000));

  const header = lines[0]?.trim().split("\t") ?? [];
  const indexOf = (name: string) => header.indexOf(name);

  const col = {
    id: indexOf("tconst"),
    type: indexOf("titleType"),
    primary: indexOf("primaryTitle"),
    original: indexOf("originalTitle"),
    adult: indexOf("isAdult"),
    startYear: indexOf("startYear"),
    runtime: indexOf("runtimeMinutes"),
    genres: indexOf("genres"),
  };
  if (col.id < 0 || col.primary < 0) {
    return [];
  }

  const matches: DiscoveredSourceItem[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      continue;
    }
    const fields = line.split("\t");
    const titleType = col.type >= 0 ? fields[col.type] : "";
    if (!types.has(titleType)) {
      continue;
    }
    if (col.adult >= 0 && fields[col.adult] === "1") {
      continue;
    }
    const startYear = col.startYear >= 0 ? Number.parseInt(fields[col.startYear] ?? "0", 10) : 0;
    if (Number.isFinite(startYear) && startYear > 0 && startYear < fromYear) {
      continue;
    }
    const tconst = fields[col.id];
    const title = (col.primary >= 0 ? fields[col.primary] : "") || (col.original >= 0 ? fields[col.original] : "");
    if (!title) {
      continue;
    }
    const originalTitle = col.original >= 0 && fields[col.original] && fields[col.original] !== fields[col.primary] ? fields[col.original] : null;
    const runtime = col.runtime >= 0 && fields[col.runtime] && fields[col.runtime] !== "\\N" ? fields[col.runtime] : null;
    const genres = col.genres >= 0 && fields[col.genres] && fields[col.genres] !== "\\N" ? fields[col.genres].split(",") : [];

    const descriptionParts = [
      `Año: ${startYear > 0 ? startYear : "—"}`,
      runtime ? `Duración: ${runtime} min` : null,
      genres.length > 0 ? `Géneros: ${genres.join(", ")}` : null,
      originalTitle ? `Título original: ${originalTitle}` : null,
    ].filter((part): part is string => Boolean(part));

    matches.push(
      emptyDiscoveredItem({
        externalId: tconst,
        canonicalUrl: `https://www.imdb.com/title/${tconst}/`,
        sourceUrl: `https://www.imdb.com/title/${tconst}/`,
        title: title.slice(0, 400),
        description: descriptionParts.join(" · ") || null,
        rawText: descriptionParts.join("\n") || null,
        cleanedText: descriptionParts.join("\n") || null,
        author: null,
        authors: [],
        publishedAt: startYear > 0 ? `${startYear}-01-01T00:00:00.000Z` : null,
        sourceImageUrls: [],
        language: null,
        categories: genres,
        rawMetadata: { tconst, titleType, startYear: startYear > 0 ? startYear : null, runtime: runtime ?? null, originalTitle },
        confidence: 1,
      }),
    );

    if (matches.length >= maxItems) {
      break;
    }
  }
  return matches;
}

async function readTailLines(filePath: string, budgetChars: number): Promise<string[]> {
  const { open } = await import("node:fs/promises");
  const { statSync } = await import("node:fs");

  const handle = await open(filePath, "r");
  try {
    const size = statSync(filePath).size;
    const readFrom = Math.max(0, size - budgetChars);
    const buffer = Buffer.alloc(size - readFrom);
    await handle.read(buffer, 0, buffer.length, readFrom);
    const text = buffer.toString("utf8");
    const lines = text.split("\n").filter((line) => line.trim());
    if (readFrom > 0 && lines.length > 0 && !lines[0].startsWith("tconst")) {
      lines.shift();
    }
    return ["tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres", ...lines];
  } finally {
    await handle.close();
  }
}

export class ImdbDatasetAdapter implements SourceAdapter {
  readonly type = "imdb" as const;

  async discover(source: SourceRef, context: DiscoveryContext): Promise<DiscoveredSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const url = new URL(source.url);
    await validateScrapeUrl(url);
    const configuration = readConfigObject(source.configuration);
    const options: ImdbDatasetOptions = {
      types: Array.isArray(configuration.types) ? configuration.types.map(String) : undefined,
      fromYear: typeof configuration.fromYear === "number" ? configuration.fromYear : undefined,
      maxItems: typeof configuration.maxItems === "number" ? configuration.maxItems : context.limits.maxItems,
    };

    // Stream + gunzip to a temp file instead of buffering the full archive in
    // memory (the decompressed TSV is >1 GB).
    const { Readable } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    const { createGunzip } = await import("node:zlib");
    const { createWriteStream, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const response = await fetch(url.toString(), {
      headers: { "user-agent": getEnv("SCRAPE_USER_AGENT", "auctorio-bot"), accept: "application/gzip" },
    });
    if (!response.ok || !response.body) {
      throw new Error(`imdb_dataset_fetch_failed status=${response.status}`);
    }

    const dir = mkdtempSync(join(tmpdir(), "imdb-basics-"));
    const filePath = join(dir, "title.basics.tsv");
    try {
      await pipeline(Readable.fromWeb(response.body as never), createGunzip(), createWriteStream(filePath));
      // The dataset is ordered by insertion (tconst); newer titles live at the
      // END of the file. Read the tail so recent releases are ingested first.
      const tail = await readTailLines(filePath, 2_000_000);
      return parseImdbTsvLines(tail, options);
    } finally {
      await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined));
    }
  }
}
