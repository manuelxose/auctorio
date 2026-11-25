// Central manager for external SEO data (SEO-V2): the only way to reach a provider.
// An acquisition reuses stored data first, then buys only what is missing, through the Cost Governor (seo-governor.ts):
// reservation -> dispatch -> cache -> settlement. The control state is read from the database on every decision, so
// disabling a provider (or everything) takes effect on the next call in every process.

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  SeoProviderError,
  isWebCapability,
  normalizeDomain,
  normalizeKeyword,
  seoMarket,
  type KeywordMetrics,
  type KeywordVolume,
  type SeoAdapterResult,
  type SeoCapability,
  type SeoData,
  type SeoErrorCode,
  type SeoFreshness,
  type SeoMarket,
  type SeoProvider,
  type SeoQuote,
  type SeoRequests,
  type SeoResult,
} from "../infrastructure/seo/contract";
import { SEO_RESOURCES, freshnessDays, retentionDays, seoCacheKey, type SeoDecision } from "../infrastructure/seo/policy";
import { effectiveQuote, seoPrice, type SeoPriceOverrides } from "../infrastructure/seo/pricing";
import { DEFAULT_CONTROL, SEO_PROVIDERS, findSeoProvider, primarySeoProviderId, seoBlockReason, selectSeoProvider, type SeoControl, type SeoLocks } from "../infrastructure/seo/registry";
import { sha256 } from "../shared/utils/hash";
import { structuredEvent } from "../shared/utils/logger";
import { mergeKeywordMetrics, readSeoCache, writeSeoCache, writeSeoSnapshot, type FieldProvenance, type SeoCacheEntry, type SeoCacheRow } from "./seo-cache";
import { loadSeoControl, readSeoControl } from "./seo-control";
import { recordKeywordMetrics, type MetricRow } from "./seo-research/knowledge";
import { dispatchSeoReservation, markSeoReservationUncertain, releaseSeoReservation, reserveSeoSpend, settleSeoReservation, waitForSeoLeases, type SeoPriority, type SeoReservation } from "./seo-governor";

export { loadSeoControl } from "./seo-control";

const prisma = getPrismaClient();

export type SeoRoute = {
  provider: SeoProvider;
  market: SeoMarket;
  /** Prefix of the cache keys written before canonical keys; names the market in stored research. */
  marketKey: string;
  /** Source stored on the metrics this route returns. */
  sourceTag: string;
};

/** Who would serve a capability for a site's locale; null (with the reason) when nobody may. Never calls a provider. */
export async function seoRoute(capability: SeoCapability, locale: string | null | undefined, options: { locks?: SeoLocks } = {}): Promise<SeoRoute | { provider: null; reason: SeoErrorCode }> {
  const market = seoMarket(locale);
  if (!market) return { provider: null, reason: "unsupported_market" };
  try {
    const control = await loadSeoControl();
    const provider = selectSeoProvider(capability, market, control, { locks: options.locks, quote: nominalQuote(capability, market, control) });
    const declaration = provider.capabilities[capability];
    return { provider, market, marketKey: provider.marketKey(capability, market)!, sourceTag: declaration.supported ? declaration.sourceTag : provider.id };
  } catch (error) {
    if (error instanceof SeoProviderError) return { provider: null, reason: error.code };
    throw error;
  }
}

/** Whether a capability can be acquired at all right now (any market). Database read only. */
export async function seoCapabilityAvailable(capability: SeoCapability): Promise<boolean> {
  try {
    selectSeoProvider(capability, null, await loadSeoControl());
    return true;
  } catch (error) {
    if (error instanceof SeoProviderError) return false;
    throw error;
  }
}

export type SeoScope = {
  tenantId: string;
  siteId: string | null;
  /** Spend category. */
  kind: string;
  fetchImpl?: typeof fetch;
  locks?: SeoLocks;
  priority?: SeoPriority;
  /** The decision waiting for this data. Without one, stale data is used as it is. */
  decision?: SeoDecision;
  /** Stored data only: nothing is bought. */
  reuseOnly?: boolean;
  /** Research run the purchase belongs to. */
  runId?: string;
};

/** Request options the provider does not declare are refused before anything is sent. */
function assertRequest<C extends SeoCapability>(provider: SeoProvider, capability: C, request: SeoRequests[C]): void {
  const declaration = provider.capabilities[capability];
  if (!declaration.supported) throw new SeoProviderError("unsupported_capability", `${provider.id}: ${capability} is not supported (${declaration.reason})`, provider.id, 0);
  const options = request as { limit?: number; cursor?: string; device?: "desktop" | "mobile" };
  const refuse = (what: string) => new SeoProviderError("bad_request", `${provider.id}: ${capability} ${what}`, provider.id, 0);
  if (options.cursor !== undefined && !declaration.pagination) throw refuse("has no pagination");
  if (options.device && !declaration.devices.includes(options.device)) throw refuse("cannot choose a device");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || (declaration.maxResults !== null && options.limit > declaration.maxResults))) throw refuse(`limit ${options.limit} is out of range`);
}

// ---- Provider health and circuit breaker ----

const MINUTE = 60_000;
/** Failures of the provider (not of the request) in a row before it is left alone. */
const CIRCUIT_FAILURES = 3;

function circuitFor(code: SeoErrorCode, failures: number): { until: Date; reason: string } | null {
  const open = (minutes: number) => ({ until: new Date(Date.now() + minutes * MINUTE), reason: code });
  if (code === "invalid_credentials" || code === "insufficient_balance") return open(30);
  if (code === "rate_limited") return open(1);
  if (failures >= CIRCUIT_FAILURES) return open(Math.min(60, 5 * 2 ** (failures - CIRCUIT_FAILURES)));
  return null;
}

async function recordHealth(provider: SeoProvider, data: Prisma.SeoProviderStateUncheckedUpdateInput): Promise<{ consecutiveFailures: number } | null> {
  const defaults = DEFAULT_CONTROL.providers[provider.id] ?? { enabled: false, priority: 100 };
  const { consecutiveFailures, ...rest } = data;
  try {
    return await prisma.seoProviderState.upsert({
      where: { providerId: provider.id },
      create: { providerId: provider.id, ...defaults, ...(rest as object), consecutiveFailures: typeof consecutiveFailures === "number" ? consecutiveFailures : consecutiveFailures ? 1 : 0 },
      update: data,
    });
  } catch (error) {
    structuredEvent("seo.health_not_recorded", { provider: provider.id, error: error instanceof Error ? error.message : String(error) }, "warn");
    return null;
  }
}

async function recordFailure(provider: SeoProvider, failure: SeoProviderError): Promise<void> {
  const outage = failure.code === "timeout" || failure.code === "upstream_error" || failure.code === "malformed_response";
  const row = await recordHealth(provider, { lastErrorAt: new Date(), lastErrorCode: failure.code, lastErrorMessage: failure.message.slice(0, 300), ...(outage ? { consecutiveFailures: { increment: 1 } } : {}) });
  const circuit = outage || ["invalid_credentials", "insufficient_balance", "rate_limited"].includes(failure.code) ? circuitFor(failure.code, outage ? row?.consecutiveFailures ?? 0 : 0) : null;
  if (!circuit) return;
  await recordHealth(provider, { circuitOpenUntil: circuit.until, circuitReason: circuit.reason });
  structuredEvent("seo.circuit_open", { provider: provider.id, reason: circuit.reason, until: circuit.until.toISOString() }, "warn");
}

// ---- Priority queue: at most a few requests in flight per provider and process, people first ----

const MAX_IN_FLIGHT = 4;
const PRIORITY_ORDER: Record<SeoPriority, number> = { interactive: 0, planning: 1, background: 2 };
type Lane = { active: number; waiting: Array<{ order: number; start: () => void }> };
const lanes = new Map<string, Lane>();

export async function withSeoSlot<T>(providerId: string, priority: SeoPriority, run: () => Promise<T>): Promise<T> {
  const lane = lanes.get(providerId) ?? { active: 0, waiting: [] };
  lanes.set(providerId, lane);
  if (lane.active >= MAX_IN_FLIGHT) {
    await new Promise<void>((start) => {
      const at = lane.waiting.findIndex((entry) => entry.order > PRIORITY_ORDER[priority]);
      lane.waiting.splice(at < 0 ? lane.waiting.length : at, 0, { order: PRIORITY_ORDER[priority], start });
    });
  } else lane.active += 1;
  try {
    return await run();
  } finally {
    const next = lane.waiting.shift(); // the slot passes on: active does not change
    if (next) next.start();
    else lane.active -= 1;
  }
}

// ---- One paid request ----

/** The price turned out to be wrong: nothing more is bought with it until an administrator confirms a new maximum. */
async function markPriceSuspect(providerId: string, capability: SeoCapability, billedUsd: number): Promise<void> {
  const key = `${providerId}:${capability}`;
  const pricing = { ...((await prisma.seoControlSetting.findUnique({ where: { id: "global" }, select: { pricing: true } }))?.pricing as SeoPriceOverrides | null) };
  pricing[key] = { ...pricing[key], suspect: { billedUsd, at: new Date().toISOString() } };
  await prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", mode: DEFAULT_CONTROL.mode, pricing: pricing as Prisma.InputJsonObject }, update: { pricing: pricing as Prisma.InputJsonObject } });
}

/** Sends a reserved request and accounts for its outcome. `keep` stores the answer before the reservation is closed. */
async function sendReserved<C extends SeoCapability>(
  provider: SeoProvider,
  capability: C,
  request: SeoRequests[C],
  reservation: SeoReservation,
  scope: SeoScope,
  keep: (result: SeoAdapterResult<C>, fetchedAt: Date) => Promise<void> = async () => undefined,
  unanswered: (result: SeoAdapterResult<C>) => string[] = () => [],
): Promise<{ result: SeoAdapterResult<C>; fetchedAt: Date; billedUsd: number | null }> {
  const trace = { tenantId: scope.tenantId, siteId: scope.siteId, provider: provider.id, capability, reservationId: reservation.id };
  // Accounting that fails leaves the reservation in flight: it is recovered as uncertain and keeps holding its maximum.
  const account = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      structuredEvent("seo.spend_not_recorded", { ...trace, error: error instanceof Error ? error.message : String(error) }, "error");
    }
  };
  if (!(await dispatchSeoReservation(reservation.id, provider.id))) {
    await account(() => releaseSeoReservation(reservation.id, "stopped_before_dispatch"));
    const reason = seoBlockReason(provider, capability, null, await readSeoControl(), "authorized_test") ?? (scope.runId ? "run_stopped" : "provider_disabled");
    throw new SeoProviderError(reason, `${provider.id}: stopped before sending (${reason})`, provider.id, 0);
  }
  let result: SeoAdapterResult<C>;
  try {
    result = await provider.run(capability, request, scope.fetchImpl ?? fetch);
  } catch (error) {
    const failure = error instanceof SeoProviderError ? error : new SeoProviderError("upstream_error", `${provider.id}: unexpected failure`, provider.id);
    const { billedUsd, code } = failure;
    if (billedUsd === null) {
      structuredEvent("seo.cost_unknown_after_error", { ...trace, code, heldUsd: reservation.maxUsd }, "warn");
      await account(() => markSeoReservationUncertain(reservation.id, code));
    } else if (billedUsd > 0) await account(() => settleSeoReservation(reservation.id, { actualUsd: billedUsd, errorCode: code }));
    else await account(() => releaseSeoReservation(reservation.id, `not_billed:${code}`, code));
    await recordFailure(provider, failure);
    throw failure;
  }
  const fetchedAt = new Date();
  try {
    await keep(result, fetchedAt);
  } catch (error) {
    structuredEvent("seo.cache_not_written", { ...trace, error: error instanceof Error ? error.message : String(error) }, "error");
  }
  const { billedUsd } = result;
  // Not reported: account for the most it could have charged, never for zero.
  if (billedUsd === null) structuredEvent("seo.cost_unreported", { ...trace, assumedUsd: reservation.maxUsd }, "warn");
  await account(() => settleSeoReservation(reservation.id, { actualUsd: billedUsd ?? reservation.maxUsd, assumed: billedUsd === null, unanswered: unanswered(result) }));
  if (billedUsd !== null && billedUsd > reservation.maxUsd * 1.001) {
    structuredEvent("seo.billed_over_quote", { ...trace, billedUsd, maxUsd: reservation.maxUsd }, "error");
    result.notes.push("billed_over_quote");
    await account(() => markPriceSuspect(provider.id, capability, billedUsd));
  }
  if (result.notes.length) structuredEvent("seo.notes", { ...trace, upstream: result.upstream, notes: result.notes });
  await recordHealth(provider, { lastSuccessAt: fetchedAt, consecutiveFailures: 0, circuitOpenUntil: null, circuitReason: null });
  return { result, fetchedAt, billedUsd };
}

// ---- Acquisition ----

type Subject = { subject: string; key: string; legacyKey: string | null; leaseKey: string };

const keywordsOf = (request: unknown) => (request as { keywords?: string[] }).keywords;

function subjectsOf<C extends SeoCapability>(route: SeoRoute, capability: C, request: SeoRequests[C], tenantId: string): Subject[] {
  const single = request as { seed?: string; domain?: string; keyword?: string; url?: string; limit?: number; cursor?: string; device?: string; engine?: string; freshnessHours?: number };
  // A web query keeps its case (operators) and a URL is a URL.
  const normalize = isWebCapability(capability) ? (value: string) => value.trim() : capability === "ranked_keywords" ? normalizeDomain : normalizeKeyword;
  const subjects = [...new Set((keywordsOf(request) ?? [single.seed ?? single.domain ?? single.url ?? single.keyword ?? ""]).map(normalize).filter(Boolean))];
  return subjects.map((subject) => {
    const key = seoCacheKey(route.provider, capability, route.market, subject, single);
    const legacy = single.cursor || single.device ? null : `${route.marketKey}|${subject}`;
    return { subject, key, legacyKey: legacy, leaseKey: sha256([tenantId, route.provider.id, SEO_RESOURCES[capability], key].join("|")) };
  });
}

/** The request the provider gets for these subjects. */
function requestFor<C extends SeoCapability>(capability: C, request: SeoRequests[C], subjects: string[]): SeoRequests[C] {
  if (keywordsOf(request)) return { ...request, keywords: subjects };
  const field = capability === "ranked_keywords" ? "domain" : capability === "keyword_suggestions" ? "seed" : capability === "web_extract" ? "url" : "keyword";
  return { ...request, [field]: subjects[0] };
}

/** Stores an answer: per keyword where the request was a batch, whole otherwise; every keyword metric it carries is kept for reuse. */
async function keepAnswer<C extends SeoCapability>(route: SeoRoute, capability: C, bought: Subject[], request: SeoRequests[C], result: SeoAdapterResult<C>, reservationId: string, fetchedAt: Date, tenantId: string): Promise<void> {
  const { provider, market } = route;
  const days = retentionDays(provider.licensing);
  const declaration = provider.capabilities[capability];
  const base = { asOf: result.asOf, upstream: result.upstream, methodology: declaration.supported ? declaration.methodology : "" };
  const store = (cap: SeoCapability, rows: SeoCacheRow[]) => writeSeoCache(tenantId, provider.id, cap, rows, fetchedAt, days);
  const learn = (rows: MetricRow[]) => recordKeywordMetrics({ tenantId, provider, source: declaration.supported ? declaration.sourceTag : provider.id, market, rows, reservationId, fetchedAt, retentionDays: days });

  if (capability === "search_volume") {
    const volumes = new Map((result.data as KeywordVolume[]).map((row) => [row.keyword, row.volume]));
    const rows = bought.filter(({ subject }) => volumes.has(subject) || !result.partial);
    await store(capability, rows.map(({ subject, key }) => ({ key, payload: volumes.get(subject) ?? null, negative: !volumes.has(subject), meta: base })));
    const provenance: FieldProvenance = { at: fetchedAt.toISOString(), via: capability, kind: declaration.supported ? declaration.dataKind : "unknown", asOf: result.asOf, upstream: result.upstream };
    await learn(rows.map(({ subject }) => ({ keyword: subject, values: { volume: volumes.get(subject) ?? null, difficulty: null, cpc: null, intent: null }, fields: { volume: provenance } })));
  } else if (capability !== "keyword_metrics") {
    const data = result.data as unknown[];
    // Nothing left of a partial answer is not "no data": it is asked again next time.
    if (data.length || !result.partial) await store(capability, [{ key: bought[0].key, payload: data, negative: data.length === 0, meta: base }]);
  }

  if (capability === "keyword_metrics" || capability === "keyword_suggestions" || capability === "ranked_keywords") {
    // Both providers answer the three operations from the same keyword database, so the values are compatible across them.
    const metrics = new Map((result.data as KeywordMetrics[]).map((row) => [normalizeKeyword(row.keyword), row]));
    const keyOf = (keyword: string) => seoCacheKey(provider, "keyword_metrics", market, keyword);
    const asked = capability === "keyword_metrics" ? bought.map(({ subject }) => subject) : [];
    const keywords = [...new Set([...metrics.keys(), ...asked])];
    const existing = await readSeoCache(tenantId, provider.id, "keyword_metrics", keywords.map((keyword) => ({ key: keyOf(keyword), legacyKey: null })), days, fetchedAt);
    const provenance: FieldProvenance = { at: fetchedAt.toISOString(), via: capability, kind: declaration.supported ? declaration.fieldKinds?.volume ?? declaration.dataKind : "unknown", asOf: result.asOf, upstream: result.upstream };
    const rows: SeoCacheRow[] = [];
    const learned: MetricRow[] = [];
    for (const keyword of keywords) {
      const known = existing.get(keyOf(keyword));
      const row = metrics.get(keyword);
      if (row) {
        const merged = mergeKeywordMetrics(known && !known.negative ? { payload: known.payload as KeywordMetrics, meta: known.meta } : null, { ...row, keyword }, provenance);
        rows.push({ key: keyOf(keyword), payload: merged.payload, negative: false, meta: { ...base, ...merged.meta }, fetchedAt: new Date(merged.meta.fields!.volume!.at) });
        learned.push({ keyword, values: merged.payload, fields: merged.meta.fields! });
      } else if (!result.partial && (!known || known.negative)) {
        rows.push({ key: keyOf(keyword), payload: null, negative: true, meta: base });
        learned.push({ keyword, values: { volume: null, difficulty: null, cpc: null, intent: null }, fields: { volume: provenance } });
      }
    }
    await store("keyword_metrics", rows);
    await learn(learned);
  }
  if (capability === "web_extract") return; // a third party's page: no history of it is kept
  await writeSeoSnapshot({
    tenantId, providerId: provider.id, capability, cacheKey: bought.length === 1 ? bought[0].key : `batch:${bought.length}:${sha256(bought.map(({ key }) => key).join("\n")).slice(0, 16)}`,
    data: result.data, meta: { ...base, partial: result.partial, market, subjects: bought.length, limit: (request as { limit?: number }).limit ?? null }, reservationId, fetchedAt, retentionDays: days,
  });
}

async function acquireNow<C extends SeoCapability>(route: SeoRoute, capability: C, request: SeoRequests[C], scope: SeoScope): Promise<SeoResult<C>> {
  const { provider, market } = route;
  assertRequest(provider, capability, request);
  const decision = scope.decision ?? {};
  const control = await readSeoControl();
  const subjects = subjectsOf(route, capability, request, scope.tenantId);
  if (!subjects.length) throw new SeoProviderError("bad_request", `${provider.id}: ${capability} without a subject`, provider.id, 0);
  const freshDays = freshnessDays(capability, market, decision, control.policy, provider.licensing);
  const entries = await readSeoCache(scope.tenantId, provider.id, capability, subjects, freshDays);
  const quoteOf = (list: Subject[]) => provider.quote(capability, requestFor(capability, request, list.map(({ subject }) => subject)));
  const notes: string[] = [];
  const failures = new Map<string, SeoErrorCode>();
  let lastError: SeoProviderError | null = null;
  const refuse = (list: Subject[], code: SeoErrorCode) => list.forEach(({ key }) => failures.set(key, code));

  // Buy what is missing, plus what is stale when the pending decision is worth more than refreshing it.
  const missing = subjects.filter(({ key }) => !entries.has(key));
  const stale = subjects.filter(({ key }) => entries.get(key)?.freshness === "stale");
  let wanted = missing;
  if (stale.length && scope.decision && !scope.reuseOnly) {
    const price = (list: Subject[]) => (list.length ? effectiveQuote(quoteOf(list), provider.id, capability, control.pricing).maxUsd : 0);
    const [all, without] = [price([...missing, ...stale]), price(missing)];
    const value = control.policy.decisionValueUsd[decision.importance ?? "normal"] * (keywordsOf(request) ? stale.length : 1);
    if (all !== null && without !== null && all - without <= value) wanted = [...missing, ...stale];
  }
  const priced = seoPrice(provider.id, capability);
  const flatBatch = Boolean(priced?.batchItems && priced.perItemUsd === 0);
  if (wanted.length && scope.reuseOnly) {
    refuse(wanted, "reuse_only");
    wanted = [];
  } else if (wanted.length && flatBatch && wanted.length < control.policy.minVolumeBatch && decision.importance !== "high") {
    // A flat price for a handful of keywords: wait until there are more.
    refuse(wanted, "not_worth_cost");
    wanted = [];
  }

  const declaration = provider.capabilities[capability];
  const size = (declaration.supported && declaration.maxBatch) || 1;
  const bought: SeoAdapterResult<C>[] = [];
  const reservationIds: string[] = [];
  const direct = new Map<string, unknown>();
  let billedUsd: number | null = 0;
  let boughtKeys = 0;
  let fetchedAt: Date | null = null;
  let quote: SeoQuote | null = null;
  const busy: Subject[] = [];
  for (let start = 0; start < wanted.length; start += size) {
    const chunk = wanted.slice(start, start + size);
    const byLease = new Map(chunk.map((entry) => [entry.leaseKey, entry]));
    const pick = (keys: string[]) => keys.map((key) => byLease.get(key)!);
    try {
      await withSeoSlot(provider.id, scope.priority ?? "planning", async () => {
        const selected = selectSeoProvider(capability, market, await loadSeoControl(), { locks: scope.locks, quote: nominalQuote(capability, market, control) });
        if (selected.id !== provider.id) throw new SeoProviderError("provider_disabled", `${capability}: ${provider.id} is no longer the selected provider`, provider.id, 0);
        const reserved = await reserveSeoSpend({
          tenantId: scope.tenantId, siteId: scope.siteId, provider, capability, kind: scope.kind, resource: SEO_RESOURCES[capability], keys: chunk.map(({ leaseKey }) => leaseKey),
          quote: (keys) => quoteOf(pick(keys)), priority: scope.priority, locks: scope.locks, runId: scope.runId,
        });
        busy.push(...pick(reserved.busy));
        for (const { key, code } of reserved.blocked) refuse([byLease.get(key)!], code);
        if (!reserved.reservation) return;
        const mine = pick(reserved.claimed);
        // Someone may have bought these between the first look and the lease.
        const meanwhile = await readSeoCache(scope.tenantId, provider.id, capability, mine, freshDays);
        const still = mine.filter(({ key }) => (meanwhile.get(key)?.fetchedAt.getTime() ?? 0) <= (entries.get(key)?.fetchedAt.getTime() ?? 0));
        for (const { key } of mine) if (meanwhile.has(key)) entries.set(key, meanwhile.get(key)!);
        if (!still.length) {
          await releaseSeoReservation(reserved.reservation.id, "already_acquired");
          return;
        }
        const sent = requestFor(capability, request, still.map(({ subject }) => subject));
        const outcome = await sendReserved(provider, capability, sent, reserved.reservation, scope, (result, at) => keepAnswer(route, capability, still, sent, result, reserved.reservation!.id, at, scope.tenantId), (result) => {
          if (!result.partial) return [];
          const answered = new Set((result.data as Array<{ keyword?: string }>).map((row) => row.keyword));
          return still.filter(({ subject }) => (keywordsOf(request) ? !answered.has(subject) : result.data.length === 0)).map(({ leaseKey }) => leaseKey);
        });
        bought.push(outcome.result);
        reservationIds.push(reserved.reservation.id);
        boughtKeys += still.length;
        billedUsd = billedUsd === null || outcome.billedUsd === null ? null : billedUsd + outcome.billedUsd;
        fetchedAt = outcome.fetchedAt;
        quote = reserved.reservation.quote;
        // The answer itself, in case it could not be stored.
        if (keywordsOf(request)) {
          const rows = new Map((outcome.result.data as Array<{ keyword: string }>).map((row) => [row.keyword, row]));
          for (const entry of still) if (rows.has(entry.subject) || !outcome.result.partial) direct.set(entry.key, rows.get(entry.subject) ?? null);
        } else direct.set(still[0].key, outcome.result.data);
      });
    } catch (error) {
      if (!(error instanceof SeoProviderError)) throw error;
      lastError = error;
      refuse(chunk.filter(({ key }) => !direct.has(key)), error.code);
      refuse(wanted.slice(start + size), error.code); // the rest of the batches would fail, or pay, the same way
      break;
    }
  }

  if (busy.length) {
    await waitForSeoLeases(busy.map(({ leaseKey }) => leaseKey));
    const arrived = await readSeoCache(scope.tenantId, provider.id, capability, busy, freshDays);
    for (const entry of busy) {
      if (arrived.has(entry.key)) entries.set(entry.key, arrived.get(entry.key)!);
      else failures.set(entry.key, "acquisition_in_progress"); // the other worker failed: not retried here
    }
  }

  // Every subject now has an answer bought here, stored data (stale included), or stays unknown.
  let oldest: SeoFreshness = "fresh";
  let hits = 0;
  let staleHits = 0;
  const rows: unknown[] = [];
  const unresolved: string[] = [];
  let asOf: string | null = null;
  let upstream: string | null = null;
  for (const { subject, key } of subjects) {
    const value = direct.get(key);
    const entry: SeoCacheEntry | undefined = entries.get(key);
    if (value !== undefined) {
      if (!keywordsOf(request)) rows.push(...(value as unknown[]));
      else if (value) rows.push(value);
      continue;
    }
    if (!entry) {
      unresolved.push(subject);
      continue;
    }
    if (entry.freshness === "stale") {
      staleHits += 1;
      oldest = "stale";
    } else hits += 1;
    asOf ??= entry.meta.asOf ?? null;
    upstream ??= entry.meta.upstream ?? null;
    if (entry.negative || entry.payload === null) continue;
    if (capability === "search_volume") rows.push({ keyword: subject, volume: Number(entry.payload) });
    else if (keywordsOf(request)) rows.push(entry.payload);
    else rows.push(...(entry.payload as unknown[]));
  }
  if (unresolved.length === subjects.length && !bought.length) {
    const code = failures.get(subjects[0].key) ?? "upstream_error";
    throw lastError ?? new SeoProviderError(code, `${provider.id}: ${capability} not available now (${code})`, provider.id, 0);
  }
  if (unresolved.length) notes.push(...[...new Set(failures.values())].map((code) => `unresolved:${code}`));
  if (boughtKeys) {
    const primary = primarySeoProviderId(capability, control);
    if (primary && primary !== provider.id) notes.push(`paid_fallback:${primary}`);
  }
  return {
    data: rows as SeoData[C],
    meta: {
      billedUsd, asOf: bought[0]?.asOf ?? asOf, upstream: bought[0]?.upstream ?? upstream, partial: unresolved.length > 0 || bought.some((result) => result.partial),
      nextCursor: bought[0]?.nextCursor ?? null, notes: [...bought.flatMap((result) => result.notes), ...notes], providerId: provider.id, capability, market,
      fetchedAt: ((fetchedAt as Date | null) ?? entries.get(subjects[0].key)?.fetchedAt ?? new Date()).toISOString(),
      dataKind: declaration.supported ? declaration.dataKind : "unknown", methodology: declaration.supported ? declaration.methodology : "", quote: (quote as SeoQuote | null) ?? quoteOf(subjects),
      cache: { hits, stale: staleHits, bought: boughtKeys }, freshness: oldest, unresolved, reservationIds,
    },
  };
}

// Keyword batches asked at the same moment travel in one request: the base price is paid once.
const COALESCE_MS = 25;
type Batch = { keywords: Set<string>; result: Promise<unknown> };
const batches = new Map<string, Batch>();

function coalesced<C extends SeoCapability>(route: SeoRoute, capability: C, request: SeoRequests[C], scope: SeoScope, keywords: string[]): Promise<SeoResult<C>> {
  const group = [scope.tenantId, scope.siteId, scope.kind, route.provider.id, capability, route.marketKey, route.market.country, route.market.language, scope.reuseOnly ? "reuse" : "buy", scope.locks ? "locks" : "", scope.priority ?? "", scope.runId ?? "", JSON.stringify(scope.decision ?? null)].join("|");
  let batch = batches.get(group);
  if (!batch) {
    const set = new Set<string>();
    const created: Batch = {
      keywords: set,
      result: new Promise((resolve) => setTimeout(resolve, COALESCE_MS)).then(() => {
        batches.delete(group);
        return acquireNow(route, capability, { ...request, keywords: [...set] }, scope);
      }),
    };
    batches.set(group, created);
    batch = created;
  }
  for (const keyword of keywords) batch.keywords.add(keyword);
  return batch.result as Promise<SeoResult<C>>;
}

/**
 * Data from the route's provider: what is stored and good enough, plus what is missing, bought within every limit.
 * Throws when nothing can be answered; a partly answered batch lists the rest in meta.unresolved.
 */
export async function acquireSeo<C extends SeoCapability>(route: SeoRoute, capability: C, request: Omit<SeoRequests[C], "market">, scope: SeoScope): Promise<SeoResult<C>> {
  const full = { ...request, market: route.market } as SeoRequests[C];
  const asked = keywordsOf(full);
  if (!asked) return acquireNow(route, capability, full, scope);
  const keywords = [...new Set(asked.map(normalizeKeyword).filter(Boolean))];
  const own = new Set(keywords);
  const { data, meta } = await coalesced(route, capability, full, scope, keywords);
  const unresolved = meta.unresolved.filter((keyword) => own.has(keyword));
  if (keywords.length && unresolved.length === keywords.length) {
    const code = meta.notes.find((note) => note.startsWith("unresolved:"))?.slice("unresolved:".length) as SeoErrorCode | undefined;
    if (code) throw new SeoProviderError(code, `${route.provider.id}: ${capability} not available now (${code})`, route.provider.id, 0);
  }
  return { data: (data as Array<{ keyword: string }>).filter((row) => own.has(row.keyword)) as SeoData[C], meta: { ...meta, unresolved } };
}

/**
 * What is already stored of an answer, when nobody may be asked now (stopped, disabled, no credentials): the knowledge an
 * installation has keeps serving it. Sends nothing. null = nothing stored by any provider.
 */
export async function readStoredSeo<C extends SeoCapability>(capability: C, locale: string | null | undefined, request: Omit<SeoRequests[C], "market">, scope: Omit<SeoScope, "reuseOnly">): Promise<SeoResult<C> | null> {
  const market = seoMarket(locale);
  if (!market) return null;
  for (const provider of SEO_PROVIDERS) {
    const declaration = provider.capabilities[capability];
    const marketKey = declaration.supported ? provider.marketKey(capability, market) : null;
    if (!declaration.supported || marketKey === null) continue;
    try {
      return await acquireNow({ provider, market, marketKey, sourceTag: declaration.sourceTag }, capability, { ...request, market } as SeoRequests[C], { ...scope, reuseOnly: true });
    } catch (error) {
      if (!(error instanceof SeoProviderError)) throw error;
    }
  }
  return null;
}

// ---- Authorized live test ----

/** Most an administrator can authorize for one live test. */
export const MAX_TEST_SPEND_USD = 0.25;

const testRequest = (market: SeoMarket): { [C in SeoCapability]: SeoRequests[C] } => ({
  keyword_metrics: { market, keywords: ["weather"] },
  keyword_suggestions: { market, seed: "weather", limit: 1 },
  ranked_keywords: { market, domain: "wikipedia.org", limit: 1 },
  serp_organic: { market, keyword: "weather" },
  search_volume: { market, keywords: ["weather"] },
  youtube_search: { market, keyword: "weather" },
  web_search: { market, keyword: "weather", limit: 1 },
  web_extract: { market, url: "https://example.com" },
});

/** Price of the same small request on every provider: what cost-optimized routing compares. */
function nominalQuote(capability: SeoCapability, market: SeoMarket, control: Pick<SeoControl, "pricing">) {
  const request = testRequest(market)[capability];
  return (provider: SeoProvider) => effectiveQuote(provider.quote(capability, request), provider.id, capability, control.pricing);
}

/** One minimal live call an admin authorized with a ceiling. Refused, uncalled, when the maximum price is unknown or above it. */
export async function verifySeoProvider(
  input: { providerId: string; capability: SeoCapability; locale: string; maxSpendUsd: number; tenantId: string; /** Same id = same test: a repeated click does not pay twice. */ requestId?: string; fetchImpl?: typeof fetch },
): Promise<{ rows: number; costUsd: number | null; partial: boolean; notes: string[]; market: string }> {
  const provider = findSeoProvider(input.providerId);
  if (!provider) throw new SeoProviderError("not_selected", "unknown provider", null, 0);
  const market = seoMarket(input.locale);
  if (!market) throw new SeoProviderError("unsupported_market", `unknown market ${input.locale}`, provider.id, 0);
  const control = await loadSeoControl();
  const reason = seoBlockReason(provider, input.capability, market, control, "authorized_test");
  if (reason) throw new SeoProviderError(reason, `${provider.id}: ${reason}`, provider.id, 0);
  const request = testRequest(market)[input.capability];
  const { maxUsd } = effectiveQuote(provider.quote(input.capability, request), provider.id, input.capability, control.pricing);
  if (maxUsd === null) throw new SeoProviderError("unknown_price", `${provider.id}: the maximum price of ${input.capability} is unknown`, provider.id, 0);
  if (!(input.maxSpendUsd > 0) || input.maxSpendUsd > MAX_TEST_SPEND_USD || maxUsd > input.maxSpendUsd) {
    throw new SeoProviderError("spend_limit", `${provider.id}: this test can cost up to ${maxUsd} USD; authorized ${input.maxSpendUsd} (at most ${MAX_TEST_SPEND_USD})`, provider.id, 0);
  }
  const scope: SeoScope = { tenantId: input.tenantId, siteId: null, kind: "seo_live_test", fetchImpl: input.fetchImpl };
  const id = input.requestId ?? randomUUID();
  const { reservation } = await reserveSeoSpend({
    idempotencyKey: `live_test:${id}`, tenantId: input.tenantId, siteId: null, provider, capability: input.capability, kind: scope.kind, resource: input.capability,
    keys: [sha256(`live_test|${id}`)], quote: () => provider.quote(input.capability, request), priority: "interactive", trigger: "authorized_test",
  });
  if (!reservation) throw new SeoProviderError("duplicate_request", `${provider.id}: this test is already running`, provider.id, 0);
  const { result, fetchedAt, billedUsd } = await sendReserved(provider, input.capability, request, reservation, scope);
  const marketId = `${market.country}|${market.language}`;
  const answer = { rows: result.data.length, costUsd: billedUsd, partial: result.partial, notes: result.notes, market: marketId };
  if (!result.data.length) return answer; // answered, but proves nothing about the data
  const row = await prisma.seoProviderState.findUnique({ where: { providerId: provider.id }, select: { verifications: true } });
  const verifications = { ...((row?.verifications ?? {}) as Record<string, unknown>), [input.capability]: { at: fetchedAt.toISOString(), market: marketId, costUsd: billedUsd } };
  await recordHealth(provider, { verifications: verifications as Prisma.InputJsonObject });
  return answer;
}
