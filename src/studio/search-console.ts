// Search Console of a site: authorization, property choice and incremental synchronization.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  SEARCH_CONSOLE_PAGE_ROWS,
  SearchConsoleError,
  exchangeSearchConsoleCode,
  inspectSearchConsoleUrl,
  listSearchConsoleProperties,
  querySearchConsole,
  refreshSearchConsoleToken,
  revokeSearchConsoleToken,
  searchConsoleAuthorizeUrl,
  searchConsoleConfigured,
  type SearchConsoleProperty,
  type SearchDimension,
  type SearchRow,
} from "../infrastructure/google/search-console";
import { encryptSecret, generateOAuthState, generatePkceVerifier, sha256Hex, tryDecryptSecret } from "../shared/utils/crypto";
import { getEnv } from "../shared/utils/env";
import { structuredEvent } from "../shared/utils/logger";
import { writeAudit } from "./audit";
import { readSeoControl } from "./seo-control";

const prisma = getPrismaClient();
const PLATFORM = "search_console";
const SESSION_TTL_MS = 15 * 60_000;
export const DAY_MS = 86_400_000;
/** Search Console keeps 16 months. */
const HISTORY_DAYS = 486;
const RETENTION_DAYS = 500;
const DAYS_PER_RUN = 10;
// shortcut: the day's 5000 query rows with most clicks; raise it if a large site needs its tail.
const QUERY_ROWS_PER_DAY = 5_000;
const LEASE_MS = 10 * 60_000;
const SYNC_EVERY_MS = 12 * 3_600_000;
const INSPECTIONS_PER_RUN = 10;
/** Google allows 2000 a day per property; far below it on purpose. */
const INSPECTIONS_PER_DAY = 50;

export const day = (date: Date): string => date.toISOString().slice(0, 10);
export const fromDay = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);
/** Search Console days are Pacific time. */
const pacificToday = (now: Date): Date => fromDay(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now));

const host = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** A site may only read the property of its own domain. */
export function propertyMatchesSite(property: string, baseUrl: string | null): boolean {
  const site = baseUrl ? host(baseUrl) : null;
  if (!site) return false;
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice("sc-domain:".length).toLowerCase();
    return site === domain || site.endsWith(`.${domain}`);
  }
  return host(property) === site;
}

/** Days still missing: the newest first run, then forward, then backwards into history. Pure. */
export function planSyncDays(available: string[], synced: { from: string | null; through: string | null }, limit: number): { days: string[]; backfillComplete: boolean } {
  const dates = [...new Set(available)].sort();
  const forward = synced.through ? dates.filter((date) => date > synced.through!) : [];
  const older = (synced.from ? dates.filter((date) => date < synced.from!) : dates).reverse();
  return { days: [...forward, ...older].slice(0, limit), backfillComplete: older.length <= Math.max(0, limit - forward.length) };
}

async function requireSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true, baseUrl: true } });
  if (!site) throw new Error("site_not_found");
  return site;
}

export function searchConsoleRedirectUri(): string {
  return `${getEnv("PUBLIC_BASE_URL", "http://localhost:3000")}${getEnv("STUDIO_BASE_PATH", "/studio").replace(/\/$/, "")}/seo-opportunities`;
}

export async function getSearchConsoleStatus(tenantId: string, siteId: string, now = new Date()) {
  await requireSite(tenantId, siteId);
  const row = await prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId } });
  const through = row?.syncedThrough ?? null;
  return {
    configured: searchConsoleConfigured(),
    status: row?.status ?? "not_connected",
    property: row?.property ?? null,
    permissionLevel: row?.permissionLevel ?? null,
    syncedFrom: row?.syncedFrom ? day(row.syncedFrom) : null,
    syncedThrough: through ? day(through) : null,
    /** Google publishes final data two to three days late: up to 4 is normal. */
    dataAgeDays: through ? Math.round((pacificToday(now).getTime() - through.getTime()) / DAY_MS) : null,
    backfillComplete: row?.backfillComplete ?? false,
    lastSyncAt: row?.lastSyncAt ?? null,
    lastSuccessAt: row?.lastSuccessAt ?? null,
    lastError: row?.lastError ?? null,
    nextSyncAt: row?.nextSyncAt ?? null,
    syncing: Boolean(row?.leaseUntil && row.leaseUntil > now),
  };
}

export async function startSearchConsoleConnection(tenantId: string, siteId: string, userId: string) {
  const site = await requireSite(tenantId, siteId);
  if (!site.baseUrl) throw new Error("site_base_url_required");
  if (!searchConsoleConfigured()) throw new Error("search_console_not_configured");
  const state = generateOAuthState();
  const pkceVerifier = generatePkceVerifier();
  const redirectUri = searchConsoleRedirectUri();
  const url = searchConsoleAuthorizeUrl({ redirectUri, state, pkceVerifier });
  await prisma.socialConnectionSession.create({
    data: { tenantId, siteId, studioUserId: userId, platform: PLATFORM, provider: "google", stateHash: sha256Hex(state), redirectUri, expiresAt: new Date(Date.now() + SESSION_TTL_MS), metadata: { pkceVerifier } },
  });
  await writeAudit({ tenantId, actorType: "user", actorUserId: userId, action: "search_console.connection_started", entityType: "site", entityId: siteId });
  return { url };
}

/** Called by the signed-in person who started it: a link sent to somebody else cannot be completed. */
export async function completeSearchConsoleConnection(tenantId: string, userId: string, input: { state: string; code: string }, fetchImpl: typeof fetch = fetch) {
  const session = await prisma.socialConnectionSession.findFirst({ where: { tenantId, studioUserId: userId, platform: PLATFORM, stateHash: sha256Hex(input.state) } });
  if (!session?.siteId) throw new Error("search_console_unknown_state");
  const consumed = await prisma.socialConnectionSession.updateMany({ where: { id: session.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw new Error("search_console_state_expired");
  const site = await requireSite(tenantId, session.siteId);
  const pkceVerifier = String((session.metadata as { pkceVerifier?: string } | null)?.pkceVerifier ?? "");
  const tokens = await exchangeSearchConsoleCode({ code: input.code, redirectUri: session.redirectUri ?? "", pkceVerifier }, fetchImpl);
  const properties = (await listSearchConsoleProperties(tokens.accessToken, fetchImpl)).filter((entry) => propertyMatchesSite(entry.property, site.baseUrl));
  const refreshTokenCiphertext = encryptSecret(tokens.refreshToken);
  const data = { refreshTokenCiphertext, connectedByUserId: userId, lastError: null, failureCount: 0, leaseUntil: null };
  // Reconnecting keeps the chosen property and what is already stored, if the new account can still read it.
  const previous = await prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId: site.id } });
  const kept = properties.find((entry) => entry.property === previous?.property) ?? null;
  const state = kept ? { status: "active", permissionLevel: kept.permissionLevel, nextSyncAt: new Date() } : { status: "pending_property", permissionLevel: null, nextSyncAt: null };
  await prisma.searchConsoleConnection.upsert({ where: { siteId: site.id }, create: { tenantId, siteId: site.id, ...data, ...state }, update: { ...data, ...state } });
  await writeAudit({ tenantId, actorType: "user", actorUserId: userId, action: "search_console.connected", entityType: "site", entityId: site.id, metadata: { properties: properties.length } });
  if (!kept && properties.length === 1) await selectSearchConsoleProperty(tenantId, site.id, properties[0].property, userId, fetchImpl);
  return { siteId: site.id, properties };
}

async function accessTokenFor(row: { id: string; refreshTokenCiphertext: string | null }, fetchImpl: typeof fetch): Promise<string> {
  const refreshToken = row.refreshTokenCiphertext ? tryDecryptSecret(row.refreshTokenCiphertext) : null;
  if (!refreshToken) throw new SearchConsoleError("revoked", "search_console_token_unreadable");
  return refreshSearchConsoleToken(refreshToken, fetchImpl);
}

/** What a Google failure means for the connection; a revoked token is forgotten at once. */
async function recordFailure(row: { id: string; failureCount: number }, error: SearchConsoleError, now = new Date()) {
  const failures = row.failureCount + 1;
  const wait = error.kind === "quota" ? Math.min(24, 2 ** failures) * 3_600_000 : Math.min(720, 10 * 2 ** failures) * 60_000;
  const stop = error.kind === "revoked" || error.kind === "forbidden";
  await prisma.searchConsoleConnection.updateMany({
    where: { id: row.id },
    data: {
      lastError: error.message, lastSyncAt: now, failureCount: failures, leaseUntil: null,
      nextSyncAt: stop ? null : new Date(now.getTime() + wait),
      ...(stop ? { status: error.kind } : {}),
      ...(error.kind === "revoked" ? { refreshTokenCiphertext: null } : {}),
    },
  });
}

async function withToken<T>(tenantId: string, siteId: string, fetchImpl: typeof fetch, run: (accessToken: string, baseUrl: string | null) => Promise<T>): Promise<T> {
  const site = await requireSite(tenantId, siteId);
  const row = await prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId } });
  if (!row?.refreshTokenCiphertext) throw new Error("search_console_not_connected");
  try {
    return await run(await accessTokenFor(row, fetchImpl), site.baseUrl);
  } catch (error) {
    if (error instanceof SearchConsoleError && error.kind === "revoked") await recordFailure(row, error);
    throw error;
  }
}

export async function listSiteSearchConsoleProperties(tenantId: string, siteId: string, fetchImpl: typeof fetch = fetch): Promise<SearchConsoleProperty[]> {
  return withToken(tenantId, siteId, fetchImpl, async (token, baseUrl) => (await listSearchConsoleProperties(token, fetchImpl)).filter((entry) => propertyMatchesSite(entry.property, baseUrl)));
}

export async function selectSearchConsoleProperty(tenantId: string, siteId: string, property: string, userId: string | null, fetchImpl: typeof fetch = fetch) {
  const match = (await listSiteSearchConsoleProperties(tenantId, siteId, fetchImpl)).find((entry) => entry.property === property);
  if (!match) throw new Error("search_console_property_not_allowed");
  await prisma.$transaction(async (tx) => {
    const row = await tx.searchConsoleConnection.findFirstOrThrow({ where: { tenantId, siteId } });
    const changed = row.property !== null && row.property !== property;
    // Figures of another property are not comparable with the new one.
    if (changed) {
      await tx.searchPerformance.deleteMany({ where: { tenantId, siteId } });
      await tx.searchIndexStatus.deleteMany({ where: { tenantId, siteId } });
    }
    await tx.searchConsoleConnection.update({
      where: { id: row.id },
      data: {
        property, permissionLevel: match.permissionLevel, status: "active", lastError: null, failureCount: 0, nextSyncAt: new Date(), leaseUntil: null,
        ...(changed ? { syncedFrom: null, syncedThrough: null, backfillComplete: false } : {}),
      },
    });
    await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "search_console.property_selected", entityType: "site", entityId: siteId, metadata: { property, replaced: changed } }, tx);
  });
}

export async function disconnectSearchConsole(tenantId: string, siteId: string, userId: string | null, options: { deleteData: boolean }, fetchImpl: typeof fetch = fetch) {
  await requireSite(tenantId, siteId);
  const row = await prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId } });
  if (!row) throw new Error("search_console_not_connected");
  await prisma.$transaction(async (tx) => {
    await tx.searchConsoleConnection.update({
      where: { id: row.id },
      data: {
        status: "disconnected", refreshTokenCiphertext: null, nextSyncAt: null, leaseUntil: null, lastError: null,
        ...(options.deleteData ? { syncedFrom: null, syncedThrough: null, backfillComplete: false, property: null } : {}),
      },
    });
    if (options.deleteData) {
      await tx.searchPerformance.deleteMany({ where: { tenantId, siteId } });
      await tx.searchIndexStatus.deleteMany({ where: { tenantId, siteId } });
      // Recommendations and measurements quote those figures.
      await tx.contentOpportunity.deleteMany({ where: { tenantId, siteId, source: "search_console", planItemId: null } });
      await tx.seoAction.updateMany({ where: { tenantId, siteId }, data: { baseline: Prisma.DbNull, evaluations: Prisma.DbNull } });
      await tx.contentOpportunity.updateMany({ where: { tenantId, siteId }, data: { explanation: Prisma.DbNull, score: null, confidence: null, priority: null } });
    }
    await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "search_console.disconnected", entityType: "site", entityId: siteId, metadata: { deleteData: options.deleteData } }, tx);
  });
  // The local token is already gone; Google's side is best effort.
  const token = row.refreshTokenCiphertext ? tryDecryptSecret(row.refreshTokenCiphertext) : null;
  const shared = token ? await prisma.searchConsoleConnection.count({ where: { tenantId, refreshTokenCiphertext: { not: null }, connectedByUserId: row.connectedByUserId } }) : 0;
  // Google revokes the whole grant of the account: other sites of the same person would lose access.
  if (token && shared === 0) await revokeSearchConsoleToken(token, fetchImpl).catch(() => structuredEvent("search_console.revoke_failed", { tenantId, siteId }, "warn"));
}

const DATASETS: Array<{ dataset: "site" | "page" | "query"; dimensions: SearchDimension[]; rows: number }> = [
  { dataset: "site", dimensions: ["country", "device"], rows: SEARCH_CONSOLE_PAGE_ROWS },
  { dataset: "page", dimensions: ["page"], rows: SEARCH_CONSOLE_PAGE_ROWS },
  { dataset: "query", dimensions: ["query", "page", "country", "device"], rows: QUERY_ROWS_PER_DAY },
];

export type SyncResult = { status: "synced" | "skipped" | "failed"; days: number; more: boolean; error: string | null };

/** One bounded run. Stored days are never asked again; the lease keeps two workers from writing the same site. */
export async function syncSearchConsole(siteId: string, options: { fetchImpl?: typeof fetch; maxDays?: number; now?: Date } = {}): Promise<SyncResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  let lease = new Date(Date.now() + LEASE_MS);
  const claimed = await prisma.searchConsoleConnection.updateMany({
    where: { siteId, status: "active", property: { not: null }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    data: { leaseUntil: lease },
  });
  if (claimed.count !== 1) return { status: "skipped", days: 0, more: false, error: null };
  const row = await prisma.searchConsoleConnection.findUniqueOrThrow({ where: { siteId } });
  const property = row.property!;
  let stored = 0;
  try {
    const accessToken = await accessTokenFor(row, fetchImpl);
    const query = (input: { startDate: string; endDate: string; dimensions: SearchDimension[]; rowLimit?: number }) => querySearchConsole({ accessToken, property, ...input }, fetchImpl);
    const today = pacificToday(now);
    const oldest = addDays(today, -HISTORY_DAYS);
    // One cheap request says which days are final; history is asked only until it is complete.
    const since = row.backfillComplete && row.syncedThrough ? addDays(row.syncedThrough, 1) : oldest;
    const available = since > today ? [] : (await query({ startDate: day(since), endDate: day(today), dimensions: ["date"], rowLimit: 1_000 })).map((entry) => entry.keys[0]).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? ""));
    const limit = options.maxDays ?? DAYS_PER_RUN;
    const plan = planSyncDays(available, { from: row.syncedFrom ? day(row.syncedFrom) : null, through: row.syncedThrough ? day(row.syncedThrough) : null }, limit);
    let from = row.syncedFrom;
    let through = row.syncedThrough;
    for (const date of plan.days) {
      const rows: Prisma.SearchPerformanceCreateManyInput[] = [];
      for (const { dataset, dimensions, rows: rowLimit } of DATASETS) {
        for (const entry of await query({ startDate: date, endDate: date, dimensions, rowLimit })) rows.push(toRow(row.tenantId, siteId, dataset, date, dimensions, entry));
      }
      const at = fromDay(date);
      const nextFrom = !from || at < from ? at : from;
      const nextThrough = !through || at > through ? at : through;
      const nextLease = new Date(Math.max(Date.now() + LEASE_MS, lease.getTime() + 1));
      await prisma.$transaction(async (tx) => {
        // Fenced by the lease: a worker that lost it, or a connection that changed meanwhile, writes nothing.
        const owned = await tx.searchConsoleConnection.updateMany({ where: { id: row.id, status: "active", property, leaseUntil: lease }, data: { leaseUntil: nextLease, syncedFrom: nextFrom, syncedThrough: nextThrough } });
        if (owned.count !== 1) throw new SearchConsoleError("transient", "search_console_lease_lost");
        await tx.searchPerformance.deleteMany({ where: { tenantId: row.tenantId, siteId, date: at } });
        for (let i = 0; i < rows.length; i += 2_000) await tx.searchPerformance.createMany({ data: rows.slice(i, i + 2_000) });
      }, { timeout: 60_000 });
      lease = nextLease;
      from = nextFrom;
      through = nextThrough;
      stored += 1;
    }
    const complete = row.backfillComplete || plan.backfillComplete;
    if (complete) await inspectPages(row.tenantId, siteId, property, accessToken, fetchImpl);
    await prisma.searchPerformance.deleteMany({ where: { tenantId: row.tenantId, siteId, date: { lt: addDays(today, -RETENTION_DAYS) } } });
    const more = !complete;
    await prisma.searchConsoleConnection.updateMany({
      where: { id: row.id, leaseUntil: lease },
      data: { leaseUntil: null, lastSyncAt: now, lastSuccessAt: now, lastError: null, failureCount: 0, backfillComplete: complete, nextSyncAt: new Date(now.getTime() + (more ? 2 * 60_000 : SYNC_EVERY_MS)) },
    });
    structuredEvent("search_console.synced", { tenantId: row.tenantId, siteId, days: stored, more });
    return { status: "synced", days: stored, more, error: null };
  } catch (error) {
    const failure = error instanceof SearchConsoleError ? error : new SearchConsoleError("transient", "search_console_sync_failed");
    if (!(error instanceof SearchConsoleError)) structuredEvent("search_console.sync_error", { tenantId: row.tenantId, siteId, error: error instanceof Error ? error.message.slice(0, 300) : String(error) }, "error");
    if (failure.message !== "search_console_lease_lost") await recordFailure(row, failure, now);
    structuredEvent("search_console.sync_failed", { tenantId: row.tenantId, siteId, kind: failure.kind, error: failure.message, days: stored }, "warn");
    return { status: "failed", days: stored, more: false, error: failure.message };
  }
}

function toRow(tenantId: string, siteId: string, dataset: string, date: string, dimensions: SearchDimension[], entry: SearchRow): Prisma.SearchPerformanceCreateManyInput {
  const value = (dimension: SearchDimension) => entry.keys[dimensions.indexOf(dimension)] ?? "";
  return {
    tenantId, siteId, dataset, date: fromDay(date), page: value("page"), query: value("query"), country: value("country"), device: value("device").toLowerCase(),
    clicks: Math.round(entry.clicks), impressions: Math.round(entry.impressions), positionSum: entry.position * entry.impressions,
  };
}

/** Indexing state of a few pages per run, never inspected first. A refusal here never spoils the synchronization. */
async function inspectPages(tenantId: string, siteId: string, property: string, accessToken: string, fetchImpl: typeof fetch) {
  const done = await prisma.searchIndexStatus.count({ where: { tenantId, siteId, inspectedAt: { gt: new Date(Date.now() - DAY_MS) } } });
  const limit = Math.min(INSPECTIONS_PER_RUN, INSPECTIONS_PER_DAY - done);
  if (limit <= 0) return;
  const pages = await prisma.$queryRaw<Array<{ url: string }>>`
    SELECT p.url FROM site_indexed_pages p
    LEFT JOIN search_index_status s ON s.site_id = p.site_id AND s.url = p.url
    WHERE p.tenant_id = ${tenantId}::uuid AND p.site_id = ${siteId}::uuid AND (s.inspected_at IS NULL OR s.inspected_at < now() - interval '30 days')
    ORDER BY s.inspected_at ASC NULLS FIRST, p.modified_at DESC NULLS LAST LIMIT ${limit}`;
  for (const { url } of pages) {
    if (!propertyMatchesSite(property, url)) continue;
    try {
      const data = { ...(await inspectSearchConsoleUrl({ accessToken, property, url }, fetchImpl)), inspectedAt: new Date() };
      await prisma.searchIndexStatus.upsert({ where: { siteId_url: { siteId, url } }, create: { tenantId, siteId, url, ...data }, update: data });
    } catch (error) {
      structuredEvent("search_console.inspection_failed", { tenantId, siteId, error: error instanceof Error ? error.message.slice(0, 120) : "unknown" }, "warn");
      return;
    }
  }
}

/** Sites due for synchronization. `afterSync` runs the analysis once the history is complete. */
export async function runSearchConsoleTick(afterSync: (tenantId: string, siteId: string) => Promise<unknown>, options: { fetchImpl?: typeof fetch } = {}): Promise<number> {
  if (!searchConsoleConfigured() || (await readSeoControl()).emergencyStop) return 0;
  const due = await prisma.searchConsoleConnection.findMany({
    where: { status: "active", nextSyncAt: { lte: new Date() }, tenant: { status: "active" } },
    orderBy: { nextSyncAt: "asc" },
    take: 5,
    select: { tenantId: true, siteId: true },
  });
  for (const { tenantId, siteId } of due) {
    const result = await syncSearchConsole(siteId, options);
    if (result.status !== "synced" || result.more) continue;
    await afterSync(tenantId, siteId).catch((error: unknown) =>
      structuredEvent("seo_intelligence.analysis_failed", { tenantId, siteId, error: error instanceof Error ? error.message.slice(0, 300) : String(error) }, "error"));
  }
  return due.length;
}
