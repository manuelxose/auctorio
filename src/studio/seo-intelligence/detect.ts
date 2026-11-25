// Opportunities hidden in a site's own data. Pure: rows in, drafts out. Every rule has a minimum of evidence,
// and ordinary noise or a seasonal dip is not a content problem.

import { isKeywordVariant, keywordTokens } from "../keyword-candidates";
import { queryIntent, type DataKind, type SeoAction } from "./scoring";

/** One query on one page, aggregated over a window. `days` = days with data. */
export type QueryRow = { query: string; page: string; device: string; country: string; clicks: number; impressions: number; positionSum: number; days: number };
export type PageTotals = { clicks: number; impressions: number; positionSum: number; days: number };
export type Inventory = { url: string; title: string; h1: string; modifiedAt: Date | null; publishedAt: Date | null; /** null: the links of most of the site were not read. */ inbound: number | null };
export type IndexState = { url: string; verdict: string | null; coverageState: string | null; indexingState: string | null; robotsState: string | null; fetchState: string | null; googleCanonical: string | null; userCanonical: string | null; inspectedAt: Date };

/** 28-day windows that end on the last stored day; the year-ago ones are shifted 364 days to keep weekdays. */
export type SearchData = {
  from: string;
  through: string;
  current: QueryRow[];
  /** key = queryKey(query) + "\n" + pageKey */
  previousQueries: Map<string, number>;
  /** Whether the previous window was stored at all: without it nothing can be called new. */
  hasPrevious: boolean;
  pages: Map<string, PageTotals>;
  pagesPrevious: Map<string, PageTotals>;
  pagesBefore: Map<string, PageTotals>;
  hasBefore: boolean;
  /** null: not enough history. */
  pagesYearAgo: Map<string, PageTotals> | null;
  pagesYearAgoPrevious: Map<string, PageTotals> | null;
  /** The 28 days that followed the same window last year. */
  pagesYearAgoNext: Map<string, PageTotals> | null;
  site: PageTotals;
  sitePrevious: PageTotals;
};

export type Evidence = { metric: string; value: number | string | null; kind: DataKind; source: "search_console" | "crawl" | "url_inspection" | "competitors" | "provider"; period?: string; note?: string };
export type Draft = {
  source: "search_console" | "crawl" | "competitor" | "provider" | "research";
  kind: string;
  topic: string;
  query: string | null;
  targetUrl: string | null;
  relatedUrls: string[];
  action: SeoAction;
  why: string;
  actionReason: string;
  evidence: Evidence[];
  risks: string[];
  caveats: string[];
  /** Observed over the current window; null = no first-party figures. */
  impressions: number | null;
  clicks: number | null;
  position: number | null;
  days: number | null;
  /** Extra clicks in 28 days under a stated scenario. An estimate. */
  expectedClicks: number | null;
  expectedScenario: string | null;
  intent: string | null;
  seasonalLift: number | null;
  clusterPages: number | null;
  competitorPages: number | null;
  /** Figures a provider reported; null when nobody measured them. */
  volume: number | null;
  difficulty: number | null;
  dedupeKey: string;
};

export const THRESHOLDS = {
  ctrImpressions: 200, ctrBenchmarkImpressions: 1000, ctrBenchmarkRows: 10, ctrRatio: 0.6, ctrZ: -2.6,
  strikingImpressions: 100, strikingDays: 10, strikingFrom: 4, strikingTo: 20,
  newImpressions: 30, newDays: 5, newWords: 3,
  uncoveredImpressions: 100, uncoveredDays: 10,
  expandQueries: 10, expandRatio: 1.5,
  declineClicks: 50, declineRatio: 0.7, declineZ: -3,
  decayStep: 0.85, decayAgeDays: 180,
  cannibalImpressions: 100, cannibalShare: 0.2, cannibalDays: 7,
  clusterImpressions: 300, clusterQueries: 8, clusterPages: 2,
  linkImpressions: 200, linkInbound: 1, linkInventory: 10,
  commercialImpressions: 50,
  seasonalImpressions: 300, seasonalLift: 2,
  perKind: 25, minInventory: 5, sharedTitle: 3,
} as const;

const DAY_MS = 86_400_000;
export const queryKey = (query: string) => keywordTokens(query).join(" ");
export function pageKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return url;
  }
}
const isHome = (url: string) => !pageKey(url).includes("/");
/** Words of the last part of the address; none for the home page. */
function slugTokens(url: string): string[] {
  try {
    const last = new URL(url).pathname.replace(/\/+$/, "").split("/").pop() ?? "";
    return [...new Set(keywordTokens(decodeURIComponent(last).replace(/\.\w+$/, "")))];
  } catch {
    return [];
  }
}
const average = (row: { positionSum: number; impressions: number }) => (row.impressions ? row.positionSum / row.impressions : null);
const pct = (value: number) => `${Math.round(value * 1000) / 10} %`;
const pos = (value: number | null) => (value === null ? "sin dato" : String(Math.round(value * 10) / 10));

type Group = PageTotals & { query: string; page: string };
function group(rows: QueryRow[], key: (row: QueryRow) => string): Map<string, Group> {
  const out = new Map<string, Group>();
  for (const row of rows) {
    const id = key(row);
    const at = out.get(id);
    if (!at) out.set(id, { query: row.query, page: row.page, clicks: row.clicks, impressions: row.impressions, positionSum: row.positionSum, days: row.days });
    else {
      at.clicks += row.clicks;
      at.impressions += row.impressions;
      at.positionSum += row.positionSum;
      at.days = Math.max(at.days, row.days);
    }
  }
  return out;
}

/**
 * The site's own click-through by position, device, intent and market, falling back to a coarser level when the
 * finer one has too little data. null = not enough data anywhere: no comparison is made.
 */
export function ctrBenchmark(rows: QueryRow[]): (row: QueryRow) => { ctr: number; level: string } | null {
  const levels: Array<{ name: string; key: (row: QueryRow) => string }> = [
    { name: "posición, dispositivo, intención y mercado", key: (row) => `${bucket(row)}|${row.device}|${queryIntent(row.query) ?? "?"}|${row.country}` },
    { name: "posición, dispositivo e intención", key: (row) => `${bucket(row)}|${row.device}|${queryIntent(row.query) ?? "?"}` },
    { name: "posición y dispositivo", key: (row) => `${bucket(row)}|${row.device}` },
  ];
  type Cell = { clicks: number; impressions: number; rows: number };
  const add = (map: Map<string, Cell>, key: string, row: QueryRow) => {
    const cell = map.get(key) ?? { clicks: 0, impressions: 0, rows: 0 };
    map.set(key, { clicks: cell.clicks + row.clicks, impressions: cell.impressions + row.impressions, rows: cell.rows + 1 });
  };
  const all = levels.map(() => new Map<string, Cell>());
  const own = levels.map(() => new Map<string, Cell>());
  for (const row of rows) levels.forEach((level, index) => {
    add(all[index], level.key(row), row);
    add(own[index], `${level.key(row)}\n${pageKey(row.page)}`, row);
  });
  return (row) => {
    for (const [index, level] of levels.entries()) {
      const key = level.key(row);
      const total = all[index].get(key);
      const mine = own[index].get(`${key}\n${pageKey(row.page)}`);
      if (!total) continue;
      // The page is compared with the others, never with itself.
      const impressions = total.impressions - (mine?.impressions ?? 0);
      if (impressions < THRESHOLDS.ctrBenchmarkImpressions || total.rows - (mine?.rows ?? 0) < THRESHOLDS.ctrBenchmarkRows) continue;
      return { ctr: (total.clicks - (mine?.clicks ?? 0)) / impressions, level: level.name };
    }
    return null;
  };
}
const bucket = (row: QueryRow) => Math.max(1, Math.min(21, Math.round(average(row) ?? 99)));

/** Poisson comparison of two counts, the earlier one scaled by what the whole site did. */
export const changeZ = (current: number, previous: number, scale: number): number => {
  const expected = previous * scale;
  const variance = current + previous * scale * scale;
  return variance > 0 ? (current - expected) / Math.sqrt(variance) : 0;
};

export function detectOpportunities(input: {
  data: SearchData | null;
  inventory: Inventory[];
  clusters: Array<{ name: string; slug: string; pagesCount: number }>;
  index: IndexState[];
  brandTokens: string[];
  priorityTopics?: string[];
  now?: Date;
}): Draft[] {
  const drafts = [...indexDrafts(input.index, input.inventory)];
  if (input.data) drafts.push(...searchDrafts({ ...input, data: input.data }));
  const counts = new Map<string, number>();
  const keys = new Set<string>();
  // The biggest of each kind: a list nobody can read is not a decision.
  return drafts
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .filter((draft) => {
      // Two queries of a page can raise the same work; the key is stored with 500 characters and is unique.
      const key = draft.dedupeKey.slice(0, 500);
      if (keys.has(key)) return false;
      keys.add(key);
      const seen = (counts.get(draft.kind) ?? 0) + 1;
      counts.set(draft.kind, seen);
      return seen <= THRESHOLDS.perKind;
    });
}

function indexDrafts(states: IndexState[], inventory: Inventory[]): Draft[] {
  const known = new Map(inventory.map((page) => [pageKey(page.url), page]));
  const drafts: Draft[] = [];
  for (const state of states) {
    const problem =
      state.robotsState === "DISALLOWED" ? "robots.txt impide rastrearla"
      : state.indexingState && state.indexingState !== "INDEXING_ALLOWED" && state.indexingState !== "INDEXING_STATE_UNSPECIFIED" ? `la indexación está bloqueada (${state.indexingState})`
      : state.fetchState && !["SUCCESSFUL", "PAGE_FETCH_STATE_UNSPECIFIED"].includes(state.fetchState) ? `Google no pudo leerla (${state.fetchState})`
      : state.verdict === "FAIL" ? `no está indexada (${state.coverageState ?? "sin detalle"})`
      : null;
    if (!problem) continue;
    const page = known.get(pageKey(state.url));
    drafts.push(base({
      source: "crawl", kind: "index_problem", topic: page?.title || state.url, query: null, targetUrl: state.url, action: "resolve_technical",
      why: `Google informa de que ${problem}. Mientras siga así, mejorar el texto no cambia nada.`,
      actionReason: "Un problema de rastreo o indexación va antes que cualquier cambio de contenido.",
      evidence: [
        { metric: "Veredicto de indexación", value: state.verdict, kind: "observed", source: "url_inspection", period: state.inspectedAt.toISOString().slice(0, 10) },
        { metric: "Cobertura", value: state.coverageState, kind: "observed", source: "url_inspection" },
      ],
      risks: ["El bloqueo puede ser intencionado: compruébalo antes de quitarlo."],
      dedupeKey: `seo:index_problem:${pageKey(state.url)}`,
    }));
  }
  return drafts;
}

export const base = (draft: Partial<Draft> & Pick<Draft, "kind" | "topic" | "action" | "why" | "actionReason" | "evidence" | "dedupeKey">): Draft => ({
  source: "search_console", query: null, targetUrl: null, relatedUrls: [], risks: [], caveats: [], impressions: null, clicks: null, position: null, days: null,
  expectedClicks: null, expectedScenario: null, intent: null, seasonalLift: null, clusterPages: null, competitorPages: null, volume: null, difficulty: null, ...draft,
});

function searchDrafts(input: Parameters<typeof detectOpportunities>[0] & { data: SearchData }): Draft[] {
  const { data, inventory } = input;
  const now = input.now ?? new Date();
  const period = `${data.from} – ${data.through}`;
  const T = THRESHOLDS;
  const drafts: Draft[] = [];
  const brand = new Set(input.brandTokens.map((token) => token.toLowerCase()));
  const isBrand = (query: string) => {
    const tokens = keywordTokens(query);
    return tokens.some((token) => brand.has(token)) || brand.has(tokens.join(""));
  };
  const rows = data.current.filter((row) => !isBrand(row.query));
  const known = new Map(inventory.map((page) => [pageKey(page.url), page]));
  const titleOf = (url: string) => known.get(pageKey(url))?.title || url;
  const benchmark = ctrBenchmark(rows);
  const byQueryPage = group(rows, (row) => `${queryKey(row.query)}\n${pageKey(row.page)}`);
  const byQuery = group(rows, (row) => queryKey(row.query));
  const inventoryTokens = inventory.map((page) => ({ page, tokens: new Set(keywordTokens(`${page.title} ${page.h1}`)), slug: slugTokens(page.url) }));
  const shownFor = new Map<string, Map<string, string>>();
  for (const row of byQueryPage.values()) {
    const key = queryKey(row.query);
    shownFor.set(key, (shownFor.get(key) ?? new Map<string, string>()).set(pageKey(row.page), row.page));
  }
  /**
   * The page written for this query. Its address names it, even if the page was never read; otherwise its title or H1
   * carries 70 % of the words. Words that many titles share ("guía", "tv") single no page out: "several".
   */
  const dedicated = (query: string): string | "several" | null => {
    const words = [...new Set(keywordTokens(query))];
    if (!words.length) return null;
    const names = (slug: string[], least: number) => slug.length >= least && slug.length >= words.length / 3 && slug.every((word) => words.includes(word));
    const candidates = [...(shownFor.get(queryKey(query)) ?? new Map<string, string>()).values()].map((url) => ({ url, slug: slugTokens(url), least: 1 }));
    // A one-word address is too little unless Google already shows that page for the query.
    for (const { page, slug } of inventoryTokens) candidates.push({ url: page.url, slug, least: 2 });
    const named = candidates.filter((entry) => names(entry.slug, entry.least)).sort((a, b) => b.slug.length - a.slug.length)[0];
    if (named) return named.url;
    let best = 0;
    let found: Inventory[] = [];
    for (const { page, tokens } of inventoryTokens) {
      const share = words.filter((word) => tokens.has(word)).length / words.length;
      if (share < 0.7 || share < best) continue;
      found = share > best ? [page] : [...found, page];
      best = share;
    }
    return found.length === 0 ? null : found.length < T.sharedTitle ? found[0].url : "several";
  };
  const observed = (row: PageTotals, extra: Evidence[] = []): Evidence[] => [
    { metric: "Impresiones", value: row.impressions, kind: "observed", source: "search_console", period, note: "Visibilidad propia, no volumen de mercado." },
    { metric: "Clics", value: row.clicks, kind: "observed", source: "search_console", period },
    { metric: "CTR", value: row.impressions ? pct(row.clicks / row.impressions) : null, kind: "observed", source: "search_console", period },
    { metric: "Posición media", value: pos(average(row)), kind: "observed", source: "search_console", period, note: "Media del periodo, no un puesto en vivo." },
    ...extra,
  ];
  const figures = (row: PageTotals) => ({ impressions: row.impressions, clicks: row.clicks, position: average(row), days: row.days });
  const partial = "Search Console oculta las consultas poco frecuentes: el detalle por consulta es incompleto.";
  /** Extra clicks if the query reached that position, with the site's own click-through there. */
  const atPosition = (target: number, query: string, page: string, row: PageTotals): number | null => {
    const parts = rows.filter((entry) => queryKey(entry.query) === queryKey(query) && pageKey(entry.page) === pageKey(page));
    let expected = 0;
    for (const part of parts) {
      const there = benchmark({ ...part, positionSum: target * part.impressions });
      if (!there) return null;
      expected += part.impressions * there.ctr;
    }
    return Math.max(0, Math.round(expected - row.clicks));
  };

  // 1. Pages with impressions and fewer clicks than the site's other pages get in the same positions.
  const rowsByPage = new Map<string, QueryRow[]>();
  for (const row of rows) {
    const key = pageKey(row.page);
    const list = rowsByPage.get(key);
    if (list) list.push(row);
    else rowsByPage.set(key, [row]);
  }
  for (const [key, page] of group(rows, (row) => pageKey(row.page))) {
    let expected = 0;
    let variance = 0;
    let clicks = 0;
    let impressions = 0;
    const levels = new Set<string>();
    for (const row of rowsByPage.get(key) ?? []) {
      if ((average(row) ?? 99) > 20) continue;
      const reference = benchmark(row);
      if (!reference) continue;
      expected += row.impressions * reference.ctr;
      variance += row.impressions * reference.ctr * (1 - reference.ctr);
      clicks += row.clicks;
      impressions += row.impressions;
      levels.add(reference.level);
    }
    if (impressions < T.ctrImpressions || expected <= 0 || clicks >= expected * T.ctrRatio) continue;
    if ((clicks - expected) / Math.sqrt(variance) > T.ctrZ) continue;
    drafts.push(base({
      kind: "low_ctr", topic: titleOf(page.page), targetUrl: page.page, action: "improve_metadata", intent: null, ...figures(page),
      expectedClicks: Math.round(expected - clicks), expectedScenario: "si consiguiera el CTR de tus otras páginas en las mismas posiciones",
      why: `Recibe ${clicks} clics en ${impressions} impresiones comparables; tus otras páginas habrían conseguido unos ${Math.round(expected)}.`,
      actionReason: "La página ya aparece: el título y la descripción son lo que se ve antes del clic, y cambiarlos cuesta poco.",
      evidence: observed(page, [{ metric: "Clics de referencia", value: Math.round(expected), kind: "estimated", source: "search_console", period, note: `Con el CTR propio por ${[...levels].join("; ")}.` }]),
      risks: ["Puede deberse a elementos del resultado (anuncios, mapas, respuestas directas) y no al título."],
      caveats: [partial], dedupeKey: `seo:low_ctr:${key}`,
    }));
  }

  // 2. Queries close enough to climb. Commercial ones are reported as such.
  for (const row of byQueryPage.values()) {
    const position = average(row) ?? 99;
    const intent = queryIntent(row.query);
    const commercial = intent === "commercial" || intent === "transactional";
    if (row.impressions < (commercial ? T.commercialImpressions : T.strikingImpressions) || row.days < T.strikingDays || position < T.strikingFrom || position > T.strikingTo) continue;
    const page = known.get(pageKey(row.page));
    const target = position > 6 ? 5 : 3;
    const expectedClicks = atPosition(target, row.query, row.page, row);
    const kind = commercial ? "commercial" : "striking_distance";
    drafts.push(base({
      kind, topic: row.query, query: row.query, targetUrl: row.page, action: position <= 10 ? "update_existing" : "expand_existing", intent, ...figures(row),
      expectedClicks, expectedScenario: expectedClicks === null ? null : `si su posición media llegara a ${target}, con tu propio CTR en esa posición`,
      why: `«${row.query}» aparece con posición media ${pos(position)}: la página ya es candidata y tiene recorrido${commercial ? ", y la consulta expresa intención de compra" : ""}.`,
      actionReason: position <= 10 ? "Ya está en primera página: mejorar lo que hay rinde más que escribir otra." : "Le falta profundidad para competir: ampliar la página evita crear una segunda que compita con ella.",
      evidence: observed(row, intent ? [{ metric: "Intención", value: intent, kind: "estimated", source: "search_console", note: "Deducida de las palabras de la consulta." }] : []),
      risks: ["Cambiar una página que ya posiciona puede empeorarla: conserva lo que responde a la consulta actual."],
      caveats: [partial], dedupeKey: `seo:${kind}:${queryKey(row.query)}:${pageKey(row.page)}`,
    }));
    // 9. The same page with hardly any internal links pointing at it.
    if (page && page.inbound !== null && page.inbound <= T.linkInbound && inventory.length >= T.linkInventory && row.impressions >= T.linkImpressions) {
      drafts.push(base({
        kind: "internal_linking", topic: titleOf(row.page), query: row.query, targetUrl: row.page, action: "improve_internal_linking", intent, ...figures(row),
        why: `La página recibe ${page.inbound} enlace(s) internos desde las páginas leídas del sitio y compite por «${row.query}» con posición media ${pos(position)}.`,
        actionReason: "Enlazarla desde páginas relacionadas es reversible y no toca su contenido.",
        evidence: observed(row, [{ metric: "Enlaces internos recibidos", value: page.inbound, kind: "observed", source: "crawl" }]),
        risks: ["El rastreo puede no haber visto todas las páginas."], caveats: [partial], dedupeKey: `seo:internal_linking:${pageKey(row.page)}`,
      }));
    }
  }

  // 3. Queries that did not exist for the site a month ago, and queries it appears for without a page of their own.
  const previousByQuery = new Map<string, number>();
  for (const [id, impressions] of data.previousQueries) previousByQuery.set(id.split("\n")[0], (previousByQuery.get(id.split("\n")[0]) ?? 0) + impressions);
  if (inventory.length >= T.minInventory) {
    const picked: string[] = [];
    for (const row of [...byQuery.values()].sort((a, b) => b.impressions - a.impressions)) {
      const key = queryKey(row.query);
      const previous = previousByQuery.get(key) ?? 0;
      const fresh = data.hasPrevious && previous === 0 && row.impressions >= T.newImpressions && row.days >= T.newDays && row.query.trim().split(/\s+/).length >= T.newWords;
      if (row.impressions < T.newImpressions) continue;
      const page = dedicated(row.query);
      // Many pages share those words, or the home page answers: nothing is missing and there is no page to expand.
      if (page === "several" || (page && isHome(page))) continue;
      const uncovered = !page && row.impressions >= T.uncoveredImpressions && row.days >= T.uncoveredDays && (average(row) ?? 0) > 10;
      if ((!fresh && !uncovered) || picked.some((other) => isKeywordVariant(other, row.query))) continue;
      picked.push(row.query);
      const kind = fresh ? "new_query" : "uncovered_query";
      const intent = queryIntent(row.query);
      const create = !page;
      drafts.push(base({
        kind, topic: row.query, query: row.query, targetUrl: page, relatedUrls: page ? [] : [row.page], action: create ? "create_content" : "expand_existing", intent, ...figures(row),
        why: fresh
          ? `«${row.query}» empezó a mostrar tu sitio en este periodo${create ? " y ninguna página conocida trata exactamente eso" : ""}.`
          : `Tu sitio aparece para «${row.query}» con posición media ${pos(average(row))}, y ninguna página conocida está dedicada a ello.`,
        actionReason: create ? "No hay página dedicada: la que aparece responde a otra cosa." : "Ya hay una página sobre el tema: ampliarla evita duplicarlo.",
        evidence: observed(row, data.hasPrevious ? [{ metric: "Impresiones en los 28 días anteriores", value: previous, kind: "observed", source: "search_console" }] : []),
        risks: create ? ["Si la página que ya aparece es la adecuada, crear otra dividiría la relevancia."] : [],
        caveats: [partial], dedupeKey: `seo:${kind}:${key}`,
      }));
    }
  }

  // 4. Pages that show up for clearly more queries than before.
  if (data.hasPrevious) {
    const before = new Map<string, number>();
    for (const id of data.previousQueries.keys()) before.set(id.split("\n")[1], (before.get(id.split("\n")[1]) ?? 0) + 1);
    const after = new Map<string, Group[]>();
    for (const row of byQueryPage.values()) after.set(pageKey(row.page), [...(after.get(pageKey(row.page)) ?? []), row]);
    for (const [key, queries] of after) {
      // The home page answers for the whole site: growing queries there do not ask for a longer home page.
      if (isHome(queries[0].page)) continue;
      const was = before.get(key) ?? 0;
      if (was < 5 || queries.length - was < T.expandQueries || queries.length < was * T.expandRatio) continue;
      const totals = data.pages.get(key);
      if (!totals) continue;
      const url = queries[0].page;
      drafts.push(base({
        kind: "expanding_relevance", topic: titleOf(url), targetUrl: url, action: "expand_existing", ...figures(totals),
        why: `La página aparece para ${queries.length} consultas distintas; en los 28 días anteriores eran ${was}.`,
        actionReason: "Google la está probando en más búsquedas: cubrirlas en la misma página aprovecha ese impulso.",
        evidence: observed(totals, [{ metric: "Consultas distintas", value: queries.length, kind: "observed", source: "search_console", period }, { metric: "Consultas distintas antes", value: was, kind: "observed", source: "search_console" }]),
        caveats: [partial], dedupeKey: `seo:expanding_relevance:${key}`,
      }));
    }

    // 5 and 6. Falls beyond noise, beyond what the whole site did and beyond last year's season.
    const scale = data.sitePrevious.clicks > 0 ? data.site.clicks / data.sitePrevious.clicks : 1;
    if (data.sitePrevious.clicks >= T.declineClicks && scale < T.declineRatio && changeZ(data.site.clicks, data.sitePrevious.clicks, 1) < T.declineZ) {
      drafts.push(base({
        kind: "site_decline", topic: "Todo el sitio", action: "monitor", ...figures(data.site),
        why: `El sitio entero pasó de ${data.sitePrevious.clicks} a ${data.site.clicks} clics entre periodos de 28 días.`,
        actionReason: "Una caída general apunta a algo común (técnico, demanda o un cambio de Google): reescribir páginas sueltas no lo resuelve.",
        evidence: observed(data.site, [{ metric: "Clics en los 28 días anteriores", value: data.sitePrevious.clicks, kind: "observed", source: "search_console" }]),
        caveats: ["No se conoce la causa."], dedupeKey: "seo:site_decline",
      }));
    }
    for (const [key, previous] of data.pagesPrevious) {
      const current = data.pages.get(key) ?? { clicks: 0, impressions: 0, positionSum: 0, days: 0 };
      const expected = previous.clicks * scale;
      if (previous.clicks < T.declineClicks || current.clicks >= expected * T.declineRatio || changeZ(current.clicks, previous.clicks, scale) > T.declineZ) continue;
      const page = known.get(key);
      const url = page?.url ?? rows.find((row) => pageKey(row.page) === key)?.page ?? `https://${key}`;
      const yearNow = data.pagesYearAgo?.get(key);
      const yearBefore = data.pagesYearAgoPrevious?.get(key);
      const comparable = Boolean(yearNow && yearBefore && yearBefore.clicks >= 30);
      const lastYear = comparable ? yearNow!.clicks / yearBefore!.clicks : null;
      const change = current.clicks / previous.clicks;
      const seasonal = lastYear !== null && lastYear <= 0.85 && change >= lastYear * 0.75;
      const moved = (average(current) ?? 0) - (average(previous) ?? 0);
      const demand = !seasonal && current.impressions > 0 && moved < 1.5 && current.impressions < previous.impressions * 0.8;
      const older = data.hasBefore ? data.pagesBefore.get(key) : undefined;
      const decay = Boolean(older && older.clicks * T.decayStep > previous.clicks && previous.clicks * T.decayStep > current.clicks && page?.modifiedAt && now.getTime() - page.modifiedAt.getTime() > T.decayAgeDays * DAY_MS);
      const kind = seasonal ? "seasonal_decline" : demand ? "demand_decline" : decay ? "content_decay" : "declining";
      drafts.push(base({
        kind, topic: page?.title || url, targetUrl: url, action: seasonal || demand ? "monitor" : "update_existing", ...figures(current), days: Math.max(current.days, previous.days),
        impressions: Math.max(current.impressions, previous.impressions),
        why: seasonal
          ? `Bajó de ${previous.clicks} a ${current.clicks} clics, pero el año pasado cayó parecido en las mismas fechas.`
          : demand
            ? `Bajó de ${previous.clicks} a ${current.clicks} clics con la misma posición media: se buscó menos, no perdió sitio.`
            : `Bajó de ${previous.clicks} a ${current.clicks} clics, más de lo que bajó el sitio${decay ? ", por segundo periodo seguido y sin cambios en más de seis meses" : ""}${moved >= 1.5 ? `; su posición media empeoró ${pos(moved)} puestos` : ""}.`,
        actionReason: seasonal || demand ? "No hay un problema de contenido que corregir: se vigila." : "La caída supera el ruido y la del sitio: revisar y actualizar la página existente.",
        evidence: observed(current, [
          { metric: "Clics en los 28 días anteriores", value: previous.clicks, kind: "observed", source: "search_console" },
          { metric: "Clics del sitio frente al periodo anterior", value: pct(scale), kind: "observed", source: "search_console" },
          { metric: "Mismo cambio hace un año", value: lastYear === null ? null : pct(lastYear), kind: lastYear === null ? "unavailable" : "historical", source: "search_console" },
        ]),
        risks: seasonal || demand ? [] : ["La causa puede estar fuera de la página (competencia, cambio en los resultados)."],
        caveats: lastYear === null ? ["Sin datos de hace un año: no se puede descartar la estacionalidad."] : [], dedupeKey: `seo:decline:${key}`,
      }));
    }
  }

  // 7. Two pages of the site sharing one query.
  const sharing = new Map<string, Group[]>();
  for (const row of byQueryPage.values()) sharing.set(queryKey(row.query), [...(sharing.get(queryKey(row.query)) ?? []), row]);
  for (const [key, pages] of sharing) {
    const total = pages.reduce((sum, page) => sum + page.impressions, 0);
    const rivals = pages.filter((page) => page.impressions >= total * T.cannibalShare && page.days >= T.cannibalDays && (average(page) ?? 99) <= 30).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    if (total < T.cannibalImpressions || rivals.length < 2) continue;
    const sum = rivals.reduce<PageTotals>((acc, page) => ({ clicks: acc.clicks + page.clicks, impressions: acc.impressions + page.impressions, positionSum: acc.positionSum + page.positionSum, days: Math.max(acc.days, page.days) }), { clicks: 0, impressions: 0, positionSum: 0, days: 0 });
    drafts.push(base({
      kind: "cannibalization", topic: rivals[0].query, query: rivals[0].query, targetUrl: rivals[0].page, relatedUrls: rivals.slice(1).map((page) => page.page), action: "investigate_cannibalization", intent: queryIntent(rivals[0].query), ...figures(sum),
      why: `${rivals.length} páginas tuyas se reparten «${rivals[0].query}»: ${rivals.map((page) => pct(page.impressions / total)).join(" / ")} de las impresiones.`,
      actionReason: "Puede ser legítimo (dos resultados propios) o un conflicto. Hay que mirarlo antes de tocar o crear páginas para esta consulta.",
      evidence: observed(sum, rivals.map((page) => ({ metric: "Posición media de la página", value: pos(average(page)), kind: "observed" as const, source: "search_console" as const, period, note: page.page }))),
      risks: ["Fusionar, redirigir, borrar o cambiar la canónica es destructivo: nunca se hace automáticamente y exige aprobación y permiso de publicación."],
      caveats: [partial], dedupeKey: `seo:cannibalization:${key}`,
    }));
  }

  // 8. Topics with real visibility and hardly any pages behind them.
  for (const cluster of input.clusters) {
    const words = keywordTokens(cluster.name);
    if (!words.length || cluster.pagesCount > T.clusterPages) continue;
    const inside = [...byQuery.values()].filter((row) => words.every((word) => keywordTokens(row.query).includes(word)));
    const sum = inside.reduce<PageTotals>((acc, row) => ({ clicks: acc.clicks + row.clicks, impressions: acc.impressions + row.impressions, positionSum: acc.positionSum + row.positionSum, days: Math.max(acc.days, row.days) }), { clicks: 0, impressions: 0, positionSum: 0, days: 0 });
    if (inside.length < T.clusterQueries || sum.impressions < T.clusterImpressions) continue;
    drafts.push(base({
      kind: "underdeveloped_cluster", topic: cluster.name, action: "strengthen_cluster", clusterPages: cluster.pagesCount, ...figures(sum),
      relatedUrls: [...new Set(inside.map((row) => row.page))].slice(0, 5),
      why: `${inside.length} consultas sobre «${cluster.name}» ya muestran tu sitio y solo tienes ${cluster.pagesCount} página(s) en ese tema.`,
      actionReason: "Hay demanda observada y poca cobertura: reforzar el tema con páginas complementarias enlazadas.",
      evidence: observed(sum, [{ metric: "Páginas del tema", value: cluster.pagesCount, kind: "observed", source: "crawl" }, { metric: "Consultas distintas", value: inside.length, kind: "observed", source: "search_console", period }]),
      risks: ["Cada página nueva del tema debe responder a una consulta distinta."], caveats: [partial], dedupeKey: `seo:underdeveloped_cluster:${cluster.slug}`,
    }));
  }

  // 11. Pages that grew at this point of last year.
  if (data.pagesYearAgo && data.pagesYearAgoNext) {
    for (const [key, next] of data.pagesYearAgoNext) {
      const then = data.pagesYearAgo.get(key);
      const current = data.pages.get(key);
      if (!then || !current || then.impressions < T.seasonalImpressions || next.impressions < then.impressions * T.seasonalLift || next.clicks < then.clicks * T.seasonalLift || next.clicks < T.declineClicks) continue;
      const page = known.get(key);
      const lift = next.impressions / then.impressions;
      const url = page?.url ?? rows.find((row) => pageKey(row.page) === key)?.page ?? `https://${key}`;
      drafts.push(base({
        kind: "seasonal", topic: page?.title || url, targetUrl: url, action: "update_existing", seasonalLift: lift, ...figures(current),
        expectedClicks: next.clicks - then.clicks, expectedScenario: "si este año se repitiera la subida observada el año pasado",
        why: `El año pasado, en los 28 días siguientes a estas fechas, pasó de ${then.impressions} a ${next.impressions} impresiones.`,
        actionReason: "Actualizarla antes de la subida cuesta lo mismo y llega a tiempo.",
        evidence: observed(current, [
          { metric: "Clics hace un año", value: then.clicks, kind: "historical", source: "search_console" },
          { metric: "Clics en los 28 días siguientes, hace un año", value: next.clicks, kind: "historical", source: "search_console" },
        ]),
        risks: ["Un solo año de historia puede ser un hecho aislado y no una temporada."], caveats: ["La estacionalidad se apoya en un único año."], dedupeKey: `seo:seasonal:${key}`,
      }));
    }
  }
  return drafts;
}
