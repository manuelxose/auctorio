// Webhook source adapter (`webhook`). Items are pushed to the platform via the
// /v2/sources/:id/webhook endpoint and stored with the pending queue;
// `discover` drains nothing by itself (pull is not possible for push sources).

import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceRef } from "./types";

export class WebhookAdapter implements SourceAdapter {
  readonly type = "webhook" as const;

  async discover(_source: SourceRef, _context: DiscoveryContext): Promise<DiscoveredSourceItem[]> {
    // Webhook sources are push-only; discovery is a no-op so the worker skips
    // them cheaply. Items arrive through the webhook endpoint.
    return [];
  }
}
