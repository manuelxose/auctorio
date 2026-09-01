// Unique site value (Phase 4): configurable per site/domain value-add blocks.
//
// Blocks are only populated from validated data (provider enrichments, the
// fact ledger, the site's indexed inventory). The engine never hallucinates
// availability, schedules or providers — a block without data is dropped.

import type { EngineEnrichment, EngineInternalLink, SiteValueBlock } from "./types";

export type SiteValueBlockDefinition = {
  key: string;
  title: string;
  /** Which validated source feeds the block. */
  dataSource: "enrichment" | "internalLinks" | "facts";
  /** Optional entity types the block only applies to. */
  entityTypes?: string[];
  /** Fact keys feeding a "facts" block. */
  factKeys?: string[];
  /** Spanish/English display labels keyed by locale prefix. */
  titles?: Record<string, string>;
};

/** Built-in preset for movie/tv sites. */
export const MOVIE_TV_VALUE_PRESET: SiteValueBlockDefinition[] = [
  {
    key: "where_to_watch",
    title: "Where to watch",
    titles: { es: "Dónde verla", en: "Where to watch" },
    dataSource: "enrichment",
    entityTypes: ["movie", "tv_series", "creative_work"],
  },
  {
    key: "spanish_release",
    title: "Release in Spain",
    titles: { es: "Estreno en España", en: "Release in Spain" },
    dataSource: "enrichment",
    entityTypes: ["movie", "tv_series", "creative_work"],
  },
  {
    key: "streaming_provider",
    title: "Streaming provider",
    titles: { es: "Disponible en", en: "Streaming on" },
    dataSource: "enrichment",
    entityTypes: ["movie", "tv_series", "creative_work"],
  },
  {
    key: "cast",
    title: "Cast",
    titles: { es: "Reparto", en: "Cast" },
    dataSource: "enrichment",
    entityTypes: ["movie", "tv_series", "creative_work"],
  },
  {
    key: "director_filmography",
    title: "From the director of",
    titles: { es: "Del director de", en: "From the director of" },
    dataSource: "enrichment",
    entityTypes: ["movie", "tv_series"],
  },
  {
    key: "tv_channel",
    title: "TV channel",
    titles: { es: "Canal de TV", en: "TV channel" },
    dataSource: "facts",
    factKeys: ["tv_channel", "channel", "broadcast_channel"],
    entityTypes: ["tv_series", "episode", "creative_work"],
  },
  {
    key: "future_airing",
    title: "Future airing",
    titles: { es: "Próximas emisiones", en: "Future airing" },
    dataSource: "facts",
    factKeys: ["future_airing", "airing_date", "premiere_date", "season_premiere"],
    entityTypes: ["tv_series", "episode", "creative_work"],
  },
  {
    key: "related_content",
    title: "Related content",
    titles: { es: "Contenido relacionado", en: "Related content" },
    dataSource: "internalLinks",
  },
];

export type SiteValueConfig = {
  domain?: string;
  enabled?: boolean;
  blocks?: Array<{ key: string; enabled?: boolean; title?: string }>;
};

export type SiteValueInput = {
  /** Site-level config JSON (Site.siteValueConfig), if any. */
  config: SiteValueConfig | null;
  /** Domain presets to apply (e.g. "movie_tv"). */
  domains: string[];
  locale: string | null;
  entities: Array<{ type: string; name: string }>;
  enrichments: EngineEnrichment[];
  internalLinks: EngineInternalLink[];
  /** Licensed fact statements (already safety-filtered) usable in blocks. */
  factStatements: Array<{ factKey: string; statement: string }>;
};

function resolveDefinitions(config: SiteValueConfig | null, domains: string[]): Array<{ definition: SiteValueBlockDefinition; enabled: boolean; customTitle?: string }> {
  const result: Array<{ definition: SiteValueBlockDefinition; enabled: boolean; customTitle?: string }> = [];
  if (!config || config.enabled !== false) {
    for (const domain of domains) {
      if (domain === "movie_tv") {
        for (const definition of MOVIE_TV_VALUE_PRESET) {
          result.push({ definition, enabled: true });
        }
      }
    }
  }
  // Site-level overrides by key.
  for (const block of config?.blocks ?? []) {
    const existing = result.find((entry) => entry.definition.key === block.key);
    if (existing) {
      if (block.enabled === false) {
        existing.enabled = false;
      }
      if (block.title) {
        existing.customTitle = block.title;
      }
    } else if (block.enabled !== false) {
      result.push({
        definition: {
          key: block.key,
          title: block.title ?? block.key,
          dataSource: "enrichment",
        },
        enabled: true,
      });
    }
  }
  return result.filter((entry) => entry.enabled);
}

function localizedTitle(definition: SiteValueBlockDefinition, customTitle: string | undefined, locale: string | null): string {
  if (customTitle) {
    return customTitle;
  }
  if (locale && definition.titles) {
    const prefix = locale.slice(0, 2).toLowerCase();
    const localized = definition.titles[prefix] ?? definition.titles[locale.toLowerCase()];
    if (localized) {
      return localized;
    }
  }
  return definition.title;
}

type EnrichmentValue = {
  title: string | null;
  originalTitle: string | null;
  releaseDate: string | null;
  data: Record<string, unknown>;
};

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String).filter(Boolean).slice(0, 8);
}

/** Build concrete value blocks from validated data only. */
export function resolveSiteValueBlocks(input: SiteValueInput): SiteValueBlock[] {
  const entries = resolveDefinitions(input.config, input.domains);
  const blocks: SiteValueBlock[] = [];
  const locale = input.locale;

  for (const entry of entries) {
    const { definition } = entry;
    const applicableEntities = definition.entityTypes
      ? input.entities.filter((entity) => definition.entityTypes?.includes(entity.type))
      : [];
    if (definition.entityTypes && applicableEntities.length === 0) {
      continue; // not applicable to this story — no data to show.
    }

    const lines: string[] = [];
    let source = definition.dataSource;

    if (definition.dataSource === "internalLinks") {
      for (const link of input.internalLinks.slice(0, 3)) {
        lines.push(`${link.title} — ${link.url}`);
      }
    } else if (definition.dataSource === "facts") {
      const keys = definition.factKeys ?? [];
      for (const fact of input.factStatements) {
        if (keys.includes(fact.factKey)) {
          lines.push(fact.statement);
        }
      }
    } else {
      for (const enrichment of input.enrichments) {
        if (definition.key === "where_to_watch" || definition.key === "streaming_provider") {
          const providers = readStringList(enrichment.data?.watchProviders ?? enrichment.data?.watch_providers);
          if (providers.length > 0) {
            lines.push(...providers.map((provider) => `${enrichment.title ?? ""} — ${provider}`.replace(/^ — /, "")));
          }
        }
        if (definition.key === "spanish_release") {
          // Only explicit Spain-region data may be presented as a Spanish
          // release — never derived from the general release date.
          const spain = enrichment.data?.spainReleaseDate ?? enrichment.data?.spain_release_date ?? enrichment.data?.releaseSpain;
          if (typeof spain === "string" && spain) {
            lines.push(`${enrichment.title ?? "Title"} — ${spain.slice(0, 10)}`);
          }
        }
        if (definition.key === "cast") {
          const cast = readStringList(enrichment.data?.cast);
          if (cast.length > 0) {
            lines.push(...cast);
          }
        }
        if (definition.key === "director_filmography") {
          const directors = readStringList(enrichment.data?.directors ?? enrichment.data?.crew);
          if (directors.length > 0) {
            lines.push(...directors.map((director) => `${director} (${enrichment.title ?? ""})`));
          }
        }
      }
    }

    if (lines.length === 0) {
      continue; // never emit empty value blocks — nothing validated to show.
    }

    blocks.push({
      key: definition.key,
      title: localizedTitle(definition, entry.customTitle, locale),
      lines: lines.slice(0, 6),
      source,
    });
  }

  // Drop duplicates with identical content (e.g. where_to_watch and
  // streaming_provider fed by the same validated provider list).
  const seen = new Set<string>();
  return blocks.filter((block) => {
    const fingerprint = `${block.source}:${block.lines.join("|")}`;
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

/** Site value proposition text for the brief (always truthful). */
export function describeSiteValueProposition(blocks: SiteValueBlock[]): string {
  if (blocks.length === 0) {
    return "A concise, original synthesis of the verified facts.";
  }
  return blocks.map((block) => `${block.title}: ${block.lines.join("; ")}`).join(" | ");
}
