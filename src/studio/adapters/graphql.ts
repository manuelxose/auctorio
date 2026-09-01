// GraphQL API adapter (`graphql`). Query, variables, items path and field map
// come from source.configuration. Uses HTTP POST with a JSON body.

import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceRef } from "./types";
import { resolveAdapterPolicies } from "./policies";
import { getDomainThrottle, robotsAllows, SourceHttpError } from "./http";
import { readConfigObject } from "./normalize";
import { parseApiItems } from "./api";
import { validateScrapeUrl } from "../../infrastructure/scraping";
import { retryWithBackoff } from "../resilience/retry";

export class GraphqlAdapter implements SourceAdapter {
  readonly type = "graphql" as const;

  async discover(source: SourceRef, context: DiscoveryContext): Promise<DiscoveredSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const configuration = readConfigObject(source.configuration);
    const query = typeof configuration.query === "string" ? configuration.query : null;
    if (!query) {
      throw new Error("source_graphql_query_required");
    }
    const policies = resolveAdapterPolicies(source, context);
    const url = new URL(source.url);
    await validateScrapeUrl(url);
    if (policies.respectRobots && !(await robotsAllows(url))) {
      throw new Error("robots_disallow");
    }
    const variables = configuration.variables && typeof configuration.variables === "object"
      ? (configuration.variables as Record<string, unknown>)
      : undefined;
    const body = JSON.stringify({ query, ...(variables ? { variables } : {}) });

    const post = (): Promise<unknown> =>
      getDomainThrottle().run(url.hostname, async () => {
        const controller = new AbortController();
        const onParentAbort = () => controller.abort();
        context.signal?.addEventListener("abort", onParentAbort, { once: true });
        const timeout = setTimeout(() => controller.abort(), policies.timeoutMs);
        try {
          const response = await fetch(url.toString(), {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              "user-agent": policies.userAgent,
            },
            body,
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new SourceHttpError(`graphql_fetch_failed status=${response.status}`, response.status, response.status === 429 || response.status >= 500);
          }
          return (await response.json()) as unknown;
        } finally {
          clearTimeout(timeout);
          context.signal?.removeEventListener("abort", onParentAbort);
        }
      });

    const json = await retryWithBackoff(post, {
      attempts: policies.retryAttempts,
      baseDelayMs: policies.backoffBaseMs,
      maxDelayMs: policies.backoffMaxMs,
      shouldRetry: (error) => error instanceof SourceHttpError && error.retryable,
      signal: context.signal,
    });
    return parseApiItems(json, source.url, policies.maxItems, configuration);
  }
}
