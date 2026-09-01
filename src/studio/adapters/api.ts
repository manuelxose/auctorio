// JSON / REST API adapter (`api`). Field mapping, items path, headers and
// pagination come from source.configuration — no publisher-specific code.

import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceHealthCheck, SourceRef } from "./types";
import { resolveAdapterPolicies } from "./policies";
import { fetchSourceHttp, robotsAllows, SourceNotModifiedError } from "./http";
import { asStringArray, deriveExternalId, emptyDiscoveredItem, normalizeCanonicalUrl, parseDate, readConfigObject } from "./normalize";
import { conditionalFromSource, observeNotModified, observeResponse } from "./observe";

export function resolvePath(input: unknown, path: string): unknown {
  if (!path) {
    return input;
  }
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  let current: unknown = input;
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function readField(record: Record<string, unknown>, path: string): string | null {
  const value = resolvePath(record, path);
  return typeof value === "string" ? value.trim() || null : value === undefined || value === null ? null : String(value);
}

/** Map a JSON payload to normalized items using configuration. Pure. */
export function parseApiItems(json: unknown, sourceUrl: string, maxItems: number, configuration: Record<string, unknown>): DiscoveredSourceItem[] {
  const itemsPath = typeof configuration.itemsPath === "string" ? configuration.itemsPath : "";
  const entries = resolvePath(json, itemsPath);
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  const fieldMap = configuration.fields && typeof configuration.fields === "object"
    ? (configuration.fields as Record<string, string>)
    : { title: "title", url: "url" };

  const items: DiscoveredSourceItem[] = [];
  for (const entry of list) {
    if (items.length >= maxItems) {
      break;
    }
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const title = readField(record, fieldMap.title ?? "title") ?? "";
    if (!title) {
      continue;
    }
    const sourceHref = readField(record, fieldMap.url ?? "url") ?? readField(record, "link") ?? null;
    const description = readField(record, fieldMap.description ?? "description") ?? null;
    const author = readField(record, fieldMap.author ?? "author");
    const publishedAt = parseDate(readField(record, fieldMap.publishedAt ?? "published_at"));
    const modifiedAt = parseDate(readField(record, fieldMap.modifiedAt ?? "modified_at"));

    items.push(
      emptyDiscoveredItem({
        externalId: readField(record, fieldMap.id ?? "id") ?? deriveExternalId(sourceHref, title),
        canonicalUrl: normalizeCanonicalUrl(sourceHref),
        sourceUrl: normalizeCanonicalUrl(sourceHref),
        title,
        description,
        rawText: description,
        cleanedText: description,
        author,
        authors: author ? [author] : [],
        publishedAt,
        modifiedAt,
        sourceImageUrls: asStringArray(readField(record, fieldMap.image ?? "image")),
        language: readField(record, "language"),
        categories: asStringArray(readField(record, fieldMap.categories ?? "categories")),
        tags: asStringArray(readField(record, fieldMap.tags ?? "tags")),
        rawMetadata: { sourceUrl, itemsPath },
        confidence: publishedAt || description ? 0.85 : 0.7,
      }),
    );
  }
  return items;
}

export class ApiAdapter implements SourceAdapter {
  readonly type = "api" as const;

  async discover(source: SourceRef, context: DiscoveryContext): Promise<DiscoveredSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const policies = resolveAdapterPolicies(source, context);
    const url = new URL(source.url);
    if (policies.respectRobots && !(await robotsAllows(url))) {
      throw new Error("robots_disallow");
    }
    const configuration = readConfigObject(source.configuration);
    const headers = configuration.headers && typeof configuration.headers === "object"
      ? (configuration.headers as Record<string, string>)
      : undefined;

    try {
      const response = await fetchSourceHttp(url, {
        accept: "application/json",
        headers,
        timeoutMs: policies.timeoutMs,
        retryAttempts: policies.retryAttempts,
        backoffBaseMs: policies.backoffBaseMs,
        backoffMaxMs: policies.backoffMaxMs,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
      observeResponse(context, response);

      let json: unknown;
      try {
        json = JSON.parse(response.body) as unknown;
      } catch {
        throw new Error("source_api_invalid_json");
      }
      return parseApiItems(json, response.finalUrl || source.url, policies.maxItems, configuration);
    } catch (error) {
      if (error instanceof SourceNotModifiedError) {
        observeNotModified(context, error.etag);
        return [];
      }
      throw error;
    }
  }

  async healthCheck(source: SourceRef, context: DiscoveryContext): Promise<SourceHealthCheck> {
    if (!source.url) {
      return { ok: false, status: null, latencyMs: null, itemCount: null, error: "source_url_required" };
    }
    const started = Date.now();
    try {
      const policies = resolveAdapterPolicies(source, context);
      const response = await fetchSourceHttp(new URL(source.url), {
        accept: "application/json",
        timeoutMs: Math.min(policies.timeoutMs, 10_000),
        retryAttempts: 1,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
      JSON.parse(response.body);
      return { ok: true, status: response.status, latencyMs: Date.now() - started, itemCount: null, error: null };
    } catch (error) {
      if (error instanceof SourceNotModifiedError) {
        return { ok: true, status: 304, latencyMs: Date.now() - started, itemCount: 0, error: null };
      }
      return {
        ok: false,
        status: null,
        latencyMs: Date.now() - started,
        itemCount: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
