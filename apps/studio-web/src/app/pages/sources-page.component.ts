import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import type { SourceType, StudioSite, StudioSource } from '../models/studio.models';

@Component({
  selector: 'app-sources-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Sources</h1>
          <p class="au-page__subtitle">RSS, Atom, pages, sitemaps and APIs that feed the editorial pipeline.</p>
        </div>
        <button class="au-button au-button--primary" type="button" (click)="showForm = !showForm">
          {{ showForm ? 'Close form' : '+ Add source' }}
        </button>
      </header>

      <section class="au-surface au-surface--form" *ngIf="showForm">
        <h3 class="au-form__title">{{ editingId ? 'Edit source' : 'New source' }}</h3>
        <div class="au-form-grid">
          <label class="au-field">
            <span>Name</span>
            <input class="au-input" type="text" [(ngModel)]="form.name" placeholder="e.g. El Mundo Deportes RSS" />
          </label>
          <label class="au-field">
            <span>Type</span>
            <select class="au-input" [(ngModel)]="form.type">
              <option *ngFor="let type of sourceTypes" [ngValue]="type">{{ type }}</option>
            </select>
          </label>
          <label class="au-field">
            <span>URL</span>
            <input class="au-input" type="url" [(ngModel)]="form.url" placeholder="https://…" [disabled]="form.type === 'manual'" />
          </label>
          <label class="au-field">
            <span>Site</span>
            <select class="au-input" [(ngModel)]="form.siteId">
              <option [ngValue]="null">All sites</option>
              <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
            </select>
          </label>
          <label class="au-field">
            <span>Refresh (minutes)</span>
            <input class="au-input" type="number" min="5" [(ngModel)]="form.refreshIntervalMinutes" />
          </label>
          <label class="au-field">
            <span>Priority (-5..5)</span>
            <input class="au-input" type="number" min="-5" max="5" [(ngModel)]="form.priority" />
          </label>
          <label class="au-field">
            <span>Trust (0..1)</span>
            <input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="form.trustScore" />
          </label>
          <label class="au-field">
            <span>Language</span>
            <input class="au-input" type="text" [(ngModel)]="form.language" />
          </label>
          <label class="au-field au-field--wide">
            <span>Categories (comma separated)</span>
            <input class="au-input" type="text" [(ngModel)]="form.categoriesText" placeholder="football, streaming, technology" />
          </label>
        </div>
        <div class="au-form-actions">
          <button class="au-button au-button--ghost" type="button" *ngIf="editingId" (click)="resetForm()">Cancel</button>
          <button class="au-button au-button--primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save source' }}</button>
        </div>
      </section>

      <section class="au-surface au-surface--table">
        <div class="au-empty" *ngIf="sources.length === 0">No sources yet. Add your first RSS feed.</div>
        <table class="au-table" *ngIf="sources.length > 0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>URL</th>
              <th>Status</th>
              <th>Last fetch</th>
              <th>Last success</th>
              <th>Errors</th>
              <th>Stories</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let source of sources">
              <td>
                <div class="au-cell-title">{{ source.name }}</div>
                <div class="au-cell-meta">{{ source.site?.name ?? 'All sites' }} · priority {{ source.priority }}</div>
              </td>
              <td><span class="au-tag au-tag--muted">{{ source.type }}</span></td>
              <td class="au-cell-meta au-cell-url">{{ source.url || '—' }}</td>
              <td>
                <span class="au-tag" [class.au-tag--success]="source.enabled" [class.au-tag--muted]="!source.enabled">
                  {{ source.enabled ? 'enabled' : 'disabled' }}
                </span>
              </td>
              <td class="au-cell-date">{{ dateLabel(source.lastFetchedAt) }}</td>
              <td class="au-cell-date">{{ dateLabel(source.lastSuccessAt) }}</td>
              <td>
                <span class="au-tag" [class.au-tag--danger]="source.consecutiveFailures > 0">{{ source.consecutiveFailures }}</span>
              </td>
              <td>{{ source.discoveredCount }}</td>
              <td class="au-cell-actions">
                <button class="au-button au-button--ghost au-button--xs" type="button" (click)="test(source)">Test</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" (click)="fetch(source)" [disabled]="fetching[source.id]">Fetch now</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" (click)="toggle(source)">{{ source.enabled ? 'Disable' : 'Enable' }}</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" (click)="edit(source)">Edit</button>
                <button class="au-button au-button--ghost au-button--xs au-button--danger" type="button" (click)="remove(source)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <div class="au-notice" *ngIf="feedback">
        {{ feedback }}
      </div>
    </section>
  `,
  styles: [
    `
      .au-surface--form { padding: 1rem 1.25rem; margin-bottom: 1rem; }
      .au-form__title { margin: 0 0 0.9rem; }
      .au-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; }
      .au-field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8rem; color: var(--au-muted, #6b7280); }
      .au-field--wide { grid-column: span 2; }
      .au-form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end; }
      .au-surface--table { overflow-x: auto; }
      .au-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .au-table th { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--au-border, #e5e7eb); color: var(--au-muted, #6b7280); font-weight: 600; white-space: nowrap; }
      .au-table td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--au-border-subtle, #f3f4f6); vertical-align: top; }
      .au-cell-title { font-weight: 600; }
      .au-cell-meta { font-size: 0.72rem; color: var(--au-muted, #6b7280); }
      .au-cell-url { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .au-cell-date { white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 0.75rem; color: var(--au-muted, #6b7280); }
      .au-cell-actions { white-space: nowrap; }
      .au-button--xs { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
      .au-button--danger { color: var(--au-danger, #dc2626); }
      .au-notice { padding: 0.6rem 0.9rem; border-radius: 8px; background: var(--au-surface-subtle, #f9fafb); font-size: 0.85rem; }
    `,
  ],
})
export class SourcesPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  sourceTypes: SourceType[] = ['rss', 'atom', 'html', 'sitemap', 'api', 'manual'];
  sources: StudioSource[] = [];
  sites: StudioSite[] = [];
  showForm = false;
  saving = false;
  editingId: string | null = null;
  fetching: Record<string, boolean> = {};
  feedback = '';
  form = {
    name: '',
    type: 'rss' as SourceType,
    url: '',
    siteId: null as string | null,
    refreshIntervalMinutes: 30,
    priority: 0,
    trustScore: 0.5,
    language: 'es',
    categoriesText: '',
  };
  private refreshSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.load();
    this.refreshSubscription = timer(45_000, 45_000).subscribe(() => this.load(true));
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  load(silent = false): void {
    this.api.listSources(1, 100).subscribe({
      next: (response) => {
        this.sources = response.items;
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
    const payload = {
      name: this.form.name.trim(),
      type: this.form.type,
      url: this.form.type === 'manual' ? undefined : this.form.url.trim(),
      siteId: this.form.siteId ?? undefined,
      refreshIntervalMinutes: Math.max(5, this.form.refreshIntervalMinutes),
      priority: this.form.priority,
      trustScore: this.form.trustScore,
      language: this.form.language || 'es',
      categories: this.form.categoriesText.split(',').map((item) => item.trim()).filter(Boolean),
    };
    this.saving = true;
    const request = this.editingId
      ? this.api.updateSource(this.editingId, payload)
      : this.api.createSource(payload);
    request.subscribe({
      next: () => {
        this.saving = false;
        this.resetForm();
        this.feedback = 'Source saved.';
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
      siteId: source.siteId,
      refreshIntervalMinutes: source.refreshIntervalMinutes,
      priority: source.priority,
      trustScore: source.trustScore,
      language: source.language,
      categoriesText: (source.categories ?? []).join(', '),
    };
    this.showForm = true;
  }

  resetForm(): void {
    this.editingId = null;
    this.showForm = false;
    this.form = {
      name: '',
      type: 'rss',
      url: '',
      siteId: null,
      refreshIntervalMinutes: 30,
      priority: 0,
      trustScore: 0.5,
      language: 'es',
      categoriesText: '',
    };
  }

  test(source: StudioSource): void {
    this.feedback = `Testing ${source.name}…`;
    this.api.testSource(source.id).subscribe({
      next: (result) => {
        this.feedback = result.ok
          ? `Test OK: ${result.itemCount ?? 0} items returned.`
          : `Test failed: ${result.message}`;
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
        this.feedback = result.failed
          ? `Fetch failed: ${result.error}`
          : `Fetch complete: ${result.created} new, ${result.duplicates} duplicates.`;
        this.load(true);
      },
      error: (error) => {
        this.fetching[source.id] = false;
        this.feedback = String(error?.error?.message ?? 'Fetch failed.');
      },
    });
  }

  toggle(source: StudioSource): void {
    this.api.updateSource(source.id, { enabled: !source.enabled }).subscribe({
      next: () => this.load(),
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Update failed.');
      },
    });
  }

  remove(source: StudioSource): void {
    if (!window.confirm(`Delete source "${source.name}"?\n\nDiscovered stories stay in the inbox but will no longer refresh.`)) {
      return;
    }
    this.api.deleteSource(source.id).subscribe({
      next: () => {
        this.feedback = 'Source deleted.';
        this.load();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Delete failed.');
      },
    });
  }

  dateLabel(value: string | null): string {
    return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }
}
