import test from "node:test";
import assert from "node:assert/strict";
import { THRESHOLDS, ctrBenchmark, detectOpportunities, pageKey, queryKey, type Draft, type Inventory, type PageTotals, type QueryRow, type SearchData } from "../src/studio/seo-intelligence/detect";
import { base } from "../src/studio/seo-intelligence/detect";
import { MIN_CONFIDENCE, combineFactors, confidenceOf, defaultSeoProfile, factor, queryIntent, resolveWeights, unknownFactor } from "../src/studio/seo-intelligence/scoring";
import { decideOpportunities, inHoldout, type DecisionContext } from "../src/studio/seo-intelligence/select";
import { buildEvaluation } from "../src/studio/seo-intelligence/attribution";
import { planSyncDays, propertyMatchesSite } from "../src/studio/search-console";

const NOW = new Date("2026-11-20T00:00:00Z");
const site = "https://example.test";
const row = (query: string, page: string, impressions: number, clicks: number, position: number, extra: Partial<QueryRow> = {}): QueryRow => ({ query, page: `${site}${page}`, device: "mobile", country: "esp", clicks, impressions, positionSum: position * impressions, days: 20, ...extra });
const totals = (clicks: number, impressions: number, position = 5, days = 25): PageTotals => ({ clicks, impressions, positionSum: position * impressions, days });
const pageMap = (entries: Record<string, PageTotals>) => new Map(Object.entries(entries).map(([path, value]) => [pageKey(`${site}${path}`), value]));
const inventory = (paths: Array<[string, string]>, extra: Partial<Inventory> = {}): Inventory[] => paths.map(([path, title]) => ({ url: `${site}${path}`, title, h1: title, modifiedAt: null, publishedAt: null, inbound: 5, ...extra }));
const data = (over: Partial<SearchData> = {}): SearchData => ({
  from: "2026-10-22", through: "2026-11-18", current: [], previousQueries: new Map(), hasPrevious: true, pages: new Map(), pagesPrevious: new Map(), pagesBefore: new Map(), hasBefore: true,
  pagesYearAgo: null, pagesYearAgoPrevious: null, pagesYearAgoNext: null, site: totals(1000, 50_000), sitePrevious: totals(1000, 50_000), ...over,
});
const detect = (search: SearchData | null, over: Partial<Parameters<typeof detectOpportunities>[0]> = {}) => detectOpportunities({ data: search, inventory: [], clusters: [], index: [], brandTokens: ["example"], now: NOW, ...over });
const kinds = (drafts: Draft[]) => drafts.map((draft) => draft.kind).sort();
/** 20 pages at position 3 with a normal 10 % click-through: the site's own reference. */
const reference = (from = 0) => Array.from({ length: 20 }, (_, index) => row(`consulta numero ${from + index}`, `/ref-${index}`, 100, 10, 3));

test("low CTR is measured against the site's own pages in the same position, device and market", () => {
  const weak = row("tema flojo", "/floja", 1_000, 20, 3);
  const found = detect(data({ current: [...reference(), weak] })).filter((draft) => draft.kind === "low_ctr");
  assert.equal(found.length, 1);
  assert.equal(found[0].action, "improve_metadata");
  assert.equal(found[0].expectedClicks, 80); // 1000 × 10 % − 20
  assert.ok(found[0].evidence.some((entry) => entry.kind === "estimated") && found[0].evidence.some((entry) => entry.kind === "observed"));
  // Same CTR at position 9 says nothing: there is no reference there.
  assert.deepEqual(kinds(detect(data({ current: [...reference(), row("tema flojo", "/floja", 1_000, 20, 9, { days: 3 })] }))).filter((kind) => kind === "low_ctr"), []);
  // Another device has its own reference, and here there is none.
  assert.equal(ctrBenchmark([...reference()])({ ...weak, device: "desktop" }), null);
  // Noise: 7 clicks of 10 expected.
  assert.equal(detect(data({ current: [...reference(), row("ruido", "/ruido", 100, 7, 3)] })).filter((draft) => draft.kind === "low_ctr").length, 0);
  // Brand searches do not count.
  assert.equal(detect(data({ current: [...reference(), row("example opiniones", "/floja", 1_000, 20, 3)] })).filter((draft) => draft.kind === "low_ctr").length, 0);
});

test("ranked queries become work on the page that ranks; commercial ones are told apart", () => {
  const found = detect(data({ current: [row("horario tren toledo", "/trenes", 400, 4, 12), row("mejores hoteles toledo", "/hoteles", 80, 1, 8), row("una sola vez", "/trenes", 400, 4, 12, { days: 2 }), row("poca cosa aqui", "/trenes", 20, 0, 12)] }));
  const byQuery = Object.fromEntries(found.filter((draft) => draft.query).map((draft) => [draft.query, [draft.kind, draft.action]]));
  assert.deepEqual(byQuery["horario tren toledo"], ["striking_distance", "expand_existing"]);
  assert.deepEqual(byQuery["mejores hoteles toledo"], ["commercial", "update_existing"]);
  assert.equal(byQuery["una sola vez"], undefined, "two days of data are not evidence");
  assert.equal(byQuery["poca cosa aqui"], undefined);
  assert.equal(found[0].expectedClicks, null, "without its own click-through at the target there is no scenario");
});

test("new long-tail queries expand the page that covers them, or propose one when none does", () => {
  const pages = inventory([["/trenes", "Horario de tren a Toledo"], ["/a", "A"], ["/b", "B"], ["/c", "C"], ["/d", "D"]]);
  const rows = [row("horario tren toledo madrid", "/trenes", 60, 1, 30), row("alquiler bicicletas toledo centro", "/trenes", 60, 1, 40)];
  const found = detect(data({ current: rows }), { inventory: pages });
  assert.deepEqual(found.map((draft) => [draft.kind, draft.action]).sort(), [["new_query", "create_content"], ["new_query", "expand_existing"]]);
  assert.equal(found.find((draft) => draft.action === "expand_existing")!.targetUrl, `${site}/trenes`);
  // A page Google or the sitemap knows by its address exists even if nobody read its title.
  const unread = inventory([["/a", ""], ["/b", ""], ["/c", ""], ["/d", ""], ["/programas/lo-sabe-no-lo-sabe", ""]]);
  const named = (query: string, page: string) => detect(data({ current: [row(query, page, 60, 1, 15)] }), { inventory: unread }).map((draft) => [draft.action, draft.targetUrl]);
  assert.deepEqual(named("lo sabe no lo sabe horario", "/otra"), [["expand_existing", `${site}/programas/lo-sabe-no-lo-sabe`]]);
  assert.deepEqual(named("el mal padre donde ver", "/peliculas/el-mal-padre"), [["expand_existing", `${site}/peliculas/el-mal-padre`]]);
  assert.deepEqual(named("plataformas para ver el mal padre gratis en streaming legal", "/streaming"), [["create_content", null]], "a one-word address does not cover a long query");
  // Words every title carries single no page out.
  const branded = inventory(["/x", "/y", "/z", "/w", "/v"].map((path) => [path, `Ficha ${path.slice(1).repeat(4)} | Guía TV`] as [string, string]));
  assert.deepEqual(detect(data({ current: [row("la guia de tv", "/x", 60, 1, 15)] }), { inventory: branded }), []);
  assert.deepEqual(detect(data({ current: [row("que echan hoy tele", "/", 60, 1, 15)] }), { inventory: inventory([["/", "Qué echan hoy en la tele"], ["/a", "A"], ["/b", "B"], ["/c", "C"], ["/d", "D"]]) }), [], "the home page already answers");
  // Seen before, or without the previous window stored: not new.
  const seen = new Map(rows.map((entry) => [`${queryKey(entry.query)}\n${pageKey(entry.page)}`, 40]));
  assert.equal(detect(data({ current: rows, previousQueries: seen }), { inventory: pages }).length, 0);
  assert.equal(detect(data({ current: rows, hasPrevious: false }), { inventory: pages }).length, 0);
  // Without an inventory nobody can say that a page is missing.
  assert.equal(detect(data({ current: rows })).length, 0);
});

test("a decline needs more than noise, more than the site's own fall, and is not last year's season", () => {
  const fall = { pagesPrevious: pageMap({ "/p": totals(200, 4_000, 4) }), pages: pageMap({ "/p": totals(80, 4_000, 8) }) };
  const [found] = detect(data(fall));
  assert.deepEqual([found.kind, found.action], ["declining", "update_existing"]);
  assert.ok(found.caveats.some((caveat) => caveat.includes("estacionalidad")));
  assert.equal(detect(data({ pagesPrevious: pageMap({ "/p": totals(60, 1_000, 4) }), pages: pageMap({ "/p": totals(45, 1_000, 4) }) })).length, 0, "noise");
  // The whole site fell as much: not this page's problem.
  assert.deepEqual(kinds(detect(data({ ...fall, site: totals(400, 20_000) }))), ["site_decline"]);
  const seasonal = detect(data({ ...fall, pagesYearAgo: pageMap({ "/p": totals(70, 3_000) }), pagesYearAgoPrevious: pageMap({ "/p": totals(180, 5_000) }) }));
  assert.deepEqual(seasonal.map((draft) => [draft.kind, draft.action]), [["seasonal_decline", "monitor"]]);
  // Fewer searches with the same position: demand, not content.
  assert.deepEqual(detect(data({ ...fall, pages: pageMap({ "/p": totals(80, 1_500, 4) }) })).map((draft) => [draft.kind, draft.action]), [["demand_decline", "monitor"]]);
  const old = inventory([["/p", "Página"]], { modifiedAt: new Date("2026-01-01") });
  assert.deepEqual(detect(data({ ...fall, pagesBefore: pageMap({ "/p": totals(300, 5_000, 4) }) }), { inventory: old }).map((draft) => draft.kind), ["content_decay"]);
});

test("cannibalization, clusters, links, seasons, growing pages and indexing", () => {
  const shared = detect(data({ current: [row("receta gazpacho", "/uno", 100, 5, 6, { days: 12 }), row("receta gazpacho", "/dos", 80, 3, 8, { days: 12 }), row("receta gazpacho", "/tres", 5, 0, 30)] })).filter((draft) => draft.kind === "cannibalization");
  assert.deepEqual(shared.map((draft) => [draft.action, draft.targetUrl, draft.relatedUrls]), [["investigate_cannibalization", `${site}/uno`, [`${site}/dos`]]]);

  const cluster = Array.from({ length: 8 }, (_, index) => row(`trenes destino ${"abcdefgh"[index]}x`, "/trenes", 50, 1, 25));
  const found = detect(data({ current: cluster }), { clusters: [{ name: "Trenes", slug: "trenes", pagesCount: 1 }, { name: "Barcos", slug: "barcos", pagesCount: 1 }] });
  assert.deepEqual(found.filter((draft) => draft.kind === "underdeveloped_cluster").map((draft) => [draft.topic, draft.action]), [["Trenes", "strengthen_cluster"]]);

  const lonely = inventory(Array.from({ length: 10 }, (_, index) => [`/p${index}`, `Página ${index}`] as [string, string]), { inbound: 0 });
  assert.ok(kinds(detect(data({ current: [row("algo concreto aqui", "/p1", 300, 3, 9)] }), { inventory: lonely })).includes("internal_linking"));
  const twice = detect(data({ current: [row("algo concreto aqui", "/p1", 300, 3, 9), row("otra cosa distinta", "/p1", 500, 5, 9)] }), { inventory: lonely }).filter((entry) => entry.kind === "internal_linking");
  assert.deepEqual(twice.map((entry) => entry.query), ["otra cosa distinta"], "one page is one piece of work, whatever the queries");

  const growing = (path: string) => {
    const before = new Map(Array.from({ length: 5 }, (_, index) => [`${queryKey(`tema viejo ${index}`)}\n${pageKey(`${site}${path}`)}`, 10] as [string, number]));
    const current = Array.from({ length: 20 }, (_, index) => row(`tema crece ${index}`, path, 10, 0, 30));
    return kinds(detect(data({ current, previousQueries: before, pages: pageMap({ [path]: totals(0, 200, 30) }) })));
  };
  assert.deepEqual(growing("/lista"), ["expanding_relevance"]);
  assert.deepEqual(growing("/"), [], "the home page is not made longer");

  assert.ok(!kinds(detect(data({ current: [row("algo concreto aqui", "/p1", 300, 3, 9)] }), { inventory: lonely.map((page) => ({ ...page, inbound: null })) })).includes("internal_linking"), "unknown links are not missing links");

  const season = detect(data({ pages: pageMap({ "/navidad": totals(20, 800) }), pagesYearAgo: pageMap({ "/navidad": totals(20, 700) }), pagesYearAgoNext: pageMap({ "/navidad": totals(200, 5_000) }) }));
  assert.deepEqual(season.map((draft) => [draft.kind, draft.action, draft.expectedClicks]), [["seasonal", "update_existing", 180]]);

  const before = new Map(Array.from({ length: 6 }, (_, index) => [`q${index}\n${pageKey(`${site}/guia`)}`, 10]));
  const wide = Array.from({ length: 18 }, (_, index) => row(`variante ${"abcdefghijklmnopqr"[index]}z`, "/guia", 10, 0, 30, { days: 3 }));
  assert.deepEqual(kinds(detect(data({ current: wide, previousQueries: before, pages: pageMap({ "/guia": totals(10, 900) }) }))), ["expanding_relevance"]);

  const state = { url: `${site}/x`, verdict: "FAIL", coverageState: "Excluida por noindex", indexingState: "BLOCKED_BY_META_TAG", robotsState: "ALLOWED", fetchState: "SUCCESSFUL", googleCanonical: null, userCanonical: null, inspectedAt: NOW };
  assert.deepEqual(detect(null, { index: [state, { ...state, url: `${site}/ok`, verdict: "PASS", coverageState: null, indexingState: "INDEXING_ALLOWED" }] }).map((draft) => [draft.kind, draft.action]), [["index_problem", "resolve_technical"]]);
  assert.ok(THRESHOLDS.perKind >= 1);
});

test("unknown factors leave the score alone and lower the coverage", () => {
  const weights = resolveWeights("publisher");
  const full = combineFactors({ businessRelevance: factor(0.8, "estimated", ""), searchDemand: factor(0.8, "observed", ""), rankingFeasibility: factor(0.8, "estimated", ""), expectedValue: factor(0.8, "estimated", "") }, weights);
  const less = combineFactors({ businessRelevance: factor(0.8, "estimated", ""), searchDemand: factor(0.8, "observed", ""), rankingFeasibility: factor(0.8, "estimated", ""), expectedValue: unknownFactor("") }, weights);
  assert.deepEqual([full.score, less.score], [80, 80]);
  assert.ok(less.coverage < full.coverage);
  assert.equal(combineFactors({ businessRelevance: factor(1, "estimated", "") }, weights).score, null, "too little known to score");
  assert.equal(unknownFactor("x").value, null);
  const strong = confidenceOf({ coverage: 0.7, impressions: 3_000, days: 28, dataAgeDays: 3, observed: true });
  assert.ok(strong.score > confidenceOf({ coverage: 0.7, impressions: 40, days: 3, dataAgeDays: 3, observed: true }).score);
  assert.ok(strong.score > confidenceOf({ coverage: 0.7, impressions: 3_000, days: 28, dataAgeDays: 45, observed: true }).score, "old data");
  assert.deepEqual([queryIntent("comprar zapatillas"), queryIntent("mejores zapatillas"), queryIntent("cómo limpiar zapatillas"), queryIntent("zapatillas rojas")], ["transactional", "commercial", "informational", null]);
  assert.deepEqual([defaultSeoProfile("generic_rest", "online-shop"), defaultSeoProfile("guiatv", "tv-programming-guide")], ["ecommerce", "publisher"]);
  assert.equal(resolveWeights("custom", { conversionPotential: 3, searchDemand: 99, nonsense: 1 }).searchDemand, 1);
});

const context = (over: Partial<DecisionContext> = {}): DecisionContext => ({
  profile: "publisher", weights: resolveWeights("publisher"), priorityTopics: [], reachableDifficulty: 30, relevance: () => ({ score: 80, offTopic: false }), cannibalization: () => "none", clusters: [], plannedQueries: [],
  touched: new Map(), dataAgeDays: 3, holdoutPercent: 0, now: NOW, ...over,
});
const draft = (over: Partial<Draft> & Pick<Draft, "kind" | "action">): Draft => base({ topic: over.query ?? "tema", why: "porque", actionReason: "razón", evidence: [], dedupeKey: `seo:${over.kind}:${over.query ?? ""}:${over.targetUrl ?? ""}`, impressions: 1_500, clicks: 30, position: 8, days: 25, intent: "informational", ...over });

test("safeguards: one action per page, no work on a contested query, cooldown, duplicates and evidence", () => {
  const url = `${site}/p`;
  const decide = (drafts: Draft[], over: Partial<DecisionContext> = {}) => decideOpportunities(drafts, context(over)).map((decision) => [decision.action, decision.status, decision.explanation.safeguards[0]?.code ?? null]);
  assert.deepEqual(decide([draft({ kind: "striking_distance", action: "update_existing", query: "a uno", targetUrl: url }), draft({ kind: "low_ctr", action: "improve_metadata", targetUrl: `${url}/` })]).map((entry) => entry[1]).sort(), ["deferred", "open"]);
  assert.deepEqual(decide([draft({ kind: "low_ctr", action: "improve_metadata", targetUrl: url }), draft({ kind: "index_problem", action: "resolve_technical", targetUrl: url, impressions: null, clicks: null, position: null })]), [["defer", "deferred", "conflict"], ["resolve_technical", "open", null]]);
  assert.deepEqual(decide([draft({ kind: "new_query", action: "create_content", query: "receta gazpacho" }), draft({ kind: "cannibalization", action: "investigate_cannibalization", query: "receta gazpacho", targetUrl: url })]), [["defer", "deferred", "cannibalization_open"], ["investigate_cannibalization", "open", null]]);
  assert.deepEqual(decide([draft({ kind: "low_ctr", action: "improve_metadata", targetUrl: url })], { touched: new Map([[pageKey(url), new Date("2026-11-10")]]) }), [["monitor", "monitoring", "cooldown"]]);
  assert.deepEqual(decide([draft({ kind: "new_query", action: "create_content", query: "receta gazpacho" })], { plannedQueries: ["receta de gazpacho"] }), [["reject", "rejected", "already_planned"]]);
  assert.deepEqual(decide([draft({ kind: "new_query", action: "create_content", query: "receta gazpacho" })], { cannibalization: () => "high" }), [["defer", "deferred", "cannibalization_risk"]]);
  assert.deepEqual(decide([draft({ kind: "new_query", action: "create_content", query: "fuera" })], { relevance: () => ({ score: 5, offTopic: true }) }), [["reject", "rejected", "off_topic"]]);
  assert.deepEqual(decide([draft({ kind: "new_query", action: "create_content", query: "lejos" })], { relevance: () => ({ score: 20, offTopic: false }) }), [["reject", "rejected", "low_relevance"]]);
  assert.equal(decide([draft({ kind: "new_query", action: "create_content", query: "sin perfil" })], { relevance: () => null })[0][1], "open", "unknown relevance is not irrelevance");
  assert.deepEqual(decide([draft({ kind: "new_query", action: "create_content", query: "poco", impressions: 4, days: 1, position: null, clicks: null, intent: null, caveats: ["a", "b", "c"] })]), [["defer", "deferred", "insufficient_evidence"]]);
  assert.deepEqual(decide([draft({ kind: "low_ctr", action: "improve_metadata", targetUrl: url })], { holdoutPercent: 100 }), [["monitor", "monitoring", "holdout"]]);
  assert.equal(inHoldout("x", 0), false);
  const twice = [draft({ kind: "new_query", action: "create_content", query: "receta gazpacho" }), draft({ kind: "uncovered_query", action: "create_content", query: "receta de gazpacho" })];
  assert.deepEqual(decide(twice).map((entry) => entry[1]).sort(), ["open", "rejected"]);
  assert.deepEqual(decide(twice), decide(twice), "deterministic");
});

test("every decision explains itself and tells what was observed from what was estimated", () => {
  const [decision] = decideOpportunities([draft({ kind: "striking_distance", action: "update_existing", query: "a uno", targetUrl: `${site}/p`, expectedClicks: 12, expectedScenario: "si llegara a 5", risks: ["puede empeorar"], evidence: [{ metric: "Clics", value: 30, kind: "observed", source: "search_console" }] })], context());
  const { explanation } = decision;
  assert.equal(explanation.why, "porque");
  assert.equal(explanation.action.reason, "razón");
  assert.equal(explanation.externalData.required, false);
  assert.equal(explanation.effort, "medium");
  assert.ok(explanation.confidence.value >= MIN_CONFIDENCE && explanation.confidence.reasons.length >= 2);
  assert.deepEqual(explanation.risks, ["puede empeorar"]);
  assert.deepEqual([explanation.expected.kind, explanation.expected.clicks28d], ["estimated", 12]);
  const kindsOf = Object.fromEntries(explanation.factors.map((entry) => [entry.key, entry.kind]));
  assert.deepEqual([kindsOf.searchDemand, kindsOf.rankingFeasibility, kindsOf.seasonality], ["observed", "estimated", "unknown"]);
  assert.equal(explanation.factors.find((entry) => entry.key === "seasonality")!.value, null);
  assert.match(explanation.score.note, /no es una probabilidad/);
  // A business that sells values the same opportunity differently.
  const commercial = draft({ kind: "commercial", action: "update_existing", query: "comprar x", targetUrl: `${site}/p`, intent: "transactional" });
  const score = (profile: "publisher" | "ecommerce") => decideOpportunities([commercial], context({ profile, weights: resolveWeights(profile) }))[0].score!;
  assert.ok(score("ecommerce") > score("publisher"));
});

test("evaluations compare with what was not touched and never claim a cause", () => {
  const ranges = { preFrom: "2026-01-01", preTo: "2026-01-28", postFrom: "2026-01-30", postTo: "2026-02-26" };
  const site2 = { pre: totals(1_000, 10_000), post: totals(1_100, 11_000) };
  const up = buildEvaluation({ window: 28, ranges, pre: totals(100, 2_000), post: totals(220, 3_000), site: site2, cohort: { pages: 12, medianClicksRatio: 1.1, kind: "untouched" }, yearAgo: null });
  assert.deepEqual([up.outcome, up.causal, up.conversions.status], ["higher", false, "unavailable"]);
  assert.ok(up.uncertainty.some((line) => line.includes("no demuestra")));
  // It doubled, but so did every page nobody touched.
  assert.equal(buildEvaluation({ window: 56, ranges, pre: totals(100, 2_000), post: totals(205, 3_000), site: site2, cohort: { pages: 12, medianClicksRatio: 2, kind: "holdout" }, yearAgo: null }).outcome, "no_clear_change");
  assert.equal(buildEvaluation({ window: 28, ranges, pre: totals(3, 90), post: totals(9, 120), site: site2, cohort: null, yearAgo: null }).outcome, "insufficient_data");
});

test("synchronization asks each day once, newest first, then forward, then back", () => {
  const dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
  assert.deepEqual(planSyncDays(dates, { from: null, through: null }, 2), { days: ["2026-11-04", "2026-11-03"], backfillComplete: false });
  assert.deepEqual(planSyncDays([...dates, "2026-11-05"], { from: "2026-11-03", through: "2026-11-04" }, 2), { days: ["2026-11-05", "2026-11-02"], backfillComplete: false });
  assert.deepEqual(planSyncDays(dates, { from: "2026-11-02", through: "2026-11-04" }, 5), { days: ["2026-11-01"], backfillComplete: true });
  assert.deepEqual(planSyncDays(dates, { from: "2026-11-01", through: "2026-11-04" }, 5), { days: [], backfillComplete: true });
});

test("a site may only read the property of its own domain", () => {
  assert.equal(propertyMatchesSite("sc-domain:example.com", "https://www.example.com"), true);
  assert.equal(propertyMatchesSite("sc-domain:example.com", "https://blog.example.com/x"), true);
  assert.equal(propertyMatchesSite("https://www.example.com/", "https://example.com"), true);
  assert.equal(propertyMatchesSite("sc-domain:ample.com", "https://example.com"), false);
  assert.equal(propertyMatchesSite("https://other.com/", "https://example.com"), false);
  assert.equal(propertyMatchesSite("sc-domain:example.com", null), false);
});
