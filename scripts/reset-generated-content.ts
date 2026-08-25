/**
 * Reset generated content to zero and start fresh ingestion.
 *
 *   npx ts-node scripts/reset-generated-content.ts
 *
 * Deletes ALL generated content (plans, projects, publications, social, story
 * clusters, source items, site intelligence, discovery data, notifications)
 * while keeping accounts, sites, tenants, publishing connections and audit
 * history. Then seeds the movie-database sources (Filmaffinity, SensaCine,
 * IMDb) and kicks off ingestion + a full re-index of the site.
 *
 * SAFETY: before truncating, verifies that no table outside the allowed set
 * references a truncated table (avoids TRUNCATE ... CASCADE pulling in
 * configuration tables). Take a pg_dump first.
 */
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { createSource, fetchSourceNow } from "../src/studio/sources";
import { refreshSiteIntelligence } from "../src/studio/site-intelligence/index";
import { writeAudit } from "../src/studio/audit";

const prisma = getPrismaClient();

/** Tables holding generated content, intelligence, discovery and source data (DB names). */
const TRUNCATE_TABLES = [
  "ai_audit",
  "asset_variants",
  "campaigns",
  "content_derivatives",
  "content_image",
  "content_projects",
  "content_text",
  "content_versions",
  "editorial_briefs",
  "editorial_plans",
  "editorial_plan_generation_attempts",
  "editorial_plan_items",
  "facts",
  "jobs",
  "publications",
  "publication_attempts",
  "publication_jobs",
  "search_targets",
  "site_entities",
  "site_indexed_pages",
  "site_intelligence_profiles",
  "site_internal_links",
  "site_sitemaps",
  "site_topic_clusters",
  "social_content",
  "source_items",
  "story_clusters",
  "topics",
  "content_sources",
  "discovered_domains",
  "web_discovery_queries",
  "web_retrievals",
  "web_usage_records",
  "source_quality_profiles",
  "source_recommendations",
  "notifications",
];

const MOVIE_SOURCES = [
  {
    name: "Filmaffinity — Estrenos de cine",
    type: "htmllist" as const,
    url: "https://www.filmaffinity.com/es/rdcat.php?id=new_th_es",
    trustScore: 0.85,
    priority: 3,
    refreshIntervalMinutes: 720,
    categories: ["cine", "estrenos", "películas"],
    configuration: { engine: "browser" },
  },
  {
    name: "SensaCine — Estrenos",
    type: "htmllist" as const,
    url: "https://www.sensacine.com/peliculas/estrenos/",
    trustScore: 0.85,
    priority: 3,
    refreshIntervalMinutes: 720,
    categories: ["cine", "estrenos", "películas"],
    configuration: null,
  },
  {
    name: "IMDb — Base de datos oficial",
    type: "imdb" as const,
    url: "https://datasets.imdbws.com/title.basics.tsv.gz",
    trustScore: 0.9,
    priority: 2,
    refreshIntervalMinutes: 10080,
    categories: ["cine", "series", "imdb"],
    configuration: { types: ["movie", "tvSeries", "tvMiniSeries"], fromYear: 2025, maxItems: 300 },
  },
];

async function verifyTruncateSafety(): Promise<void> {
  const referenced = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `
    SELECT tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = ANY($1::text[])
      AND tc.table_name <> ALL($1::text[])
  `,
    TRUNCATE_TABLES,
  );

  const keptReferences = referenced.map((row: { table_name: string }) => row.table_name);
  if (keptReferences.length > 0) {
    throw new Error(`TRUNCATE safety check failed: kept tables reference truncated tables: ${keptReferences.join(", ")}`);
  }
}

async function main(): Promise<void> {
  const site = await prisma.site.findFirst({
    where: { key: "guiatv-editorial" },
    select: { id: true, tenantId: true, key: true, name: true },
  });
  if (!site) {
    throw new Error("target site not found (key: guiatv-editorial)");
  }
  console.log(`Target site: ${site.name} (${site.key}) tenant=${site.tenantId}`);

  await verifyTruncateSafety();

  const counts = await prisma.$queryRawUnsafe<Array<{ relname: string; n_live_tup: number }>>(
    `SELECT relname, n_live_tup::bigint AS n_live_tup FROM pg_stat_user_tables WHERE relname = ANY($1::text[])`,
    TRUNCATE_TABLES,
  );
  const total = counts.reduce((sum, row) => sum + Number(row.n_live_tup), 0);
  console.log(`Wiping ~${total} rows across ${TRUNCATE_TABLES.length} tables...`);

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TRUNCATE_TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`,
  );

  const tenantId = site.tenantId;
  const siteId = site.id;

  console.log("Seeding movie-database sources...");
  for (const input of MOVIE_SOURCES) {
    const source = await createSource(tenantId, {
      siteId,
      name: input.name,
      type: input.type,
      url: input.url,
      trustScore: input.trustScore,
      priority: input.priority,
      refreshIntervalMinutes: input.refreshIntervalMinutes,
      categories: input.categories,
      configuration: input.configuration,
    });
    console.log(`  created source ${source.id} (${input.type}) ${input.name}`);
  }

  console.log("Triggering immediate ingestion...");
  const sources = await prisma.contentSource.findMany({ where: { tenantId, siteId } });
  for (const source of sources) {
    console.log(`  fetching ${source.name}...`);
    const result = await fetchSourceNow(tenantId, source.id);
    console.log(`    -> fetched=${result.fetched} created=${result.created} duplicates=${result.duplicates} failed=${result.failed}${result.error ? ` error=${result.error}` : ""}`);
  }

  console.log("Starting full re-index of the site (from scratch)...");
  await refreshSiteIntelligence(tenantId, siteId, { crawl: true, force: true });

  await writeAudit({
    tenantId,
    action: "content.reset",
    entityType: "tenant",
    entityId: tenantId,
    actorType: "user",
    metadata: { deletedRows: total, seededSources: MOVIE_SOURCES.map((entry) => entry.name) },
  });

  console.log("Done. Content starts from zero; ingestion and re-index are running.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("reset failed:", error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exit(1);
  });
