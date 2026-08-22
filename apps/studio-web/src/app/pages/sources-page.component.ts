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
import type { SourceType, StudioSite, StudioSource } from '../models/studio.models';

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
          <p class="au-page__subtitle">RSS, Atom, pages, sitemaps and APIs that feed the editorial pipeline.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="showForm = !showForm">
            <app-icon name="plus"></app-icon>
            {{ showForm ? 'Close form' : 'Add source' }}
          </button>
        </div>
      </header>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="showForm">
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
            <span class="au-field__label">URL</span>
            <input class="au-input" type="url" [(ngModel)]="form.url" placeholder="https://…" [disabled]="form.type === 'manual'" />
          </label>
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
        </div>
        <div class="au-form__actions">
          <button class="au-btn au-btn--ghost" type="button" *ngIf="editingId" (click)="resetForm()">Cancel</button>
          <button class="au-btn au-btn--primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save source' }}</button>
        </div>
      </section>

      <section class="au-panel">
        <app-empty-state
          *ngIf="sources.length === 0"
          icon="sources"
          title="Connect a source to start discovering content"
          text="Add an RSS feed, sitemap or page. Discovered stories land in the Inbox."
        >
          <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="showForm = true">Add source</button>
        </app-empty-state>
        <div class="au-table-wrap" *ngIf="sources.length > 0">
          <table class="au-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>URL</th>
                <th>Status</th>
                <th>Last fetch</th>
                <th>Errors</th>
                <th>Stories</th>
                <th style="width: 44px"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let source of sources">
                <td>
                  <span class="au-table__title">{{ source.name }}</span>
                  <span class="au-table__sub">{{ source.site?.name ?? 'All sites' }} · priority {{ source.priority }}</span>
                </td>
                <td><span class="au-badge au-badge--outline">{{ source.type }}</span></td>
                <td class="au-muted au-truncate" style="max-width: 240px">{{ source.url || '—' }}</td>
                <td>
                  <span class="au-badge" [class.au-badge--success]="source.enabled" [class.au-badge--neutral]="!source.enabled">
                    {{ source.enabled ? 'enabled' : 'disabled' }}
                  </span>
                </td>
                <td class="au-nowrap au-muted">{{ dateLabel(source.lastFetchedAt) }}</td>
                <td>
                  <span class="au-badge" [class.au-badge--danger]="source.consecutiveFailures > 0" [class.au-badge--neutral]="source.consecutiveFailures === 0">
                    {{ source.consecutiveFailures }} errors
                  </span>
                </td>
                <td>{{ source.discoveredCount }}</td>
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
                      <button class="au-menu__item" type="button" (click)="rowMenu.hide(); test(source)">
                        <app-icon name="circle-check"></app-icon>
                        Test connection
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
      </section>
    </section>
  `,
})
export class SourcesPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

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
        } else {
          this.toast.success(`Fetch complete: ${result.created} new, ${result.duplicates} duplicates.`);
        }
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

  dateLabel(value: string | null): string {
    return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }
}
