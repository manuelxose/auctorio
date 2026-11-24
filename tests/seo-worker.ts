// One worker process of the cross-process single-flight test in seo-manager.test.ts (not a test file itself).
import { acquireSeo, seoRoute, type SeoRoute } from "../src/studio/seo-manager";
import { getPrismaClient } from "../src/infrastructure/db/prisma";

async function main() {
  const [tenantId, siteId, port, keywords] = process.argv.slice(2);
  const fetchImpl = (async (_url: string, init: RequestInit) => globalThis.fetch(`http://127.0.0.1:${port}/`, { method: "POST", body: init.body })) as typeof fetch;
  const route = (await seoRoute("keyword_metrics", "es-ES")) as SeoRoute;
  const { data, meta } = await acquireSeo(route, "keyword_metrics", { keywords: keywords.split(",") }, { tenantId, siteId, kind: "keyword_metrics", fetchImpl });
  process.stdout.write(JSON.stringify({ rows: data.length, unresolved: meta.unresolved, bought: meta.cache.bought }));
}

if (require.main === module) {
  main()
    .catch((error) => {
      process.stderr.write(String(error));
      process.exitCode = 1;
    })
    .finally(() => getPrismaClient().$disconnect());
}
