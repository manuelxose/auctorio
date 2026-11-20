import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";

/** Site the current HTTP request is acting on (validated upstream by the Studio BFF). */
const siteContext = new AsyncLocalStorage<{ siteId: string | null }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fastify onRequest hook: scopes every site-owned read in this request to `x-studio-site-id`. */
export function siteRequestContextHook(request: { headers: Record<string, unknown> }, _reply: unknown, done: () => void): void {
  const raw = request.headers["x-studio-site-id"];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toString().trim() ?? "";
  siteContext.run({ siteId: UUID.test(value) ? value : null }, done);
}

export function readAcrossWorkspaceSites<T>(read: () => Promise<T>): Promise<T> {
  return siteContext.run({ siteId: null }, read);
}

// Models whose null siteId means "workspace-wide default": still visible from every site.
const SITE_OR_DEFAULT = new Set([
  "StudioPromptPreset", "StudioPromptAssignment", "AutomationPolicy", "EditorialPlanPreset",
  "DiscoveryConfig", "CostBudget",
  // Wizard drafts (and their discovery/verification operations) get a site only on activation; until then
  // they must stay reachable from the active site.
  "ConnectorInstallation", "Operation",
]);
const SITE_SCOPED = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "siteId" && field.kind === "scalar"))
    .map((model) => model.name),
);

function createClient(): PrismaClient {
  const scope = (model: string, args: { where?: unknown }) => {
    const siteId = siteContext.getStore()?.siteId;
    if (!siteId || !SITE_SCOPED.has(model)) return args;
    const filter = SITE_OR_DEFAULT.has(model) ? { OR: [{ siteId }, { siteId: null }] } : { siteId };
    return { ...args, where: { AND: [args.where ?? {}, filter] } };
  };
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        findMany: ({ model, args, query }) => query(scope(model, args) as typeof args),
        findFirst: ({ model, args, query }) => query(scope(model, args) as typeof args),
        findFirstOrThrow: ({ model, args, query }) => query(scope(model, args) as typeof args),
        count: ({ model, args, query }) => query(scope(model, args) as typeof args),
        aggregate: ({ model, args, query }) => query(scope(model, args) as typeof args),
        groupBy: ({ model, args, query }) => query(scope(model, args) as any),
        updateMany: ({ model, args, query }) => query(scope(model, args) as typeof args),
        deleteMany: ({ model, args, query }) => query(scope(model, args) as typeof args),
      },
    },
  }) as unknown as PrismaClient;
}

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = createClient();
  }
  return prisma;
}
