import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { EditorialContextService } from '../../services/editorial-context.service';
import { ToastService } from '../../services/toast.service';
import { AppEmptyStateComponent } from '../ui/app-empty-state.component';
import { AppIconComponent } from '../ui/app-icon.component';
import { SiteSource, SiteSourceRecommendation, SourceConfigPatchBody, SourceDiagnostics, SourceItemRow, SourceTestResult, SourcesApiService } from '../../services/sources-api.service';

const list = (value: string): string[] => value.split(',').map((entry) => entry.trim()).filter(Boolean);

@Component({
  selector: 'app-site-source-registry',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent],
  styles: [
    `
      .reg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--au-s3); }
      .reg-card { border: 1px solid var(--au-border); border-radius: var(--au-radius, 8px); padding: var(--au-s3); background: var(--au-surface); display: flex; flex-direction: column; gap: 8px; }
      .reg-card h3 { margin: 0; font-size: var(--au-fs-body); overflow-wrap: anywhere; }
      .reg-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .reg-muted { color: var(--au-muted); font-size: var(--au-fs-body-sm); overflow-wrap: anywhere; }
      .reg-notice { border-left: 3px solid var(--au-info); padding: 8px 12px; background: var(--au-info-soft); margin-bottom: var(--au-s3); font-size: var(--au-fs-body-sm); }
      .reg-detail { border-top: 1px solid var(--au-border); padding-top: 8px; display: grid; gap: 8px; }
      .reg-detail ul { margin: 0; padding-left: 18px; }
      .reg-err { color: var(--au-danger); }
      .reg-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
    `,
  ],
  template: `
    <p class="reg-notice" role="note">
      <strong>Ingestion is not republication.</strong> Accepting a source lets Auctorio read its titles and links as research evidence. It does not grant
      permission to republish or copy its content.
    </p>

    <div class="au-toolbar au-toolbar--panel au-mb-3">
      <button class="au-btn au-btn--primary" type="button" [disabled]="busy()" (click)="discover()"><app-icon name="sparkles"></app-icon>{{ busy() ? 'Discovering...' : 'Discover sources' }}</button>
      <button class="au-btn au-btn--secondary" type="button" (click)="showAdd.set(!showAdd())"><app-icon name="plus"></app-icon>Add manually</button>
      <span class="au-toolbar__spacer"></span>
      <input class="au-input au-input--search" type="search" placeholder="Filter by name, URL or topic" aria-label="Filter sources" [ngModel]="search()" (ngModelChange)="search.set($event)" />
      <select class="au-select" aria-label="Relationship" [ngModel]="relationship()" (ngModelChange)="relationship.set($event)">
        <option value="">All relationships</option>
        <option value="first_party">First-party</option>
        <option value="external">External</option>
      </select>
      <select class="au-select" aria-label="Layout" [ngModel]="layout()" (ngModelChange)="layout.set($event)">
        <option value="cards">Cards</option>
        <option value="list">List</option>
      </select>
    </div>

    <form class="au-panel au-panel--padded au-mb-3 reg-form" *ngIf="showAdd()" (ngSubmit)="addManual()">
      <label class="au-field"><span class="au-field__label">Feed or site URL</span><input class="au-input" name="url" required [(ngModel)]="draft.url" /></label>
      <label class="au-field"><span class="au-field__label">Name (optional)</span><input class="au-input" name="name" [(ngModel)]="draft.name" /></label>
      <label class="au-field"><span class="au-field__label">Topics (comma separated)</span><input class="au-input" name="topics" [(ngModel)]="draft.topics" /></label>
      <label class="au-field"><span class="au-field__label">Language</span><input class="au-input" name="language" [(ngModel)]="draft.language" placeholder="es" /></label>
      <div class="reg-row"><button class="au-btn au-btn--primary" type="submit" [disabled]="!draft.url.trim()">Add source</button></div>
    </form>

    <!-- Recommendations -->
    <section class="au-panel au-panel--padded au-mb-3" aria-labelledby="reg-rec">
      <div class="reg-row au-mb-2">
        <h2 class="au-panel__title" id="reg-rec">Recommended sources ({{ openRecommendations().length }})</h2>
        <span class="au-toolbar__spacer"></span>
        <ng-container *ngIf="selected().size > 0">
          <span class="reg-muted">{{ selected().size }} selected</span>
          <button class="au-btn au-btn--sm au-btn--primary" type="button" (click)="bulk('accept')">Accept selected</button>
          <button class="au-btn au-btn--sm au-btn--secondary" type="button" (click)="bulk('reject')">Reject selected</button>
        </ng-container>
      </div>
      <app-empty-state *ngIf="openRecommendations().length === 0" icon="sources" title="No open recommendations" text="Run Discover sources to find first-party feeds and external sources for this site's topics."></app-empty-state>
      <div [class.reg-grid]="layout() === 'cards'" [style.display]="layout() === 'list' ? 'grid' : null" [style.gap]="layout() === 'list' ? '8px' : null">
        <article class="reg-card" *ngFor="let rec of openRecommendations(); trackBy: trackId">
          <div class="reg-row">
            <input type="checkbox" [attr.aria-label]="'Select ' + (rec.name || rec.domain)" [checked]="selected().has(rec.id)" (change)="toggle(rec.id)" />
            <h3>{{ rec.name || rec.domain }}</h3>
            <span class="au-badge" [ngClass]="rec.relationship === 'first_party' ? 'au-badge--brand' : 'au-badge--neutral'">{{ rec.relationship === 'first_party' ? 'First-party' : 'External' }}</span>
            <span class="au-badge au-badge--outline">{{ rec.type || 'feed' }}</span>
          </div>
          <a class="reg-muted" [href]="rec.url" target="_blank" rel="noopener noreferrer">{{ rec.url }}</a>
          <div class="reg-row">
            <span class="au-badge" [ngClass]="rec.verificationStatus === 'verified' ? 'au-badge--success' : 'au-badge--warning'">{{ rec.verificationStatus || 'unverified' }}</span>
            <span class="au-badge au-badge--info" *ngIf="rec.trustLevel">Trust: {{ rec.trustLevel }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="rec.relevance">Relevance: {{ rec.relevance }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="rec.language">{{ rec.language }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="rec.geography">{{ rec.geography }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="rec.category">{{ rec.category }}</span>
          </div>
          <p class="reg-muted" *ngIf="rec.assessmentReason">{{ rec.assessmentReason }}</p>
          <div class="reg-row" *ngIf="rec.topics?.length"><span class="au-badge au-badge--outline" *ngFor="let t of rec.topics">{{ t }}</span></div>
          <p class="reg-muted" *ngIf="rec.expectedFreshness || rec.lastCheckedAt">
            Freshness: {{ rec.expectedFreshness || 'unknown' }} <span *ngIf="rec.lastCheckedAt"> - checked {{ rec.lastCheckedAt | date: 'medium' }}</span>
          </p>
          <ul class="reg-muted" *ngIf="rec.limitations?.length"><li *ngFor="let l of rec.limitations">{{ l }}</li></ul>
          <div class="reg-row">
            <button class="au-btn au-btn--sm au-btn--primary" type="button" (click)="decide(rec, 'accept')">Accept</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="decide(rec, 'reject')">Reject</button>
          </div>
        </article>
      </div>
    </section>

    <!-- Managed sources -->
    <section class="au-panel au-panel--padded" aria-labelledby="reg-src">
      <div class="reg-row au-mb-2">
        <h2 class="au-panel__title" id="reg-src">Site sources ({{ filteredSources().length }})</h2>
        <span class="au-toolbar__spacer"></span>
        <select class="au-select" aria-label="State" [ngModel]="state()" (ngModelChange)="state.set($event)">
          <option value="">All states</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <app-empty-state *ngIf="filteredSources().length === 0" icon="sources" title="No sources for this site" text="Accept a recommendation or add a source manually."></app-empty-state>
      <div [class.reg-grid]="layout() === 'cards'" [style.display]="layout() === 'list' ? 'grid' : null" [style.gap]="layout() === 'list' ? '8px' : null">
        <article class="reg-card" *ngFor="let src of filteredSources(); trackBy: trackId">
          <div class="reg-row">
            <h3>{{ src.name }}</h3>
            <span class="au-badge" [ngClass]="src.state === 'active' ? 'au-badge--success' : src.state === 'paused' ? 'au-badge--warning' : 'au-badge--neutral'">{{ src.state }}</span>
            <span class="au-badge au-badge--outline">{{ src.type }}</span>
          </div>
          <a class="reg-muted" [href]="src.url" target="_blank" rel="noopener noreferrer">{{ src.url }}</a>
          <p class="reg-muted">{{ src.itemsCount }} items - every {{ src.refreshIntervalMinutes }} min - priority {{ src.priority }}<span *ngIf="src.lastFetchedAt"> - last fetch {{ src.lastFetchedAt | date: 'short' }}</span></p>
          <p class="reg-muted reg-err" *ngIf="src.lastError">{{ src.lastError }}</p>
          <div class="reg-row">
            <button class="au-btn au-btn--sm au-btn--secondary" type="button" [disabled]="testing() === src.id" (click)="test(src)">{{ testing() === src.id ? 'Testing...' : 'Test source' }}</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'active'" (click)="setState(src, 'pause')">Pause</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'paused'" (click)="setState(src, 'resume')">Resume</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state !== 'archived'" (click)="setState(src, 'archive')">Archive</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'archived'" (click)="setState(src, 'restore')">Restore</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="open(src)">{{ openId() === src.id ? 'Close' : 'Details' }}</button>
          </div>

          <div class="reg-detail" *ngIf="openId() === src.id">
            <p class="reg-muted" *ngIf="testResult() as r"><strong>{{ r.ok ? 'Extraction works' : 'Extraction failed' }}</strong> ({{ r.latencyMs }} ms)<span *ngIf="r.error" class="reg-err"> - {{ r.error }}</span></p>
            <ul *ngIf="testResult()?.items?.length"><li *ngFor="let i of testResult()!.items"><a [href]="i.url" target="_blank" rel="noopener noreferrer">{{ i.title }}</a></li></ul>

            <form class="reg-form" (ngSubmit)="save(src)">
              <label class="au-field"><span class="au-field__label">Feed URL</span><input class="au-input" name="url" [(ngModel)]="edit.url" /></label>
              <label class="au-field"><span class="au-field__label">Frequency (minutes)</span><input class="au-input" type="number" min="5" name="freq" [(ngModel)]="edit.refreshIntervalMinutes" /></label>
              <label class="au-field"><span class="au-field__label">Language</span><input class="au-input" name="lang" [(ngModel)]="edit.language" /></label>
              <label class="au-field"><span class="au-field__label">Priority</span><input class="au-input" type="number" name="prio" [(ngModel)]="edit.priority" /></label>
              <label class="au-field"><span class="au-field__label">Trust</span>
                <select class="au-select" name="trust" [(ngModel)]="edit.trustLevel"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
              </label>
              <label class="au-field"><span class="au-field__label">Topics</span><input class="au-input" name="topics" [(ngModel)]="edit.topics" /></label>
              <label class="au-field"><span class="au-field__label">Pillars</span><input class="au-input" name="pillars" [(ngModel)]="edit.pillars" /></label>
              <label class="au-field"><span class="au-field__label">Relevance keywords</span><input class="au-input" name="kw" [(ngModel)]="edit.keywords" /></label>
              <label class="au-field"><span class="au-field__label">Selectors (item=.card, title=h2)</span><input class="au-input" name="sel" [(ngModel)]="edit.selectors" /></label>
              <div class="reg-row"><button class="au-btn au-btn--primary au-btn--sm" type="submit">Save configuration</button></div>
            </form>

            <div *ngIf="diagnostics() as d">
              <p class="reg-muted">Health: {{ d.health?.healthStatus || 'unknown' }}<span *ngIf="d.health?.consecutiveFailures"> - {{ d.health?.consecutiveFailures }} consecutive failures</span></p>
              <ul class="reg-muted"><li *ngFor="let run of d.runs.slice(0, 5)">{{ run.startedAt | date: 'short' }} - {{ run.status }}<span class="reg-err" *ngIf="run.errorMessage"> - {{ run.errorMessage }}</span></li></ul>
            </div>
            <div>
              <strong class="reg-muted">Collected items</strong>
              <p class="reg-muted" *ngIf="items().length === 0">Nothing collected yet.</p>
              <ul><li *ngFor="let i of items()"><a [href]="i.canonicalUrl || i.sourceUrl" target="_blank" rel="noopener noreferrer">{{ i.title }}</a> <span class="reg-muted">{{ i.processingStatus }}</span></li></ul>
            </div>
          </div>
        </article>
      </div>
    </section>
  `,
})
export class SiteSourceRegistryComponent implements OnInit, OnDestroy {
  private readonly api = inject(SourcesApiService);
  private readonly app = inject(AppContextService);
  private readonly editorial = inject(EditorialContextService);
  private readonly toast = inject(ToastService);

  readonly recommendations = signal<SiteSourceRecommendation[]>([]);
  readonly sources = signal<SiteSource[]>([]);
  readonly search = signal('');
  readonly relationship = signal('');
  readonly state = signal('');
  readonly layout = signal<'cards' | 'list'>('cards');
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  readonly showAdd = signal(false);
  readonly openId = signal<string | null>(null);
  readonly testing = signal<string | null>(null);
  readonly testResult = signal<SourceTestResult | null>(null);
  readonly items = signal<SourceItemRow[]>([]);
  readonly diagnostics = signal<SourceDiagnostics | null>(null);
  draft = { url: '', name: '', topics: '', language: '' };
  edit = { url: '', refreshIntervalMinutes: 60, language: '', priority: 0, trustLevel: 'medium', topics: '', pillars: '', keywords: '', selectors: '' };

  private destroyed = false;
  private siteId: string | null = null;

  readonly openRecommendations = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.recommendations().filter(
      (rec) =>
        rec.status === 'open' &&
        (!this.relationship() || rec.relationship === this.relationship()) &&
        (!term || [rec.name, rec.url, rec.domain, ...(rec.topics ?? [])].some((value) => (value ?? '').toLowerCase().includes(term))),
    );
  });
  readonly filteredSources = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.sources().filter((src) => (!this.state() || src.state === this.state()) && (!term || `${src.name} ${src.url}`.toLowerCase().includes(term)));
  });

  constructor() {
    effect(() => {
      const id = this.app.activeSite()?.id ?? null;
      if (id && id !== this.siteId) {
        this.siteId = id;
        this.editorial.update({ area: 'sources', siteId: id });
        void this.reload();
      }
    });
  }

  ngOnInit(): void {
    this.editorial.update({ area: 'sources' });
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.editorial.clear(['area']);
  }

  trackId = (_: number, row: { id: string }) => row.id;

  async reload(): Promise<void> {
    if (!this.siteId) return;
    const [recs, srcs] = await Promise.all([firstValueFrom(this.api.recommendations(this.siteId)), firstValueFrom(this.api.sources(this.siteId))]).catch((error) => {
      this.toast.error(this.message(error));
      return [null, null] as const;
    });
    if (recs) this.recommendations.set(recs.items);
    if (srcs) this.sources.set(srcs.items);
    this.selected.set(new Set());
  }

  private message(error: unknown): string {
    const e = error as { error?: { error?: string; message?: string }; message?: string };
    return e?.error?.message ?? e?.error?.error ?? e?.message ?? 'Request failed';
  }

  async discover(): Promise<void> {
    if (!this.siteId) return;
    this.busy.set(true);
    try {
      const { operationId } = await firstValueFrom(this.api.discover(this.siteId));
      for (let i = 0; i < 90 && !this.destroyed; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const op = await firstValueFrom(this.api.operationStatus(operationId));
        if (['completed', 'succeeded', 'done', 'failed', 'cancelled'].includes(op.status)) {
          if (op.status === 'failed') this.toast.error('Source discovery failed');
          break;
        }
      }
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }

  toggle(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async decide(rec: SiteSourceRecommendation, action: 'accept' | 'reject'): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.decide(this.siteId, rec.id, action));
      this.toast.success(action === 'accept' ? 'Source activated' : 'Recommendation rejected');
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async bulk(action: 'accept' | 'reject'): Promise<void> {
    if (!this.siteId) return;
    try {
      const result = await firstValueFrom(this.api.bulk(this.siteId, Array.from(this.selected()), action));
      this.toast.success(`${result.succeeded} done, ${result.failed} failed`);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async addManual(): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.addManual(this.siteId, { url: this.draft.url.trim(), name: this.draft.name.trim() || undefined, topics: list(this.draft.topics), language: this.draft.language.trim() || undefined }));
      this.draft = { url: '', name: '', topics: '', language: '' };
      this.showAdd.set(false);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async setState(src: SiteSource, action: 'pause' | 'resume' | 'archive' | 'restore'): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.setState(this.siteId, src.id, action));
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async test(src: SiteSource): Promise<void> {
    if (!this.siteId) return;
    this.testing.set(src.id);
    try {
      await this.open(src, true);
      this.testResult.set(await firstValueFrom(this.api.test(this.siteId, src.id)));
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    } finally {
      this.testing.set(null);
    }
  }

  async open(src: SiteSource, keepOpen = false): Promise<void> {
    if (!this.siteId) return;
    if (!keepOpen && this.openId() === src.id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(src.id);
    this.testResult.set(null);
    const config = (src.configuration ?? {}) as Record<string, unknown>;
    const strings = (key: string) => (Array.isArray(config[key]) ? (config[key] as unknown[]).join(', ') : '');
    this.edit = {
      url: src.url,
      refreshIntervalMinutes: src.refreshIntervalMinutes,
      language: src.language ?? '',
      priority: src.priority,
      trustLevel: (src.trustScore ?? 0.5) >= 0.75 ? 'high' : (src.trustScore ?? 0.5) >= 0.5 ? 'medium' : 'low',
      topics: (src.categories ?? []).join(', '),
      pillars: strings('pillars'),
      keywords: strings('relevanceKeywords'),
      selectors: Object.entries((config['selectors'] as Record<string, string> | undefined) ?? {}).map(([k, v]) => `${k}=${v}`).join(', '),
    };
    const [items, diagnostics] = await Promise.all([firstValueFrom(this.api.items(this.siteId, src.id)), firstValueFrom(this.api.diagnostics(this.siteId, src.id))]).catch(() => [null, null] as const);
    this.items.set(items?.items ?? []);
    this.diagnostics.set(diagnostics);
  }

  async save(src: SiteSource): Promise<void> {
    if (!this.siteId) return;
    const selectors: Record<string, string> = {};
    for (const pair of list(this.edit.selectors)) {
      const [key, ...rest] = pair.split('=');
      if (key && rest.length) selectors[key.trim()] = rest.join('=').trim();
    }
    const body: SourceConfigPatchBody = {
      url: this.edit.url.trim(),
      refreshIntervalMinutes: Number(this.edit.refreshIntervalMinutes),
      language: this.edit.language.trim() || undefined,
      priority: Number(this.edit.priority),
      trustLevel: this.edit.trustLevel as 'high' | 'medium' | 'low',
      topics: list(this.edit.topics),
      pillars: list(this.edit.pillars),
      relevanceKeywords: list(this.edit.keywords),
      selectors,
    };
    try {
      await firstValueFrom(this.api.patchConfig(this.siteId, src.id, body));
      this.toast.success('Configuration saved');
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }
}
