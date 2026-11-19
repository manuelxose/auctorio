import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

export type OpportunityPlatform = 'reddit' | 'quora';
export type OpportunityState = 'to_reply' | 'replied' | 'dismissed';

export interface Opportunity {
  id: string;
  title: string;
  url: string;
  snippet: string | null;
  community: string | null;
  keyword: string;
  votes: number | null;
  publishedAt: string | null;
  status: OpportunityState;
  draft: string | null;
}

export interface OpportunitySettings {
  keywords: string[];
  subreddits: string[];
  replyStyle: string;
  suggestedKeywords?: string[];
}

@Injectable({ providedIn: 'root' })
export class EngagementApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2`;

  private url(siteId: string, platform: OpportunityPlatform, path = ''): string {
    return `${this.base}/sites/${siteId}/engagement${path}?platform=${platform}`;
  }

  list(siteId: string, platform: OpportunityPlatform) {
    return this.http.get<{ items: Opportunity[]; settings: OpportunitySettings; searchConfigured: boolean }>(this.url(siteId, platform));
  }

  saveSettings(siteId: string, platform: OpportunityPlatform, settings: OpportunitySettings) {
    return this.http.put<OpportunitySettings>(this.url(siteId, platform, '/settings'), settings);
  }

  search(siteId: string, platform: OpportunityPlatform) {
    return this.http.post<{ operationId: string }>(this.url(siteId, platform, '/refresh'), {});
  }

  draft(siteId: string, platform: OpportunityPlatform, id: string) {
    return this.http.post<{ draft: string }>(this.url(siteId, platform, `/${id}/draft`), {});
  }

  update(siteId: string, platform: OpportunityPlatform, id: string, patch: { status?: OpportunityState; draft?: string }) {
    return this.http.patch<{ ok: true }>(this.url(siteId, platform, `/${id}`), patch);
  }
}
