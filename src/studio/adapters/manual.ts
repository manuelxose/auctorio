// Manual source adapter (`manual`): items are created by hand in the Studio.

import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceRef } from "./types";

export class ManualAdapter implements SourceAdapter {
  readonly type = "manual" as const;

  async discover(_source: SourceRef, _context: DiscoveryContext): Promise<DiscoveredSourceItem[]> {
    return [];
  }
}
