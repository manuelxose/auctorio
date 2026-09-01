import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppPopoverComponent } from '../components/ui/app-popover.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { BlockedDomain, DiscoveredDomain, SourceRecommendation, SourceType, StudioEnrichmentProvider, StudioFeedCandidate, StudioFeedDiscoveryResult, StudioSite, StudioSource, StudioSourcePack } from '../models/studio.models';

@Component({
  selector: 'app-sources-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppPopoverComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Content acquisition</p>
          <h1 class="au-page__title">Sources</h1>
          <p class="au-page__subtitle">Feeds, AI-discovered sources and web monitoring that feed the editorial pipeline.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="showForm = !showForm">
            <app-icon name="plus"></app-icon>
            {{ showForm ? 'Close form' : 'Add source' }}
          </button>
        </div>
      </header>

      <nav class="au-tabs au-mb-3" aria-label="Source sections">
        <button class="au-tab" type="button" [class.is-active]="view === 'active'" (click)="setView('active')">Active sources</button>
        <button class="au-tab" type="button" [class.is-active]="view === 'packs'" (click)="setView('packs')">Source packs</button>
        <button class="au-tab" type="button" [class.is-active]="view === 'enrichment'" (click)="setView('enrichment')">Enrichment providers</button>
        <button class="au-tab" type="button" [class.is-active]="view === 'recommendations'" (click)="setView('recommendations')">
          AI recommendations
          <span class="au-badge au-badge--sm" *ngIf="recommendations.length > 0">{{ recommendations.length }}</span>
        </button>
        <button class="au-tab" type="button" [class.is-active]="view === 'discovered'" (click)="setView('discovered')">Recently discovered</button>
        <button class="au-tab" type="button" [class.is-active]="view === 'blocked'" (click)="setView('blocked')">Blocked sources</button>
      </nav>

      <!-- AI recommendations -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'recommendations'">
        <h2 class="au-panel__title">AI recommendations</h2>
        <p class="au-panel__subtitle au-mb-3">Domains the discovery engine found repeatedly with high relevance. Add them as permanent sources or dismiss them.</p>
        <app-empty-state
          *ngIf="recommendations.length === 0"
          icon="sources"
          title="No recommendations yet"
          text="When AI web discovery finds recurring high-quality domains they appear here."
        ></app-empty-state>
        <div class="au-connection-grid" *ngIf="recommendations.length > 0">
          <article class="au-connection-card" *ngFor="let recommendation of recommendations">
            <div class="au-connection-card__head">
              <div class="au-flex-1">
                <h2>{{ recommendation.domain }}</h2>
                <p>Discovered in {{ recommendation.searchesCount }} relevant searches · score {{ recommendation.score }}</p>
              </div>
              <span class="au-badge" [class.au-badge--success]="recommendation.score >= 85" [class.au-badge--warning]="recommendation.score >= 50 && recommendation.score < 85" [class.au-badge--neutral]="recommendation.score < 50">
                {{ recommendation.score >= 85 ? 'High quality' : recommendation.score >= 50 ? 'Specialist' : 'Discovery only' }}
              </span>
            </div>
            <p class="au-muted au-mb-2" *ngIf="recommendation.reasonSummary">{{ recommendation.reasonSummary }}</p>
            <div class="au-inline">
              <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="acceptRecommendation(recommendation)" [disabled]="busyRecommendation === recommendation.id">
                <app-icon name="plus"></app-icon>
                Add source
              </button>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="dismissRecommendation(recommendation)" [disabled]="busyRecommendation === recommendation.id">
                Dismiss
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- Recently discovered -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'discovered'">
        <h2 class="au-panel__title">Recently discovered</h2>
        <p class="au-panel__subtitle au-mb-3">Domains found by AI web discovery. Block low-quality or off-topic domains from being scraped.</p>
        <app-empty-state
          *ngIf="domains.length === 0"
          icon="sources"
          title="Nothing discovered yet"
          text="Enable AI source discovery in Settings and run it to start finding sources on the live web."
        >
          <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="runDiscovery()" [disabled]="runningDiscovery">
            {{ runningDiscovery ? 'Running…' : 'Run discovery now' }}
          </button>
        </app-empty-state>
        <div class="au-table-wrap" *ngIf="domains.length > 0">
          <table class="au-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Discoveries</th>
                <th>Quality</th>
                <th>Last seen</th>
                <th style="width: 120px"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let domain of domains">
                <td><span class="au-table__title">{{ domain.domain }}</span></td>
                <td>{{ domain.discoveryCount }}</td>
                <td>
                  <span class="au-badge" [class.au-badge--success]="(domain.qualityScore ?? 0) >= 70" [class.au-badge--warning]="(domain.qualityScore ?? 0) >= 40 && (domain.qualityScore ?? 0) < 70" [class.au-badge--neutral]="(domain.qualityScore ?? 0) < 40">
                    {{ domain.qualityScore ?? '—' }}{{ domain.tier ? ' · ' + domain.tier : '' }}
                  </span>
                </td>
                <td class="au-nowrap au-muted">{{ dateLabel(domain.lastSeenAt) }}</td>
                <td>
                  <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="blockDomain(domain.domain)" *ngIf="!domain.blocked">
                    Block
                  </button>
                  <span class="au-badge au-badge--danger" *ngIf="domain.blocked">blocked</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="au-inline" *ngIf="domains.length > 0">
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="runDiscovery()" [disabled]="runningDiscovery">
            <app-icon name="sparkles"></app-icon>
            {{ runningDiscovery ? 'Running…' : 'Run discovery now' }}
          </button>
        </div>
      </section>

      <!-- Blocked -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'blocked'">
        <h2 class="au-panel__title">Blocked sources</h2>
        <p class="au-panel__subtitle au-mb-3">These domains are excluded from AI discovery and scraping.</p>
        <app-empty-state
          *ngIf="blockedDomains.length === 0"
          icon="sources"
          title="No blocked domains"
          text="Block a domain from the Recently discovered section to keep it out of the pipeline."
        ></app-empty-state>
        <div class="au-table-wrap" *ngIf="blockedDomains.length > 0">
          <table class="au-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Reason</th>
                <th>Blocked on</th>
                <th style="width: 120px"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let entry of blockedDomains">
                <td><span class="au-table__title">{{ entry.domain }}</span></td>
                <td class="au-muted">{{ entry.reason || '—' }}</td>
                <td class="au-nowrap au-muted">{{ dateLabel(entry.createdAt) }}</td>
                <td>
                  <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="unblockDomain(entry.domain)">
                    Unblock
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="showForm && view === 'active'">
        <h2 class="au-panel__title">{{ editingId ? 'Edit source' : 'New source' }}</h2>
        <p class="au-panel__subtitle au-mb-3">Sources provide input. They are separate from publishing connections.</p>
        <div class="au-field-grid">
          <label class="au-field">
            <span class="au-field__label">Name</span>
            <input class="au-input" type="text" [(ngModel)]="form.name" placeholder="e.g. El Mundo Deportes RSS" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Type</span>
            <select class="au-select" [(ngModel)]="form.type">
              <option *ngFor="let type of sourceTypes" [ngValue]="type">{{ type }}</option>
            </select>
          </label>
          <label class="au-field">
            <span class="au-field__label">URL / endpoint</span>
            <input class="au-input" type="url" [(ngModel)]="form.url" placeholder="https://…" [disabled]="form.type === 'manual'" />
            <span class="au-field__hint">Feed, sitemap or page URL. Use auto-discover to find the publisher's feed first.</span>
          </label>
          <div class="au-field">
            <span class="au-field__label">Feed discovery</span>
            <button class="au-btn au-btn--secondary" type="button" (click)="discoverFeeds()" [disabled]="!form.url || discoveringFeeds">
              <app-icon name="sparkles"></app-icon>
              {{ discoveringFeeds ? 'Discovering…' : 'Auto-discover feed' }}
            </button>
          </div>
          <label class="au-field">
            <span class="au-field__label">Site</span>
            <select class="au-select" [(ngModel)]="form.siteId">
              <option [ngValue]="null">All sites</option>
              <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
            </select>
          </label>
          <label class="au-field">
            <span class="au-field__label">Refresh (minutes)</span>
            <input class="au-input" type="number" min="5" [(ngModel)]="form.refreshIntervalMinutes" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Priority (-5..5)</span>
            <input class="au-input" type="number" min="-5" max="5" [(ngModel)]="form.priority" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Trust (0..1)</span>
            <input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="form.trustScore" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Language</span>
            <input class="au-input" type="text" [(ngModel)]="form.language" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Categories (comma separated)</span>
            <input class="au-input" type="text" [(ngModel)]="form.categoriesText" placeholder="football, streaming, technology" />
          </label>
          <label class="au-field au-field--wide">
            <span class="au-field__label">Configuration (JSON, optional)</span>
            <textarea class="au-input au-textarea" rows="4" [(ngModel)]="form.configurationText" placeholder='{"itemSelector": "div.fa-card", "engine": "browser"}'></textarea>
            <span class="au-field__hint">Selectors for htmllist, filters for imdb. Leave empty to use per-site defaults.</span>
          </label>
        </div>
        <details class="au-details au-mb-3">
          <summary class="au-details__summary">Advanced</summary>
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Authority (0..1)</span>
              <input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="form.authorityScore" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Country</span>
              <input class="au-input" type="text" [(ngModel)]="form.country" placeholder="e.g. US, GB, ES" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Tags (comma separated)</span>
              <input class="au-input" type="text" [(ngModel)]="form.tagsText" placeholder="movies, tv, trade" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Respect robots.txt</span>
              <select class="au-select" [(ngModel)]="form.respectRobots">
                <option [ngValue]="true">Yes</option>
                <option [ngValue]="false">No</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Rate limits (JSON, optional)</span>
              <input class="au-input" type="text" [(ngModel)]="form.rateLimitsText" placeholder='{"maxRequestsPerMinute": 6, "minIntervalMs": 10000}' />
            </label>
            <label class="au-field">
              <span class="au-field__label">Extraction policy (JSON, optional)</span>
              <input class="au-input" type="text" [(ngModel)]="form.extractionPolicyText" placeholder='{"extractArticleMetadataOnly": true}' />
            </label>
          </div>
        </details>
        <div class="au-panel au-panel--padded au-mb-3" *ngIf="feedCandidates.length > 0">
          <h3 class="au-panel__title">Discovered endpoints for {{ discoveredHostname }}</h3>
          <p class="au-panel__subtitle">Verified endpoints only. Pick one to use — nothing is subscribed automatically.</p>
          <ul class="au-list">
            <li class="au-list__item" *ngFor="let candidate of feedCandidates">
              <div class="au-flex-1">
                <span class="au-badge au-badge--success" *ngIf="candidate.verified">verified</span>
                <span class="au-badge au-badge--warning" *ngIf="!candidate.verified">unverified</span>
                <span class="au-badge au-badge--outline au-ml-1">{{ candidate.type }}</span>
                <span class="au-badge au-badge--outline au-ml-1">{{ candidate.method }}</span>
                <div class="au-truncate au-muted" style="max-width: 640px">{{ candidate.url }}</div>
                <div class="au-muted" *ngIf="candidate.note">{{ candidate.note }}</div>
              </div>
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="useCandidate(candidate)" [disabled]="!candidate.verified">Use this endpoint</button>
            </li>
          </ul>
        </div>
        <div class="au-panel au-panel--padded au-mb-3" *ngIf="draftTest">
          <h3 class="au-panel__title">Preview — {{ draftTest.itemCount ?? 0 }} items</h3>
          <div class="au-muted au-mb-2" *ngIf="!draftTest.ok">{{ draftTest.message }}</div>
          <table class="au-table" *ngIf="draftTest.ok && draftTest.sample?.length">
            <thead><tr><th>Title</th><th>Published</th><th>Category</th></tr></thead>
            <tbody>
              <tr *ngFor="let item of draftTest.sample">
                <td><span class="au-table__title">{{ item['title'] }}</span><span class="au-table__sub au-truncate" style="display:block;max-width:420px">{{ item['canonicalUrl'] }}</span></td>
                <td class="au-nowrap au-muted">{{ dateLabel(item['publishedAt']) }}</td>
                <td class="au-muted">{{ categoriesLabel(item) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="au-form__actions">
          <button class="au-btn au-btn--ghost" type="button" *ngIf="editingId" (click)="resetForm()">Cancel</button>
          <button class="au-btn au-btn--secondary" type="button" (click)="testDraft()" [disabled]="!form.url || testingDraft">
            {{ testingDraft ? 'Testing…' : 'Test connection' }}
          </button>
          <button class="au-btn au-btn--primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save source' }}</button>
        </div>
      </section>

      <section class="au-panel" *ngIf="view === 'active'">
        <app-empty-state
          *ngIf="sources.length === 0"
          icon="sources"
          title="Connect a source to start discovering content"
          text="Add an RSS feed, sitemap or page. Discovered stories land in the Inbox."
        >
          <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="showForm = true">Add source</button>
        </app-empty-state>

        <div class="au-panel au-panel--padded au-mb-2" *ngIf="selected.size > 0 && sources.length > 0">
          <div class="au-inline">
            <span class="au-muted au-mr-2">{{ selected.size }} selected</span>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="bulkAction('enable')"><app-icon name="play"></app-icon>Enable</button>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="bulkAction('disable')"><app-icon name="pause"></app-icon>Disable</button>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="bulkAction('refresh')" [disabled]="bulkRunning"><app-icon name="refresh"></app-icon>Refresh</button>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="bulkAction('verify')" [disabled]="bulkRunning"><app-icon name="circle-check"></app-icon>Verify</button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="bulkAction('archive')">Archive</button>
            <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="bulkAction('delete')">Delete</button>
            <span class="au-muted au-ml-2">Category</span>
            <input class="au-input au-input--sm" style="width: 140px" type="text" [(ngModel)]="bulkCategory" placeholder="movie-tv" />
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="bulkAction('assign_category')" [disabled]="!bulkCategory.trim()">Assign</button>
            <span class="au-muted au-ml-2">Site</span>
            <select class="au-select au-select--sm" style="width: 160px" [(ngModel)]="bulkSiteId">
              <option [ngValue]="null">All sites</option>
              <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
            </select>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="bulkAction('assign_site')">Assign</button>
          </div>
          <div class="au-muted" *ngIf="bulkFeedback">{{ bulkFeedback }}</div>
        </div>

        <div class="au-table-wrap" *ngIf="sources.length > 0">
          <table class="au-table">
            <thead>
              <tr>
                <th style="width: 34px">
                  <input type="checkbox" [checked]="allSelected()" (change)="toggleSelectAll()" [attr.aria-label]="'Select all sources'" />
                </th>
                <th>Name</th>
                <th>Type</th>
                <th>Health</th>
                <th>Last fetch</th>
                <th>Last new</th>
                <th>Stories</th>
                <th>Verified</th>
                <th style="width: 44px"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let source of sources">
                <td>
                  <input type="checkbox" [checked]="selected.has(source.id)" (change)="toggleSelect(source.id)" [attr.aria-label]="'Select ' + source.name" />
                </td>
                <td>
                  <button class="au-link" type="button" (click)="openDetail(source)">
                    <span class="au-table__title">{{ source.name }}</span>
                  </button>
                  <span class="au-table__sub">{{ source.site?.name ?? 'All sites' }} · priority {{ source.priority }} · {{ source.domain ?? '—' }}</span>
                </td>
                <td><span class="au-badge au-badge--outline">{{ source.type }}</span></td>
                <td>
                  <span class="au-badge" [class]="'au-badge ' + healthClass(source)" [attr.title]="healthTitle(source)">
                    {{ healthLabel(source) }}
                  </span>
                </td>
                <td class="au-nowrap au-muted">{{ dateLabel(source.lastFetchedAt) }}</td>
                <td class="au-nowrap au-muted">{{ dateLabel(source.lastNewItemAt ?? null) }}</td>
                <td>{{ source.discoveredCount }}</td>
                <td>
                  <span class="au-badge au-badge--success" *ngIf="source.verificationStatus === 'verified'">verified</span>
                  <span class="au-badge au-badge--warning" *ngIf="source.verificationStatus === 'failed'">failed</span>
                  <span class="au-badge au-badge--danger" *ngIf="source.verificationStatus === 'unsupported'">unsupported</span>
                  <span class="au-badge au-badge--neutral" *ngIf="!source.verificationStatus || source.verificationStatus === 'unverified'">unverified</span>
                </td>
                <td>
                  <button
                    class="au-btn au-btn--ghost au-btn--icon au-btn--sm"
                    type="button"
                    #menuTrigger
                    (click)="rowMenu.toggle(menuTrigger)"
                    [attr.aria-label]="'Actions for ' + source.name"
                    aria-haspopup="menu"
                  >
                    <app-icon name="dots"></app-icon>
                  </button>
                  <app-popover #rowMenu>
                    <div class="au-menu">
                      <button class="au-menu__item" type="button" (click)="rowMenu.hide(); openDetail(source)">
                        <app-icon name="info"></app-icon>
                        Details & runs
                      </button>
                      <button class="au-menu__item" type="button" (click)="rowMenu.hide(); test(source)">
                        <app-icon name="circle-check"></app-icon>
                        Test connection
                      </button>
                      <button class="au-menu__item" type="button" (click)="rowMenu.hide(); verify(source)">
                        <app-icon name="shield-check"></app-icon>
                        Verify endpoint
                      </button>
                      <button class="au-menu__item" type="button" (click)="rowMenu.hide(); fetch(source)" [disabled]="fetching[source.id]">
                        <app-icon name="refresh"></app-icon>
                        Fetch now
                      </button>
                      <button class="au-menu__item" type="button" (click)="rowMenu.hide(); toggle(source)">
                        <app-icon name="pause"></app-icon>
                        {{ source.enabled ? 'Disable' : 'Enable' }}
                      </button>
                      <button class="au-menu__item" type="button" (click)="rowMenu.hide(); edit(source)">
                        <app-icon name="edit"></app-icon>
                        Edit
                      </button>
                      <div class="au-menu__sep"></div>
                      <button class="au-menu__item" type="button" (click)="rowMenu.hide(); archive(source)">
                        <app-icon name="archive"></app-icon>
                        Archive
                      </button>
                      <button class="au-menu__item is-danger" type="button" (click)="rowMenu.hide(); remove(source)">
                        <app-icon name="trash"></app-icon>
                        Delete
                      </button>
                    </div>
                  </app-popover>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Source detail & recent runs -->
        <div class="au-panel au-panel--padded au-mb-3" *ngIf="detailSource">
          <div class="au-inline au-mb-2">
            <h2 class="au-panel__title au-flex-1">{{ detailSource.name }}</h2>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="closeDetail()">Close</button>
          </div>
          <div class="au-field-grid">
            <div class="au-field">
              <span class="au-field__label">Health</span>
              <span class="au-badge" [class]="'au-badge ' + healthClass(detailSource)">{{ healthLabel(detailSource) }}</span>
              <div class="au-muted" *ngFor="let diagnostic of healthDiagnostics(detailSource)">{{ diagnostic }}</div>
            </div>
            <div class="au-field">
              <span class="au-field__label">Endpoint</span>
              <div class="au-truncate au-muted" style="max-width: 480px">{{ detailSource.url || '—' }}</div>
              <div class="au-muted">Adapter {{ detailSource.type }} · discovery {{ detailSource.discoveryMethod ?? 'manual' }}</div>
            </div>
            <div class="au-field">
              <span class="au-field__label">Last fetch</span>
              <div class="au-muted">{{ dateLabel(detailSource.lastFetchedAt) }}</div>
              <div class="au-muted" *ngIf="detailSource.lastHttpStatus">HTTP {{ detailSource.lastHttpStatus }} · {{ detailSource.notModifiedCount }} not-modified</div>
            </div>
            <div class="au-field">
              <span class="au-field__label">Last new item</span>
              <div class="au-muted">{{ dateLabel(detailSource.lastNewItemAt ?? null) }}</div>
            </div>
            <div class="au-field au-field--wide" *ngIf="detailSource.lastError">
              <span class="au-field__label">Last error</span>
              <div class="au-muted">{{ detailSource.lastError }}</div>
            </div>
            <div class="au-field au-field--wide" *ngIf="detailSource.restrictionsNote">
              <span class="au-field__label">Restrictions</span>
              <div class="au-muted">{{ detailSource.restrictionsNote }}</div>
            </div>
            <div class="au-field" *ngIf="detailSource.health">
              <span class="au-field__label">Fetch stats</span>
              <div class="au-muted">
                {{ detailSource.health.successfulFetches }} ok / {{ detailSource.health.failedFetches }} failed ·
                {{ detailSource.health.itemsDiscovered }} items ·
                {{ detailSource.health.rateLimitEvents }} rate-limit events ·
                circuit {{ detailSource.health.circuitState }}
              </div>
            </div>
          </div>
          <div class="au-inline au-mb-3">
            <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="fetch(detailSource)" [disabled]="fetching[detailSource.id]">
              <app-icon name="refresh"></app-icon>
              Refresh now
            </button>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="verify(detailSource)">
              <app-icon name="shield-check"></app-icon>
              Verify endpoint
            </button>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="test(detailSource)">
              <app-icon name="circle-check"></app-icon>
              Test connection
            </button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="markUnsupported(detailSource)">Mark unsupported</button>
          </div>
          <h3 class="au-panel__title">Recent runs</h3>
          <app-empty-state *ngIf="runs.length === 0" icon="sources" title="No runs yet" text="Trigger a refresh to see discovery runs here."></app-empty-state>
          <div class="au-table-wrap" *ngIf="runs.length > 0">
            <table class="au-table">
              <thead>
                <tr><th>Started</th><th>Status</th><th>Duration</th><th>Found</th><th>Created</th><th>Duplicates</th><th>Error</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let run of runs">
                  <td class="au-nowrap au-muted">{{ dateLabel(run.startedAt) }}</td>
                  <td>
                    <span class="au-badge" [class.au-badge--success]="run.status === 'succeeded'" [class.au-badge--danger]="run.status === 'failed'" [class.au-badge--neutral]="run.status === 'skipped' || run.status === 'running'">{{ run.status }}</span>
                  </td>
                  <td class="au-muted">{{ run.durationMs !== null ? run.durationMs + ' ms' : '—' }}</td>
                  <td>{{ run.itemsFound }}</td>
                  <td>{{ run.itemsCreated }}</td>
                  <td>{{ run.itemsDuplicated }}</td>
                  <td class="au-muted au-truncate" style="max-width: 240px">{{ run.errorMessage || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Source packs -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'packs'">
        <h2 class="au-panel__title">Source packs</h2>
        <p class="au-panel__subtitle au-mb-3">Optional bootstrap configuration. Importing a pack creates ordinary sources — the database remains the runtime source of truth.</p>
        <app-empty-state *ngIf="packs.length === 0" icon="sources" title="No packs available" text="Source packs appear here when the backend registers them."></app-empty-state>
        <div class="au-connection-grid" *ngIf="packs.length > 0">
          <article class="au-connection-card" *ngFor="let pack of packs">
            <div class="au-connection-card__head">
              <div class="au-flex-1">
                <h2>{{ pack.name }}</h2>
                <p>{{ pack.description }}</p>
              </div>
              <span class="au-badge au-badge--outline">{{ pack.key }}</span>
            </div>
            <p class="au-muted au-mb-2">
              {{ pack.entryCount }} sources · {{ pack.providerCount }} enrichment providers ·
              {{ pack.importedSourceCount }} already imported
            </p>
            <details class="au-details au-mb-2">
              <summary class="au-details__summary">Sources in this pack</summary>
              <ul class="au-list">
                <li class="au-list__item" *ngFor="let entry of pack.entries">
                  <div class="au-flex-1">
                    <span class="au-table__title">{{ entry.name }}</span>
                    <span class="au-badge au-badge--outline au-ml-1">{{ entry.adapter }}</span>
                    <span class="au-badge au-badge--neutral au-ml-1">{{ entry.discoveryMethod }}</span>
                    <div class="au-truncate au-muted" style="max-width: 520px">{{ entry.endpoint }}</div>
                    <div class="au-muted" *ngIf="entry.notes">{{ entry.notes }}</div>
                  </div>
                </li>
              </ul>
            </details>
            <label class="au-check au-mb-2">
              <input type="checkbox" [(ngModel)]="importEnabled" />
              Enable sources after import
            </label>
            <label class="au-check au-mb-2">
              <input type="checkbox" [(ngModel)]="importWithProviders" />
              Also create enrichment providers (TMDB, OMDb, YouTube…)
            </label>
            <div class="au-inline">
              <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="importPack(pack.key)" [disabled]="importingPack === pack.key">
                {{ importingPack === pack.key ? 'Importing…' : 'Import pack' }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- Enrichment providers -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'enrichment'">
        <h2 class="au-panel__title">Enrichment providers</h2>
        <p class="au-panel__subtitle au-mb-3">Structured-data APIs (TMDB, OMDb, YouTube Data API…). Independent from editorial sources. Credentials are server-side env-var references — API keys never reach the browser.</p>
        <app-empty-state *ngIf="providers.length === 0" icon="sources" title="No enrichment providers" text="Import the movie-tv-en pack or add a provider manually."></app-empty-state>
        <div class="au-table-wrap" *ngIf="providers.length > 0">
          <table class="au-table">
            <thead>
              <tr><th>Provider</th><th>Type</th><th>Endpoint</th><th>Credential</th><th>Status</th><th>Verified</th><th style="width: 130px"></th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let provider of providers">
                <td><span class="au-table__title">{{ provider.name }}</span><span class="au-table__sub">{{ provider.key }}</span></td>
                <td><span class="au-badge au-badge--outline">{{ provider.providerType }}</span></td>
                <td class="au-muted au-truncate" style="max-width: 260px">{{ provider.baseUrl ?? '—' }}{{ provider.endpoint ?? '' }}</td>
                <td>
                  <span class="au-badge au-badge--success" *ngIf="provider.credentialsConfigured">configured</span>
                  <span class="au-badge au-badge--warning" *ngIf="!provider.credentialsConfigured">{{ provider.credentialsRef ?? 'no ref' }}</span>
                </td>
                <td>
                  <span class="au-badge" [class.au-badge--success]="provider.enabled" [class.au-badge--neutral]="!provider.enabled">{{ provider.enabled ? 'enabled' : 'disabled' }}</span>
                </td>
                <td>
                  <span class="au-badge au-badge--success" *ngIf="provider.verificationStatus === 'verified'">verified</span>
                  <span class="au-badge au-badge--danger" *ngIf="provider.verificationStatus === 'unsupported'">unsupported</span>
                  <span class="au-badge au-badge--neutral" *ngIf="provider.verificationStatus !== 'verified' && provider.verificationStatus !== 'unsupported'">{{ provider.verificationStatus ?? 'unverified' }}</span>
                </td>
                <td>
                  <div class="au-inline">
                    <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="testProvider(provider)" [disabled]="testingProvider === provider.id">Test</button>
                    <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="toggleProvider(provider)">{{ provider.enabled ? 'Disable' : 'Enable' }}</button>
                    <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="removeProvider(provider)">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="au-panel au-panel--padded au-mb-3" *ngIf="providerTestResult">
          <h3 class="au-panel__title">Provider test result</h3>
          <div class="au-muted">{{ providerTestResult }}</div>
        </div>
        <details class="au-details">
          <summary class="au-details__summary">Add provider</summary>
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Key</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.key" placeholder="tmdb" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Name</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.name" placeholder="TMDB (The Movie Database)" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Provider type</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.providerType" placeholder="tmdb | omdb | youtube | custom" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Base URL</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.baseUrl" placeholder="https://api.themoviedb.org/3" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Endpoint path</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.endpoint" placeholder="/trending/movie/week" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Credentials ref (env var name)</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.credentialsRef" placeholder="TMDB_API_KEY" />
              <span class="au-field__hint">Server-side secret reference. The key itself is never stored or returned.</span>
            </label>
          </div>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="button" (click)="addProvider()" [disabled]="savingProvider">{{ savingProvider ? 'Saving…' : 'Add provider' }}</button>
          </div>
        </details>
      </section>
    </section>
  `,
})
export class SourcesPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  sourceTypes: SourceType[] = ['rss', 'atom', 'html', 'sitemap', 'api', 'htmllist', 'imdb', 'manual'];
  sources: StudioSource[] = [];
  sites: StudioSite[] = [];
  showForm = false;
  saving = false;
  editingId: string | null = null;
  fetching: Record<string, boolean> = {};
  feedback = '';
  view: 'active' | 'packs' | 'enrichment' | 'recommendations' | 'discovered' | 'blocked' = 'active';
  recommendations: SourceRecommendation[] = [];
  domains: DiscoveredDomain[] = [];
  blockedDomains: BlockedDomain[] = [];
  busyRecommendation = '';
  runningDiscovery = false;
  includeArchived = false;

  // Feed discovery + draft test
  discoveringFeeds = false;
  testingDraft = false;
  feedCandidates: StudioFeedCandidate[] = [];
  discoveryResult: StudioFeedDiscoveryResult | null = null;
  discoveredHostname = '';
  draftTest: { ok: boolean; itemCount?: number; sample?: Array<Record<string, unknown>>; message?: string } | null = null;

  // Bulk operations
  selected = new Set<string>();
  bulkRunning = false;
  bulkFeedback = '';
  bulkCategory = '';
  bulkSiteId: string | null = null;

  // Source detail & runs
  detailSource: StudioSource | null = null;
  detailId: string | null = null;
  runs: Array<{
    id: string;
    runKey: string;
    status: string;
    startedAt: string;
    durationMs: number | null;
    itemsFound: number;
    itemsCreated: number;
    itemsDuplicated: number;
    errorMessage: string | null;
  }> = [];

  // Source packs
  packs: StudioSourcePack[] = [];
  importingPack = '';
  importEnabled = true;
  importWithProviders = false;

  // Enrichment providers
  providers: StudioEnrichmentProvider[] = [];
  testingProvider = '';
  savingProvider = false;
  providerTestResult = '';
  providerForm = { key: '', name: '', providerType: '', baseUrl: '', endpoint: '', credentialsRef: '' };

  form = {
    name: '',
    type: 'rss' as SourceType,
    url: '',
    domain: '',
    siteId: null as string | null,
    refreshIntervalMinutes: 30,
    priority: 0,
    trustScore: 0.5,
    authorityScore: 0.5,
    language: 'es',
    country: '',
    categoriesText: '',
    tagsText: '',
    configurationText: '',
    rateLimitsText: '',
    extractionPolicyText: '',
    respectRobots: true,
    discoveryMethod: '' as string,
  };
  private refreshSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.load();
    this.loadRecommendations();
    this.loadDiscovered();
    this.loadBlocked();
    this.loadPacks();
    this.loadProviders();
    this.refreshSubscription = timer(45_000, 45_000).subscribe(() => this.load(true));
  }

  setView(view: 'active' | 'packs' | 'enrichment' | 'recommendations' | 'discovered' | 'blocked'): void {
    this.view = view;
    if (view === 'recommendations') this.loadRecommendations();
    if (view === 'discovered') this.loadDiscovered();
    if (view === 'blocked') this.loadBlocked();
    if (view === 'packs') this.loadPacks();
    if (view === 'enrichment') this.loadProviders();
  }

  loadRecommendations(): void {
    this.api.listSourceRecommendations(1, 50, 'open').subscribe({
      next: (response) => { this.recommendations = response.items; },
      error: () => { this.recommendations = []; },
    });
  }

  loadDiscovered(): void {
    this.api.listDiscoveredDomains(1, 50).subscribe({
      next: (response) => { this.domains = response.items; },
      error: () => { this.domains = []; },
    });
  }

  loadBlocked(): void {
    this.api.listBlockedDomains().subscribe({
      next: (response) => { this.blockedDomains = response.items; },
      error: () => { this.blockedDomains = []; },
    });
  }

  acceptRecommendation(recommendation: SourceRecommendation): void {
    this.busyRecommendation = recommendation.id;
    this.api.acceptSourceRecommendation(recommendation.id).subscribe({
      next: () => {
        this.busyRecommendation = '';
        this.toast.success(`${recommendation.domain} added as a source.`);
        this.loadRecommendations();
        this.load();
      },
      error: (error) => {
        this.busyRecommendation = '';
        this.feedback = String(error?.error?.message ?? 'Could not add the source.');
      },
    });
  }

  dismissRecommendation(recommendation: SourceRecommendation): void {
    this.busyRecommendation = recommendation.id;
    this.api.dismissSourceRecommendation(recommendation.id).subscribe({
      next: () => {
        this.busyRecommendation = '';
        this.toast.success('Recommendation dismissed.');
        this.loadRecommendations();
      },
      error: () => { this.busyRecommendation = ''; },
    });
  }

  blockDomain(domain: string): void {
    this.api.blockDiscoveredDomain(domain).subscribe({
      next: () => {
        this.toast.success(`${domain} blocked from discovery.`);
        this.loadDiscovered();
        this.loadBlocked();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Could not block the domain.');
      },
    });
  }

  unblockDomain(domain: string): void {
    this.api.unblockDiscoveredDomain(domain).subscribe({
      next: () => {
        this.toast.success(`${domain} unblocked.`);
        this.loadBlocked();
        this.loadDiscovered();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Could not unblock the domain.');
      },
    });
  }

  runDiscovery(): void {
    this.runningDiscovery = true;
    this.api.runDiscoveryNow().subscribe({
      next: () => {
        this.runningDiscovery = false;
        this.toast.success('AI discovery started. Results appear shortly.');
        setTimeout(() => this.loadDiscovered(), 4000);
      },
      error: (error) => {
        this.runningDiscovery = false;
        this.feedback = String(error?.error?.message ?? 'Discovery could not be started.');
      },
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  load(silent = false): void {
    this.api.listSourcesWithHealth(1, 200, this.includeArchived).subscribe({
      next: (response) => {
        this.sources = response.items;
        if (this.detailId) {
          const refreshed = response.items.find((item) => item.id === this.detailId);
          if (refreshed) {
            this.detailSource = refreshed;
          }
        }
      },
      error: () => {
        if (!silent) {
          this.sources = [];
        }
      },
    });
  }

  save(): void {
    if (!this.form.name.trim()) {
      this.feedback = 'Name is required.';
      return;
    }
    let configuration: Record<string, unknown> | undefined;
    if (this.form.configurationText.trim()) {
      try {
        const parsed = JSON.parse(this.form.configurationText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        configuration = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Configuration must be valid JSON.';
        return;
      }
    }
    let rateLimitPolicy: Record<string, unknown> | undefined;
    if (this.form.rateLimitsText.trim()) {
      try {
        const parsed = JSON.parse(this.form.rateLimitsText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        rateLimitPolicy = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Rate limits must be valid JSON.';
        return;
      }
    }
    let extractionPolicy: Record<string, unknown> | undefined;
    if (this.form.extractionPolicyText.trim()) {
      try {
        const parsed = JSON.parse(this.form.extractionPolicyText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        extractionPolicy = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Extraction policy must be valid JSON.';
        return;
      }
    }
    const payload = {
      name: this.form.name.trim(),
      type: this.form.type,
      url: this.form.type === 'manual' ? undefined : this.form.url.trim(),
      domain: this.form.domain.trim() || undefined,
      siteId: this.form.siteId ?? undefined,
      refreshIntervalMinutes: Math.max(5, this.form.refreshIntervalMinutes),
      priority: this.form.priority,
      trustScore: this.form.trustScore,
      authorityScore: this.form.authorityScore,
      language: this.form.language || 'es',
      country: this.form.country.trim() || undefined,
      categories: this.form.categoriesText.split(',').map((item) => item.trim()).filter(Boolean),
      tags: this.form.tagsText.split(',').map((item) => item.trim()).filter(Boolean),
      configuration,
      rateLimitPolicy,
      robotsPolicy: { respect: this.form.respectRobots },
      extractionPolicy,
      discoveryMethod: this.form.discoveryMethod || undefined,
    };
    this.saving = true;
    const request = this.editingId
      ? this.api.updateSource(this.editingId, payload)
      : this.api.createSource(payload);
    request.subscribe({
      next: () => {
        this.saving = false;
        this.resetForm();
        this.toast.success('Source saved.');
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.feedback = String(error?.error?.message ?? 'Failed to save source.');
      },
    });
  }

  edit(source: StudioSource): void {
    this.editingId = source.id;
    this.form = {
      name: source.name,
      type: source.type,
      url: source.url ?? '',
      domain: source.domain ?? '',
      siteId: source.siteId,
      refreshIntervalMinutes: source.refreshIntervalMinutes,
      priority: source.priority,
      trustScore: source.trustScore,
      authorityScore: source.authorityScore ?? 0.5,
      language: source.language,
      country: source.country ?? '',
      categoriesText: (source.categories ?? []).join(', '),
      tagsText: (source.tags ?? []).join(', '),
      configurationText: source.configuration ? JSON.stringify(source.configuration, null, 2) : '',
      rateLimitsText: '',
      extractionPolicyText: '',
      respectRobots: true,
      discoveryMethod: source.discoveryMethod ?? '',
    };
    this.showForm = true;
  }

  resetForm(): void {
    this.editingId = null;
    this.showForm = false;
    this.feedCandidates = [];
    this.discoveryResult = null;
    this.draftTest = null;
    this.form = {
      name: '',
      type: 'rss',
      url: '',
      domain: '',
      siteId: null,
      refreshIntervalMinutes: 30,
      priority: 0,
      trustScore: 0.5,
      authorityScore: 0.5,
      language: 'es',
      country: '',
      categoriesText: '',
      tagsText: '',
      configurationText: '',
      rateLimitsText: '',
      extractionPolicyText: '',
      respectRobots: true,
      discoveryMethod: '',
    };
  }

  // ── Feed discovery ───────────────────────────────────────────────────

  discoverFeeds(): void {
    const target = this.form.url.trim();
    if (!target) {
      this.feedback = 'Enter a URL or domain to discover feeds.';
      return;
    }
    this.discoveringFeeds = true;
    this.feedback = '';
    this.api.discoverFeeds(target).subscribe({
      next: (result) => {
        this.discoveringFeeds = false;
        this.discoveryResult = result;
        this.discoveredHostname = result.hostname;
        this.feedCandidates = result.candidates.filter((candidate) => candidate.verified || candidate.type === 'feed');
        if (result.errors.length > 0 && this.feedCandidates.length === 0) {
          this.feedback = `Discovery issues: ${result.errors.join('; ')}`;
        }
      },
      error: (error) => {
        this.discoveringFeeds = false;
        this.feedback = String(error?.error?.message ?? 'Feed discovery failed.');
      },
    });
  }

  useCandidate(candidate: StudioFeedCandidate): void {
    this.form.url = candidate.url;
    this.form.domain = this.discoveredHostname || this.form.domain;
    this.form.type = candidate.type === 'atom' ? 'atom' : candidate.type === 'sitemap' || candidate.type === 'news_sitemap' ? 'sitemap' : 'rss';
    this.form.discoveryMethod = candidate.method;
    this.toast.success(`Endpoint selected: ${candidate.url}`);
  }

  testDraft(): void {
    if (!this.form.url.trim() || this.form.type === 'manual') {
      return;
    }
    this.testingDraft = true;
    let configuration: Record<string, unknown> | undefined;
    if (this.form.configurationText.trim()) {
      try {
        configuration = JSON.parse(this.form.configurationText) as Record<string, unknown>;
      } catch {
        this.feedback = 'Configuration must be valid JSON before testing.';
        this.testingDraft = false;
        return;
      }
    }
    this.api.testSourceDraft(this.form.type, this.form.url.trim(), configuration).subscribe({
      next: (result) => {
        this.testingDraft = false;
        this.draftTest = result;
        if (!result.ok) {
          this.feedback = String(result.message ?? 'Test failed.');
        }
      },
      error: (error) => {
        this.testingDraft = false;
        this.draftTest = { ok: false, message: String(error?.error?.message ?? 'Test failed.') };
      },
    });
  }

  // ── Bulk operations ──────────────────────────────────────────────────

  toggleSelect(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selected.clear();
    } else {
      this.selected = new Set(this.sources.map((source) => source.id));
    }
  }

  allSelected(): boolean {
    return this.sources.length > 0 && this.sources.every((source) => this.selected.has(source.id));
  }

  bulkAction(action: string): void {
    const ids = Array.from(this.selected);
    if (ids.length === 0) {
      return;
    }
    const runBulk = () => {
      this.bulkRunning = true;
      this.bulkFeedback = '';
      this.api.bulkSources({ ids, action, category: this.bulkCategory.trim() || undefined, siteId: this.bulkSiteId ?? undefined }).subscribe({
        next: (result) => {
          this.bulkRunning = false;
          this.selected.clear();
          this.bulkFeedback = `${result.succeeded} succeeded, ${result.failed} failed.`;
          if (result.failed > 0) {
            const firstError = result.results.find((item) => !item.ok)?.error;
            this.toast.error(`Bulk ${action}: ${result.failed} failed${firstError ? ` — ${firstError}` : ''}.`);
          } else {
            this.toast.success(`Bulk ${action} complete.`);
          }
          this.load();
        },
        error: (error) => {
          this.bulkRunning = false;
          this.feedback = String(error?.error?.message ?? 'Bulk operation failed.');
        },
      });
    };
    if (action === 'delete') {
      void this.confirm.confirm({
        title: `Delete ${ids.length} source(s)?`,
        message: 'Discovered stories stay in the inbox but these sources stop refreshing. This cannot be undone.',
        confirmLabel: `Delete ${ids.length} sources`,
        danger: true,
      }).then((confirmed) => {
        if (confirmed) {
          runBulk();
        }
      });
      return;
    }
    runBulk();
  }

  // ── Source detail & runs ─────────────────────────────────────────────

  openDetail(source: StudioSource): void {
    this.detailSource = source;
    this.detailId = source.id;
    this.runs = [];
    this.loadRuns(source.id);
  }

  closeDetail(): void {
    this.detailSource = null;
    this.detailId = null;
    this.runs = [];
  }

  loadRuns(sourceId: string): void {
    this.api.listSourceRuns(sourceId, 1, 10).subscribe({
      next: (response) => {
        this.runs = response.items;
      },
      error: () => {
        this.runs = [];
      },
    });
  }

  verify(source: StudioSource): void {
    this.feedback = `Verifying ${source.name}…`;
    this.api.verifySource(source.id).subscribe({
      next: (result) => {
        if (result.ok) {
          this.toast.success(`${source.name} verified (HTTP ${result.status ?? '?'}, ${result.itemCount ?? 0} items).`);
        } else {
          this.toast.error(`Verification failed: ${result.error}`);
        }
        this.load();
        if (this.detailId === source.id) {
          this.loadRuns(source.id);
        }
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Verification failed.');
      },
    });
  }

  markUnsupported(source: StudioSource): void {
    void this.confirm.confirm({
      title: `Mark "${source.name}" as unsupported?`,
      message: 'The source will be disabled and labelled unsupported with the configured restrictions note.',
      confirmLabel: 'Mark unsupported',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.markSourceUnsupported(source.id, 'unsupported').subscribe({
        next: () => {
          this.toast.success('Source marked as unsupported.');
          this.load();
        },
        error: (error) => {
          this.feedback = String(error?.error?.message ?? 'Update failed.');
        },
      });
    });
  }

  archive(source: StudioSource): void {
    void this.confirm.confirm({
      title: `Archive "${source.name}"?`,
      message: 'The source stops refreshing and is hidden from the default list (Archived view shows it).',
      confirmLabel: 'Archive source',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.updateSource(source.id, { archived: true }).subscribe({
        next: () => {
          this.toast.success('Source archived.');
          this.load();
        },
        error: (error) => {
          this.feedback = String(error?.error?.message ?? 'Archive failed.');
        },
      });
    });
  }

  // ── Source packs ─────────────────────────────────────────────────────

  loadPacks(): void {
    this.api.listSourcePacks().subscribe({
      next: (response) => {
        this.packs = response.items;
      },
      error: () => {
        this.packs = [];
      },
    });
  }

  importPack(packKey: string): void {
    this.importingPack = packKey;
    this.api.importSourcePack(packKey, this.importEnabled, this.importWithProviders).subscribe({
      next: (result) => {
        this.importingPack = '';
        this.toast.success(`Pack imported: ${result.imported} sources, ${result.skipped} skipped, ${result.failed} failed.`);
        if (result.errors.length > 0) {
          this.feedback = result.errors.join('; ');
        }
        this.load();
        this.loadPacks();
        this.loadProviders();
      },
      error: (error) => {
        this.importingPack = '';
        this.feedback = String(error?.error?.message ?? 'Import failed.');
      },
    });
  }

  // ── Enrichment providers ─────────────────────────────────────────────

  loadProviders(): void {
    this.api.listEnrichmentProviders(1, 50).subscribe({
      next: (response) => {
        this.providers = response.items;
      },
      error: () => {
        this.providers = [];
      },
    });
  }

  addProvider(): void {
    if (!this.providerForm.key.trim() || !this.providerForm.name.trim() || !this.providerForm.providerType.trim()) {
      this.feedback = 'Key, name and provider type are required.';
      return;
    }
    this.savingProvider = true;
    this.api.createEnrichmentProvider({
      key: this.providerForm.key.trim(),
      name: this.providerForm.name.trim(),
      providerType: this.providerForm.providerType.trim(),
      baseUrl: this.providerForm.baseUrl.trim() || undefined,
      endpoint: this.providerForm.endpoint.trim() || undefined,
      credentialsRef: this.providerForm.credentialsRef.trim() || undefined,
    }).subscribe({
      next: () => {
        this.savingProvider = false;
        this.providerForm = { key: '', name: '', providerType: '', baseUrl: '', endpoint: '', credentialsRef: '' };
        this.toast.success('Enrichment provider added.');
        this.loadProviders();
      },
      error: (error) => {
        this.savingProvider = false;
        this.feedback = String(error?.error?.message ?? 'Could not add provider.');
      },
    });
  }

  testProvider(provider: StudioEnrichmentProvider): void {
    this.testingProvider = provider.id;
    this.providerTestResult = '';
    this.api.testEnrichmentProvider(provider.id).subscribe({
      next: (result) => {
        this.testingProvider = '';
        const credentialNote = result.credentialsConfigured ? 'credentials configured' : 'credentials NOT configured';
        this.providerTestResult = result.ok
          ? `OK (HTTP ${result.status ?? '?'}, ${result.itemCount ?? 0} items, ${credentialNote}). Sample: ${(result.sample ?? []).map((item) => String(item['title'] ?? '')).join(' | ')}`
          : `Failed (${credentialNote}): ${result.message ?? 'unknown error'}`;
        this.loadProviders();
      },
      error: (error) => {
        this.testingProvider = '';
        this.providerTestResult = String(error?.error?.message ?? 'Provider test failed.');
      },
    });
  }

  toggleProvider(provider: StudioEnrichmentProvider): void {
    this.api.updateEnrichmentProvider(provider.id, { enabled: !provider.enabled }).subscribe({
      next: () => {
        this.toast.success(provider.enabled ? 'Provider disabled.' : 'Provider enabled.');
        this.loadProviders();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Update failed.');
      },
    });
  }

  removeProvider(provider: StudioEnrichmentProvider): void {
    void this.confirm.confirm({
      title: `Delete enrichment provider "${provider.name}"?`,
      message: 'Enrichment lookups through this provider stop immediately.',
      confirmLabel: 'Delete provider',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.deleteEnrichmentProvider(provider.id).subscribe({
        next: () => {
          this.toast.success('Provider deleted.');
          this.loadProviders();
        },
        error: (error) => {
          this.feedback = String(error?.error?.message ?? 'Delete failed.');
        },
      });
    });
  }

  // ── Health presentation ──────────────────────────────────────────────

  healthLabel(source: StudioSource): string {
    const state = source.uiHealth?.state ?? (source.archivedAt ? 'archived' : source.enabled ? 'unknown' : 'disabled');
    const labels: Record<string, string> = {
      healthy: 'Healthy',
      delayed: 'Delayed',
      degraded: 'Degraded',
      rate_limited: 'Rate limited',
      broken: 'Broken',
      disabled: 'Disabled',
      archived: 'Archived',
      unknown: 'Unknown',
    };
    return labels[state] ?? 'Unknown';
  }

  healthClass(source: StudioSource): string {
    const state = source.uiHealth?.state ?? 'unknown';
    switch (state) {
      case 'healthy':
        return 'au-badge--success';
      case 'delayed':
      case 'degraded':
        return 'au-badge--warning';
      case 'rate_limited':
      case 'broken':
        return 'au-badge--danger';
      default:
        return 'au-badge--neutral';
    }
  }

  healthTitle(source: StudioSource): string {
    return (source.uiHealth?.diagnostics ?? []).join('\n');
  }

  healthDiagnostics(source: StudioSource): string[] {
    return source.uiHealth?.diagnostics ?? [];
  }

  test(source: StudioSource): void {
    this.feedback = `Testing ${source.name}…`;
    this.api.testSource(source.id).subscribe({
      next: (result) => {
        if (result.ok) {
          this.toast.success(`${source.name}: test OK, ${result.itemCount ?? 0} items returned.`);
        } else {
          this.toast.error(`Test failed: ${result.message}`);
        }
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Test failed.');
      },
    });
  }

  fetch(source: StudioSource): void {
    this.fetching[source.id] = true;
    this.api.fetchSource(source.id).subscribe({
      next: (result) => {
        this.fetching[source.id] = false;
        if (result.failed) {
          this.toast.error(`Fetch failed: ${result.error}`);
        } else if (result.notModified) {
          this.toast.success(`${source.name}: unchanged (HTTP 304) — skipped download.`);
        } else {
          this.toast.success(`Fetch complete: ${result.created} new, ${result.duplicates} duplicates.`);
        }
        this.load(true);
        if (this.detailId === source.id) {
          this.loadRuns(source.id);
        }
      },
      error: (error) => {
        this.fetching[source.id] = false;
        this.feedback = String(error?.error?.message ?? 'Fetch failed.');
      },
    });
  }

  toggle(source: StudioSource): void {
    this.api.updateSource(source.id, { enabled: !source.enabled }).subscribe({
      next: () => {
        this.toast.success(source.enabled ? 'Source disabled.' : 'Source enabled.');
        this.load();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Update failed.');
      },
    });
  }

  remove(source: StudioSource): void {
    void this.confirmRemove(source);
  }

  private async confirmRemove(source: StudioSource): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Delete source "${source.name}"?`,
      message: 'Discovered stories stay in the inbox but will no longer refresh.',
      confirmLabel: 'Delete source',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.deleteSource(source.id).subscribe({
      next: () => {
        this.toast.success('Source deleted.');
        this.load();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Delete failed.');
      },
    });
  }

  dateLabel(value: unknown): string {
    if (!value) {
      return '—';
    }
    return new Date(String(value)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  categoriesLabel(item: Record<string, unknown>): string {
    const categories = item['categories'];
    return Array.isArray(categories) ? (categories as string[]).join(', ') : '';
  }
}
