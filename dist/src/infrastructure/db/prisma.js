"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.siteRequestContextHook = siteRequestContextHook;
exports.getPrismaClient = getPrismaClient;
const node_async_hooks_1 = require("node:async_hooks");
const client_1 = require("@prisma/client");
/** Site the current HTTP request is acting on (validated upstream by the Studio BFF). */
const siteContext = new node_async_hooks_1.AsyncLocalStorage();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fastify onRequest hook: scopes every site-owned read in this request to `x-studio-site-id`. */
function siteRequestContextHook(request, _reply, done) {
    const raw = request.headers["x-studio-site-id"];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.toString().trim() ?? "";
    siteContext.run({ siteId: UUID.test(value) ? value : null }, done);
}
// Models whose null siteId means "workspace-wide default": still visible from every site.
const SITE_OR_DEFAULT = new Set([
    "StudioPromptPreset", "StudioPromptAssignment", "AutomationPolicy", "EditorialPlanPreset",
    "DiscoveryConfig", "CostBudget",
    // Wizard drafts (and their discovery/verification operations) get a site only on activation; until then
    // they must stay reachable from the active site.
    "ConnectorInstallation", "Operation",
]);
const SITE_SCOPED = new Set(client_1.Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "siteId" && field.kind === "scalar"))
    .map((model) => model.name));
function createClient() {
    const scope = (model, args) => {
        const siteId = siteContext.getStore()?.siteId;
        if (!siteId || !SITE_SCOPED.has(model))
            return args;
        const filter = SITE_OR_DEFAULT.has(model) ? { OR: [{ siteId }, { siteId: null }] } : { siteId };
        return { ...args, where: { AND: [args.where ?? {}, filter] } };
    };
    return new client_1.PrismaClient().$extends({
        query: {
            $allModels: {
                findMany: ({ model, args, query }) => query(scope(model, args)),
                findFirst: ({ model, args, query }) => query(scope(model, args)),
                findFirstOrThrow: ({ model, args, query }) => query(scope(model, args)),
                count: ({ model, args, query }) => query(scope(model, args)),
                aggregate: ({ model, args, query }) => query(scope(model, args)),
                groupBy: ({ model, args, query }) => query(scope(model, args)),
                updateMany: ({ model, args, query }) => query(scope(model, args)),
                deleteMany: ({ model, args, query }) => query(scope(model, args)),
            },
        },
    });
}
let prisma = null;
function getPrismaClient() {
    if (!prisma) {
        prisma = createClient();
    }
    return prisma;
}
