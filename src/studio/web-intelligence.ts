import { getEnv, getNumberEnv } from "../shared/utils/env";
import { fetchJson, fetchWithTimeout } from "../shared/utils/http";

// ────────────────────────────────────────────────────────────── Types

export type WebSearchResult = {
  url: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  domain: string;
  score: number | null;
};

export type WebSearchOptions = {
  limit?: number;
  freshnessHours?: number;
  language?: string | null;
  country?: string | null;
};

export type WebClaim = {
  claim: string;
  confidence: number;
};

export type WebExtraction = {
  url: string;
  title: string | null;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  description: string | null;
  articleText: string | null;
  images: string[];
  language: string | null;
  entities: string[];
  claims: WebClaim[];
  structuredData: Record<string, unknown> | null;
};

export interface WebIntelligenceProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;
  scrape(url: string): Promise<WebExtraction | null>;
  extract(url: string): Promise<WebExtraction | null>;
  crawl(url: string, options?: { limit?: number }): Promise<WebSearchResult[]>;
  mapSite(url: string): Promise<string[]>;
}

export function hostnameOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeSearchItem(item: Record<string, unknown>): WebSearchResult | null {
  const url = typeof item.url === "string" ? item.url.trim() : "";
  if (!url) {
    return null;
  }
  const domain = hostnameOf(url) ?? "";
  return {
    url,
    title: typeof item.title === "string" ? item.title.trim().slice(0, 400) : domain,
    description: typeof item.description === "string" ? item.description.trim().slice(0, 1000) : null,
    publishedAt: typeof item.publishedAt === "string" || typeof item.publishedDate === "string" ? String(item.publishedAt ?? item.publishedDate) : null,
    domain,
    score: typeof item.score === "number" ? item.score : null,
  };
}

// ────────────────────────────────────────────────────────────── Firecrawl

export class FirecrawlWebIntelligenceProvider implements WebIntelligenceProvider {
  readonly name = "firecrawl";
  private baseUrl = getEnv("FIRECRAWL_BASE_URL", "https://api.firecrawl.dev");

  isConfigured(): boolean {
    return Boolean(getEnv("FIRECRAWL_API_KEY", ""));
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${getEnv("FIRECRAWL_API_KEY", "")}`,
      "content-type": "application/json",
    };
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    const data = await fetchJson<{
      success?: boolean;
      data?: unknown;
    }>(`${this.baseUrl}/v1/search`, {
      method: "POST",
      headers: this.headers(),
      body: {
        query,
        limit: Math.min(options.limit ?? 10, 20),
        ...(options.language ? { lang: options.language } : {}),
        ...(options.country ? { country: options.country } : {}),
        ...(options.freshnessHours ? { tbs: this.freshnessTbs(options.freshnessHours) } : {}),
      },
      timeoutMs: getNumberEnv("WEB_INTELLIGENCE_TIMEOUT_MS", 45_000),
      retries: 1,
    });
    const items = Array.isArray(data.data) ? data.data : [];
    return items
      .map((entry) => normalizeSearchItem(entry as Record<string, unknown>))
      .filter((entry): entry is WebSearchResult => entry !== null);
  }

  private freshnessTbs(freshnessHours: number): string {
    if (freshnessHours <= 24) {
      return "qdr:d";
    }
    if (freshnessHours <= 168) {
      return "qdr:w";
    }
    return "qdr:m";
  }

  async scrape(url: string): Promise<WebExtraction | null> {
    const data = await fetchJson<{ success?: boolean; data?: unknown }>(`${this.baseUrl}/v1/scrape`, {
      method: "POST",
      headers: this.headers(),
      body: { url, formats: ["markdown", "extract"] },
      timeoutMs: getNumberEnv("WEB_INTELLIGENCE_TIMEOUT_MS", 60_000),
      retries: 1,
    });
    if (!data.success || !data.data) {
      return null;
    }
    const payload = data.data as Record<string, unknown>;
    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
    return {
      url,
      title: typeof metadata.title === "string" ? metadata.title : null,
      publisher: typeof metadata.ogSiteName === "string" ? metadata.ogSiteName : null,
      author: typeof metadata.author === "string" ? metadata.author : null,
      publishedAt: typeof metadata.publishedDate === "string" ? metadata.publishedDate : null,
      description: typeof metadata.description === "string" ? metadata.description : null,
      articleText: typeof payload.markdown === "string" ? payload.markdown : null,
      images: [typeof metadata.ogImage === "string" ? metadata.ogImage : null].filter((entry): entry is string => Boolean(entry)),
      language: typeof metadata.language === "string" ? metadata.language : null,
      entities: Array.isArray(metadata.entities) ? metadata.entities.map(String) : [],
      claims: [],
      structuredData: payload.extract && typeof payload.extract === "object" ? (payload.extract as Record<string, unknown>) : null,
    };
  }

  async extract(url: string): Promise<WebExtraction | null> {
    return this.scrape(url);
  }

  async crawl(url: string, options: { limit?: number } = {}): Promise<WebSearchResult[]> {
    const started = await fetchJson<{ id?: string }>(`${this.baseUrl}/v1/crawl`, {
      method: "POST",
      headers: this.headers(),
      body: {
        url,
        limit: Math.min(options.limit ?? 20, 100),
        scrapeOptions: { formats: ["markdown"] },
      },
      timeoutMs: getNumberEnv("WEB_INTELLIGENCE_TIMEOUT_MS", 45_000),
      retries: 0,
    });
    if (!started.id) {
      throw new Error("firecrawl_crawl_missing_id");
    }
    const maxPolls = 12;
    for (let poll = 0; poll < maxPolls; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const status = await fetchJson<{ status?: string; data?: unknown }>(`${this.baseUrl}/v1/crawl/${started.id}`, {
        headers: this.headers(),
        timeoutMs: 20_000,
        retries: 0,
      });
      if (status.status === "completed") {
        const items = Array.isArray(status.data) ? status.data : [];
        return items
          .map((entry) => normalizeSearchItem(entry as Record<string, unknown>))
          .filter((entry): entry is WebSearchResult => entry !== null);
      }
      if (status.status === "failed" || status.status === "cancelled") {
        return [];
      }
    }
    return [];
  }

  async mapSite(url: string): Promise<string[]> {
    const data = await fetchJson<{ links?: unknown }>(`${this.baseUrl}/v1/map`, {
      method: "POST",
      headers: this.headers(),
      body: { url, limit: 100 },
      timeoutMs: getNumberEnv("WEB_INTELLIGENCE_TIMEOUT_MS", 45_000),
      retries: 0,
    });
    return Array.isArray(data.links) ? data.links.map(String) : [];
  }
}

// ────────────────────────────────────────────────────────────── Tavily

export class TavilyWebIntelligenceProvider implements WebIntelligenceProvider {
  readonly name = "tavily";

  isConfigured(): boolean {
    return Boolean(getEnv("TAVILY_API_KEY", ""));
  }

  private apiKey(): string {
    const key = getEnv("TAVILY_API_KEY", "").trim();
    if (!key) {
      throw new Error("TAVILY_API_KEY is required for the Tavily web intelligence provider");
    }
    return key;
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    const body: Record<string, unknown> = {
      api_key: this.apiKey(),
      query,
      max_results: Math.min(options.limit ?? 10, 20),
      include_answer: false,
    };
    if (options.freshnessHours && options.freshnessHours <= 168) {
      body.days = Math.max(1, Math.ceil(options.freshnessHours / 24));
    }
    const data = await fetchJson<{ results?: unknown }>("https://api.tavily.com/search", {
      method: "POST",
      body,
      timeoutMs: getNumberEnv("WEB_INTELLIGENCE_TIMEOUT_MS", 45_000),
      retries: 1,
    });
    const items = Array.isArray(data.results) ? data.results : [];
    return items
      .map((entry) => {
        const record = entry as Record<string, unknown>;
        return normalizeSearchItem({
          url: record.url,
          title: record.title,
          description: record.content,
          publishedAt: record.published_date ?? null,
          score: record.score ?? null,
        });
      })
      .filter((entry): entry is WebSearchResult => entry !== null);
  }

  async scrape(url: string): Promise<WebExtraction | null> {
    const data = await fetchJson<{ results?: unknown }>("https://api.tavily.com/extract", {
      method: "POST",
      body: { api_key: this.apiKey(), urls: [url] },
      timeoutMs: getNumberEnv("WEB_INTELLIGENCE_TIMEOUT_MS", 60_000),
      retries: 1,
    });
    const items = Array.isArray(data.results) ? data.results : [];
    const record = items[0] as Record<string, unknown> | undefined;
    if (!record || typeof record.raw_content !== "string") {
      return null;
    }
    return {
      url,
      title: typeof record.title === "string" ? record.title : null,
      publisher: null,
      author: null,
      publishedAt: typeof record.published_date === "string" ? record.published_date : null,
      description: typeof record.content === "string" ? record.content.slice(0, 1000) : null,
      articleText: record.raw_content,
      images: [],
      language: null,
      entities: [],
      claims: [],
      structuredData: null,
    };
  }

  async extract(url: string): Promise<WebExtraction | null> {
    return this.scrape(url);
  }

  async crawl(): Promise<WebSearchResult[]> {
    return [];
  }

  async mapSite(): Promise<string[]> {
    return [];
  }
}

// ────────────────────────────────────────────────────────────── Factory

export function getWebIntelligenceProvider(): WebIntelligenceProvider | null {
  const configured = getEnv("WEB_INTELLIGENCE_PROVIDER", "").trim().toLowerCase();
  if (configured === "tavily") {
    const provider = new TavilyWebIntelligenceProvider();
    return provider.isConfigured() ? provider : null;
  }
  if (configured === "firecrawl" || !configured) {
    const provider = new FirecrawlWebIntelligenceProvider();
    return provider.isConfigured() ? provider : null;
  }
  return null;
}

export function webIntelligenceAvailability(): {
  provider: string;
  configured: boolean;
  message: string;
} {
  const configured = getEnv("WEB_INTELLIGENCE_PROVIDER", "firecrawl").trim().toLowerCase();
  if (configured === "tavily") {
    return {
      provider: "tavily",
      configured: Boolean(getEnv("TAVILY_API_KEY", "")),
      message: Boolean(getEnv("TAVILY_API_KEY", "")) ? "Tavily configured" : "TAVILY_API_KEY is not set",
    };
  }
  return {
    provider: "firecrawl",
    configured: Boolean(getEnv("FIRECRAWL_API_KEY", "")),
    message: Boolean(getEnv("FIRECRAWL_API_KEY", "")) ? "Firecrawl configured" : "FIRECRAWL_API_KEY is not set",
  };
}

export async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(url, {
      method: "HEAD",
      timeoutMs: 8_000,
      retries: 0,
    });
    return response.ok;
  } catch {
    return false;
  }
}
