import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppContextService } from '../services/app-context.service';
import { Competitor, CompetitorsApiService, ContentOpportunity, CoverageComparison } from '../services/competitors-api.service';
import { EditorialContextService } from '../services/editorial-context.service';
import { ToastService } from '../services/toast.service';

const KIND_LABEL: Record<string, string> = {
  missing_topic: 'Missing topic',
  improve_existing: 'Improve existing article',
  underdeveloped_cluster: 'Underdeveloped cluster',
  differentiated_angle: 'Differentiated angle',
  cannibalization_risk: 'Cannibalization risk',
};

@Component({
  selector: 'app-competitors-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent],
  styles: [
    `
      .cp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--au-s3); }
      .cp-card { border: 1px solid var(--au-border); border-radius: var(--au-radius, 8px); padding: var(--au-s3); background: var(--au-surface); display: flex; flex-direction: column; gap: 8px; }
      .cp-card h3 { margin: 0; font-size: var(--au-fs-body); overflow-wrap: anywhere; }
      .cp-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .cp-muted { color: var(--au-muted); font-size: var(--au-fs-body-sm); overflow-wrap: anywhere; }
      .cp-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
      .cp-ev { margin: 0; padding-left: 18px; }
      .cp-err { color: var(--au-danger); }
    `,
  ],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Editorial intelligence</p>
          <h1 class="au-page__title">Competitors</h1>
          <p class="au-page__subtitle">Sites that cover your topics, based on observable evidence. Coverage sampling reads public titles and URLs only.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--primary" type="button" [disabled]="busy()" (click)="run('discover')"><app-icon name="search"></app-icon>{{ busy() === 'discover' ? 'Discovering...' : 'Discover competitors' }}</button>
          <button class="au-btn au-btn--secondary" type="button" [disabled]="busy()" (click)="run('coverage')"><app-icon name="refresh"></app-icon>{{ busy() === 'coverage' ? 'Sampling...' : 'Refresh coverage' }}</button>
          <button class="au-btn au-btn--secondary" type="button" (click)="showAdd.set(!showAdd())"><app-icon name="plus"></app-icon>Add manually</button>
        </div>
      </header>

      <form class="au-panel au-panel--padded au-mb-3 cp-form" *ngIf="showAdd()" (ngSubmit)="add()">
        <label class="au-field"><span class="au-field__label">Competitor URL or domain</span><input class="au-input" name="url" required [(ngModel)]="draft.url" /></label>
        <label class="au-field"><span class="au-field__label">Name (optional)</span><input class="au-input" name="name" [(ngModel)]="draft.name" /></label>
        <label class="au-field"><span class="au-field__label">Notes</span><input class="au-input" name="notes" [(ngModel)]="draft.notes" /></label>
        <div class="cp-row"><button class="au-btn au-btn--primary" type="submit" [disabled]="!draft.url.trim()">Add competitor</button></div>
      </form>

      <nav class="au-tabs au-mb-3" aria-label="Competitor sections">
        <button class="au-tab" type="button" [class.is-active]="tab() === 'shortlist'" (click)="tab.set('shortlist')">Shortlist ({{ competitors().length }})</button>
        <button class="au-tab" type="button" [class.is-active]="tab() === 'coverage'" (click)="tab.set('coverage')">Coverage by topic</button>
        <button class="au-tab" type="button" [class.is-active]="tab() === 'opportunities'" (click)="tab.set('opportunities')">Opportunities ({{ openOpportunities().length }})</button>
      </nav>

      <!-- Shortlist -->
      <ng-container *ngIf="tab() === 'shortlist'">
        <div class="au-toolbar au-toolbar--panel au-mb-3">
          <select class="au-select" aria-label="Status filter" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
            <option value="">All statuses</option>
            <option value="suggested">Suggested</option>
            <option value="accepted">Accepted</option>
            <option value="paused">Paused</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <app-empty-state *ngIf="shown().length === 0" icon="competency" title="No competitors yet" text="Run Discover competitors or add one manually. Suggestions come only from evidence found in your content and sources."></app-empty-state>
        <div class="cp-grid">
          <article class="cp-card" *ngFor="let c of shown(); trackBy: trackId">
            <div class="cp-row">
              <h3>{{ c.name }}</h3>
              <span class="au-badge" [ngClass]="c.verification === 'verified' ? 'au-badge--success' : 'au-badge--warning'">{{ c.verification }}</span>
              <span class="au-badge au-badge--neutral">{{ c.status }}</span>
            </div>
            <a class="cp-muted" [href]="'https://' + c.domain" target="_blank" rel="noopener noreferrer">{{ c.domain }}</a>
            <p class="cp-muted">Origin: {{ c.origin }}<span *ngIf="c.overlapScore !== null"> - overlap {{ c.overlapScore | percent }}</span></p>
            <div class="cp-row" *ngIf="c.overlapTopics?.length"><span class="au-badge au-badge--outline" *ngFor="let t of c.overlapTopics">{{ t }}</span></div>
            <ul class="cp-ev cp-muted" *ngIf="c.evidence?.length">
              <li *ngFor="let e of c.evidence!.slice(0, 4)">{{ e.note }}<a *ngIf="e.url" [href]="e.url" target="_blank" rel="noopener noreferrer"> (source)</a></li>
            </ul>
            <p class="cp-muted" *ngIf="c.notes">{{ c.notes }}</p>
            <p class="cp-muted cp-err" *ngIf="c.lastError">{{ c.lastError }}</p>
            <p class="cp-muted">{{ c.snapshotsCount }} sampled pages - {{ c.opportunitiesCount }} opportunities</p>
            <div class="cp-row">
              <button class="au-btn au-btn--sm au-btn--primary" type="button" *ngIf="c.status === 'suggested' || c.status === 'paused'" (click)="setStatus(c, 'accepted')">{{ c.status === 'paused' ? 'Resume' : 'Accept' }}</button>
              <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="c.status === 'suggested'" (click)="setStatus(c, 'rejected')">Reject</button>
              <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="c.status === 'accepted'" (click)="setStatus(c, 'paused')">Pause</button>
              <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="startEdit(c)">Edit</button>
              <button class="au-btn au-btn--sm au-btn--danger-ghost" type="button" (click)="setStatus(c, 'removed')">Remove</button>
            </div>
            <form class="cp-form" *ngIf="editId() === c.id" (ngSubmit)="saveEdit(c)">
              <label class="au-field"><span class="au-field__label">Name</span><input class="au-input" name="n" [(ngModel)]="edit.name" /></label>
              <label class="au-field"><span class="au-field__label">Feed URL</span><input class="au-input" name="f" [(ngModel)]="edit.feedUrl" /></label>
              <label class="au-field"><span class="au-field__label">Sitemap URL</span><input class="au-input" name="s" [(ngModel)]="edit.sitemapUrl" /></label>
              <label class="au-field"><span class="au-field__label">Notes</span><input class="au-input" name="o" [(ngModel)]="edit.notes" /></label>
              <div class="cp-row"><button class="au-btn au-btn--sm au-btn--primary" type="submit">Save</button></div>
            </form>
          </article>
        </div>
      </ng-container>

      <!-- Coverage -->
      <section class="au-panel" *ngIf="tab() === 'coverage'">
        <app-empty-state *ngIf="!coverage() || coverage()!.topics.length === 0 || coverage()!.competitors.length === 0" icon="competency" title="No coverage data" text="Accept at least one competitor and run Refresh coverage to compare topic coverage."></app-empty-state>
        <div class="au-table-wrap" *ngIf="coverage() && coverage()!.topics.length > 0 && coverage()!.competitors.length > 0">
          <table class="au-table">
            <caption class="cp-muted">{{ coverage()!.sampledCompetitorPages }} sampled competitor pages vs {{ coverage()!.sitePages }} pages on your site.</caption>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col">Your site</th>
                <th scope="col" *ngFor="let c of coverage()!.competitors">{{ c.domain }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of coverage()!.topics">
                <td>{{ row.topic }}</td>
                <td>{{ row.sitePages }}</td>
                <td *ngFor="let c of coverage()!.competitors" [class.cp-err]="row.sitePages === 0 && (row.competitorPages[c.id] || 0) > 0">{{ row.competitorPages[c.id] || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Opportunities -->
      <ng-container *ngIf="tab() === 'opportunities'">
        <app-empty-state *ngIf="opportunities().length === 0" icon="sparkles" title="No opportunities yet" text="Opportunities appear after coverage sampling finds topics competitors cover and you do not."></app-empty-state>
        <div class="cp-grid">
          <article class="cp-card" *ngFor="let o of opportunities(); trackBy: trackId">
            <div class="cp-row">
              <h3>{{ o.topic }}</h3>
              <span class="au-badge au-badge--brand">{{ kindLabel(o.kind) }}</span>
              <span class="au-badge au-badge--neutral">{{ o.status }}</span>
            </div>
            <p class="cp-muted">{{ o.rationale }}</p>
            <ul class="cp-ev cp-muted" *ngIf="o.evidence?.length">
              <li *ngFor="let e of o.evidence!.slice(0, 4)"><a [href]="e.url" target="_blank" rel="noopener noreferrer">{{ e.title || e.url }}</a><span *ngIf="e.competitor"> ({{ e.competitor }})</span></li>
            </ul>
            <p class="cp-muted" *ngIf="o.targetUrl">Existing page: <a [href]="o.targetUrl" target="_blank" rel="noopener noreferrer">{{ o.targetUrl }}</a></p>
            <div class="cp-row">
              <ng-container *ngIf="o.planItemId; else actions"><span class="au-badge au-badge--success">In plan as proposal</span></ng-container>
              <ng-template #actions>
                <ng-container *ngIf="o.status === 'open' || o.status === 'monitoring'">
                  <button class="au-btn au-btn--sm au-btn--primary" type="button" (click)="toPlan(o, 'new')">Add to plan</button>
                  <button class="au-btn au-btn--sm au-btn--secondary" type="button" *ngIf="o.targetUrl" (click)="toPlan(o, 'update')">Improve existing article</button>
                  <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="o.status === 'open'" (click)="oppStatus(o, 'monitoring')">Monitor</button>
                  <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="oppStatus(o, 'dismissed')">Dismiss</button>
                </ng-container>
                <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="o.status === 'dismissed'" (click)="oppStatus(o, 'open')">Reopen</button>
              </ng-template>
            </div>
          </article>
        </div>
      </ng-container>
    </section>
  `,
})
export class CompetitorsPageComponent implements OnDestroy {
  private readonly api = inject(CompetitorsApiService);
  private readonly app = inject(AppContextService);
  private readonly editorial = inject(EditorialContextService);
  private readonly toast = inject(ToastService);

  readonly tab = signal<'shortlist' | 'coverage' | 'opportunities'>('shortlist');
  readonly competitors = signal<Competitor[]>([]);
  readonly coverage = signal<CoverageComparison | null>(null);
  readonly opportunities = signal<ContentOpportunity[]>([]);
  readonly statusFilter = signal('');
  readonly busy = signal<'discover' | 'coverage' | ''>('');
  readonly showAdd = signal(false);
  readonly editId = signal<string | null>(null);
  readonly shown = computed(() => this.competitors().filter((c) => !this.statusFilter() || c.status === this.statusFilter()));
  readonly openOpportunities = computed(() => this.opportunities().filter((o) => o.status === 'open'));
  draft = { url: '', name: '', notes: '' };
  edit = { name: '', feedUrl: '', sitemapUrl: '', notes: '' };

  private siteId: string | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const id = this.app.activeSite()?.id ?? null;
      if (id && id !== this.siteId) {
        this.siteId = id;
        this.editorial.update({ area: 'competitors', siteId: id });
        void this.reload();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.editorial.clear(['area']);
  }

  trackId = (_: number, row: { id: string }) => row.id;
  kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

  private message(error: unknown): string {
    const e = error as { error?: { error?: string; message?: string }; message?: string };
    return e?.error?.message ?? e?.error?.error ?? e?.message ?? 'Request failed';
  }

  async reload(): Promise<void> {
    if (!this.siteId) return;
    try {
      const [list, coverage, opportunities] = await Promise.all([firstValueFrom(this.api.list(this.siteId)), firstValueFrom(this.api.coverage(this.siteId)), firstValueFrom(this.api.opportunities(this.siteId))]);
      this.competitors.set(list.items);
      this.coverage.set(coverage);
      this.opportunities.set(opportunities.items);
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async run(kind: 'discover' | 'coverage'): Promise<void> {
    if (!this.siteId) return;
    this.busy.set(kind);
    try {
      const { operationId } = await firstValueFrom(kind === 'discover' ? this.api.discover(this.siteId) : this.api.refreshCoverage(this.siteId));
      for (let i = 0; i < 120 && !this.destroyed; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const op = await firstValueFrom(this.api.operationStatus(operationId));
        if (['completed', 'succeeded', 'done', 'failed', 'cancelled'].includes(op.status)) {
          if (op.status === 'failed') this.toast.error('The operation failed');
          break;
        }
      }
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    } finally {
      this.busy.set('');
    }
  }

  async add(): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.add(this.siteId, { url: this.draft.url.trim(), name: this.draft.name.trim() || undefined, notes: this.draft.notes.trim() || undefined }));
      this.draft = { url: '', name: '', notes: '' };
      this.showAdd.set(false);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async setStatus(c: Competitor, status: Competitor['status']): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.update(this.siteId, c.id, { status }));
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  startEdit(c: Competitor): void {
    this.editId.set(this.editId() === c.id ? null : c.id);
    this.edit = { name: c.name, feedUrl: c.feedUrl ?? '', sitemapUrl: c.sitemapUrl ?? '', notes: c.notes ?? '' };
  }

  async saveEdit(c: Competitor): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.update(this.siteId, c.id, { name: this.edit.name, feedUrl: this.edit.feedUrl.trim() || null, sitemapUrl: this.edit.sitemapUrl.trim() || null, notes: this.edit.notes.trim() || null }));
      this.editId.set(null);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async toPlan(o: ContentOpportunity, mode: 'new' | 'update'): Promise<void> {
    if (!this.siteId) return;
    try {
      const result = await firstValueFrom(this.api.toPlan(this.siteId, o.id, { mode, targetUrl: mode === 'update' ? o.targetUrl ?? undefined : undefined }));
      this.toast.success(result.created ? 'Proposal added to the plan' : 'Already in the plan');
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async oppStatus(o: ContentOpportunity, status: 'dismissed' | 'monitoring' | 'open'): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.setOpportunityStatus(this.siteId, o.id, status));
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }
}
