import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, forkJoin, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { PublicationChannel, PublicationState, StudioPublication } from '../models/studio.models';

type Tone = 'info' | 'warning' | 'success' | 'danger' | 'muted';
type StateKey = 'all' | 'scheduled' | 'published' | 'failed' | 'canceled';
type SortKey = 'scheduled-desc' | 'scheduled-asc' | 'created-desc' | 'updated-desc';

@Component({
  selector: 'app-publications-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  styleUrls: ['./studio-page-kit.css'],
  template: `
    <section class="sp">
      <header class="sp-head">
        <div>
          <h1 class="sp-head__title">Results</h1>
          <p class="sp-head__sub">{{ siteName }} · every publication and where it lives. Dates are changed in Calendar</p>
        </div>
        <div class="sp-head__actions">
          <a class="au-btn au-btn--secondary" routerLink="/studio/calendar"><app-icon name="calendar"></app-icon>Open calendar</a>
        </div>
      </header>

      @if (projectId) {
        <p class="sp-note"><app-icon name="filter"></app-icon>Showing the publications of one article · <a routerLink="/studio/results">Show all</a></p>
      }

      <div class="sp-states" role="group" aria-label="Filter by state">
        @for (state of stateFilters; track state.key) {
          <button type="button" class="sp-state" [attr.data-tone]="state.tone" [attr.aria-pressed]="stateKey === state.key" (click)="setState(state.key)">
            @if (state.key !== 'all') { <i class="sp-dot" aria-hidden="true"></i> }
            {{ state.label }}
            <span class="sp-state__count">{{ counts[state.key] ?? '·' }}</span>
          </button>
        }
      </div>

      <div class="sp-bar">
        <label class="sp-search">
          <app-icon name="search"></app-icon>
          <input class="au-input" type="search" placeholder="Search title or URL" aria-label="Search publications" [(ngModel)]="filters.search" (ngModelChange)="searchChanged()" (keyup.enter)="applyFilters()" />
        </label>
        <select class="au-select" [(ngModel)]="filters.channel" (ngModelChange)="applyFilters()" aria-label="Filter by channel">
          <option value="">All channels</option>
          <option value="website">Website</option>
          <option value="x">X</option>
          <option value="instagram">Instagram</option>
        </select>
        <span class="sp-bar__spacer"></span>
        <select class="au-select" [(ngModel)]="sort" (ngModelChange)="applyFilters()" aria-label="Sort publications">
          <option value="scheduled-desc">Latest date first</option>
          <option value="scheduled-asc">Earliest date first</option>
          <option value="created-desc">Recently created</option>
          <option value="updated-desc">Recently updated</option>
        </select>
        <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="refresh()" [disabled]="loading" aria-label="Refresh"><app-icon name="refresh"></app-icon></button>
      </div>

      @if (error) {
        <div class="au-banner au-banner--error"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ error }}</span></div>
      }

      <section class="sp-panel">
        @if (loading && items.length === 0) {
          @for (row of [1, 2, 3]; track row) { <div class="sp-skeleton" aria-hidden="true"></div> }
        } @else if (items.length === 0) {
          <app-empty-state icon="publications" title="No publications match these filters" text="Articles appear here once they are scheduled or published.">
            <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/content">Open articles</a>
          </app-empty-state>
        } @else {
          <table class="sp-table">
            <thead>
              <tr>
                <th style="width: 88px"><span class="au-sr-only">Image</span></th>
                <th>Publication</th>
                <th>Status</th>
                <th class="sp-hide-md">Where</th>
                <th>Date</th>
                <th class="sp-hide-lg">Updated</th>
                <th class="sp-col-menu"><span class="au-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (item of items; track item.id) {
                <tr (click)="inspect(item)" [class.is-selected]="selected?.id === item.id">
                  <td>
                    @if (item.assetUrl) { <img class="sp-thumb" [src]="item.assetUrl" alt="" loading="lazy" /> }
                    @else { <span class="sp-thumb" aria-hidden="true"></span> }
                  </td>
                  <td>
                    <button type="button" class="sp-title sp-title--btn" (click)="$event.stopPropagation(); inspect(item)">{{ titleOf(item) }}</button>
                    @if (item.externalUrl) {
                      <a class="sp-link" [href]="item.externalUrl" target="_blank" rel="noopener" (click)="$event.stopPropagation()">{{ shortUrl(item.externalUrl) }}</a>
                    }
                  </td>
                  <td>
                    <span class="sp-status" [attr.data-tone]="statusTone(item.status)"><i class="sp-dot" aria-hidden="true"></i>{{ statusWord(item.status) }}</span>
                    @if (item.status === 'published') {
                      <span class="sp-meta" [class.sp-meta--danger]="item.metadata?.verification?.state === 'failed'">{{ verificationLabel(item) }}</span>
                    } @else if (item.failureReason || item.lastError) {
                      <span class="sp-meta sp-meta--danger">{{ item.failureReason ? failureReasonLabel(item.failureReason) : item.lastError }}</span>
                    }
                  </td>
                  <td class="sp-hide-md">
                    <span class="sp-status">{{ item.channel }}</span>
                    <span class="sp-meta">{{ destination(item) }}</span>
                  </td>
                  <td>
                    <span class="sp-num">{{ dateLabel(item.publishedAt || item.scheduledFor) }}</span>
                    <span class="sp-meta">{{ item.publishedAt ? 'Published' : item.scheduledFor ? 'Scheduled' : 'No date' }}</span>
                  </td>
                  <td class="sp-hide-lg sp-muted sp-num">{{ dateLabel(item.updatedAt) }}</td>
                  <td class="sp-col-menu" (click)="$event.stopPropagation()">
                    <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="inspect(item)" [attr.aria-label]="'Actions for ' + titleOf(item)"><app-icon name="dots"></app-icon></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div class="sp-pager">
            <span>{{ rangeStart }}–{{ rangeEnd }} of {{ total }}</span>
            @if (totalPages > 1) {
              <span class="sp-pager__btns">
                <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" [disabled]="page <= 1" (click)="goPage(page - 1)" aria-label="Previous page"><app-icon name="chevron-left"></app-icon></button>
                <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" [disabled]="page >= totalPages" (click)="goPage(page + 1)" aria-label="Next page"><app-icon name="chevron-right"></app-icon></button>
              </span>
            }
          </div>
        }
      </section>
    </section>

    <dialog #sheet class="sp-sheet" aria-labelledby="pub-title" aria-label="Publication details" (close)="selected = null" (click)="onBackdrop($event)">
      @if (selected; as pub) {
        <div class="sp-sheet__inner">
          <header class="sp-sheet__head">
            <span class="sp-sheet__state" [attr.data-tone]="statusTone(pub.status)"><i class="sp-dot" aria-hidden="true"></i>{{ statusWord(pub.status) }} · {{ pub.channel }}</span>
            <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="closeSheet()" aria-label="Close publication details"><app-icon name="close"></app-icon></button>
          </header>
          <h2 class="sp-sheet__title" id="pub-title">{{ titleOf(pub) }}</h2>
          @if (pub.externalUrl) {
            <a class="sp-sheet__link" [href]="pub.externalUrl" target="_blank" rel="noopener"><app-icon name="external"></app-icon>{{ pub.externalUrl }}</a>
          }
          @if (pub.lastError) { <p class="sp-sheet__error"><app-icon name="warning"></app-icon>{{ pub.lastError }}</p> }

          <div class="sp-sheet__actions">
            @if (pub.status === 'failed') { <button class="au-btn au-btn--primary" type="button" (click)="retry(pub)"><app-icon name="refresh"></app-icon>Retry</button> }
            @if (pub.status === 'scheduled' || pub.status === 'ready' || pub.status === 'draft') { <button class="au-btn au-btn--primary" type="button" (click)="publishNow(pub)"><app-icon name="play"></app-icon>Publish now</button> }
            <a class="au-btn au-btn--secondary" [routerLink]="['/studio/content', pub.projectId]" (click)="closeSheet()">Open article</a>
            @if (canEdit(pub)) { <a class="au-btn au-btn--secondary" routerLink="/studio/calendar" (click)="closeSheet()"><app-icon name="calendar"></app-icon>Change date</a> }
          </div>

          <dl class="sp-facts">
            <div><dt>Where</dt><dd>{{ pub.channel }} · {{ destination(pub) }}</dd></div>
            <div><dt>Scheduled</dt><dd class="sp-num">{{ pub.scheduledFor ? dateLabel(pub.scheduledFor) : 'Not scheduled' }}</dd></div>
            <div><dt>Published</dt><dd class="sp-num">{{ dateLabel(pub.publishedAt) }}</dd></div>
            <div><dt>Verification</dt><dd>{{ verificationLabel(pub) }}</dd></div>
            <div><dt>Attempts</dt><dd class="sp-num">{{ pub.attempts?.length || 0 }}</dd></div>
            @if (pub.failureReason) { <div><dt>Reason</dt><dd>{{ failureReasonLabel(pub.failureReason) }}</dd></div> }
            <div><dt>Remote record</dt><dd class="sp-num">{{ pub.externalId || 'None yet' }}</dd></div>
          </dl>

          @if (pub.attempts?.length) {
            <div>
              <h3 class="sp-sheet__section">Attempt history</h3>
              <dl class="sp-facts">
                @for (attempt of pub.attempts; track attempt.id) {
                  <div [attr.data-tone]="statusTone(attempt.status)">
                    <dt>Attempt {{ attempt.attemptNumber }}</dt>
                    <dd><span class="sp-status"><i class="sp-dot" aria-hidden="true"></i>{{ statusWord(attempt.status) }}</span> <span class="sp-muted sp-num">· {{ dateLabel(attempt.startedAt) }}</span>
                      @if (attempt.error) { <span class="sp-meta sp-meta--danger">{{ attempt.error }}</span> }
                    </dd>
                  </div>
                }
              </dl>
            </div>
          }

          <div class="sp-actions" role="group" aria-label="More actions">
            @if (pub.status === 'scheduled') { <button type="button" class="sp-action" (click)="cancel(pub)"><app-icon name="close"></app-icon>Cancel publication</button> }
            @if (pub.status === 'published') { <button type="button" class="sp-action" (click)="unpublish(pub)"><app-icon name="arrow-down"></app-icon>Unpublish</button> }
            @if (pub.status !== 'deleted') { <button type="button" class="sp-action sp-action--danger" (click)="remove(pub)"><app-icon name="trash"></app-icon>Delete record</button> }
          </div>
        </div>
      }
    </dialog>
  `,
  styles: [`
    /* Peek sheet */
    .sp-sheet { margin: 0 0 0 auto; width: min(460px, 100vw); height: 100dvh; max-height: none; padding: 0; border: 0; border-left: 1px solid var(--sp-line); background: var(--sp-cell); color: var(--au-text); }
    .sp-sheet::backdrop { background: var(--au-scrim-soft); }
    .sp-sheet[open] { animation: sp-in .18s cubic-bezier(.2, .8, .2, 1); }
    @keyframes sp-in { from { opacity: 0; transform: translateX(12px); } }
    @media (prefers-reduced-motion: reduce) { .sp-sheet[open] { animation: none; } }
    .sp-sheet__inner { display: flex; flex-direction: column; gap: 20px; padding: 20px 24px 32px; }
    .sp-sheet__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .sp-sheet__state { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--au-muted); }
    .sp-sheet__title { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 600; }
    .sp-sheet__error { display: flex; gap: 8px; margin: 0; color: var(--au-danger); font-size: 13px; }
    .sp-sheet__error app-icon, .sp-sheet__link app-icon { width: 16px; height: 16px; flex: none; }
    .sp-sheet__link { display: flex; gap: 8px; font-size: 13px; color: var(--au-brand); overflow-wrap: anywhere; }
    .sp-sheet__actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .sp-sheet__section { margin: 0 0 8px; font-size: 13px; font-weight: 500; color: var(--au-text-2); }
    .sp-facts { display: grid; margin: 0; border-top: 1px solid var(--sp-line); }
    .sp-facts div { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--sp-line); font-size: 13px; }
    .sp-facts dt { color: var(--au-muted); }
    .sp-facts dd { margin: 0; overflow-wrap: anywhere; }
    .sp-facts .sp-num { font-family: var(--au-mono); }
    .sp-actions { display: flex; flex-direction: column; border-top: 1px solid var(--sp-line); }
    .sp-action { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 8px; border: 0; border-bottom: 1px solid var(--sp-line); background: none; color: var(--au-text); font: inherit; font-size: 14px; text-align: left; text-decoration: none; cursor: pointer; transition: background-color .15s ease; }
    .sp-action:hover { background: var(--au-surface-2); }
    .sp-action app-icon { width: 16px; height: 16px; color: var(--au-muted); }
    .sp-action--danger, .sp-action--danger app-icon { color: var(--au-danger); }
    .sp-inline { display: flex; align-items: flex-end; gap: 8px; padding: 12px 8px; border-bottom: 1px solid var(--sp-line); }
    .sp-inline .au-field { flex: 1; }
    .sp-title--btn { padding: 0; border: 0; background: none; font: inherit; font-size: 14px; font-weight: 500; text-align: left; cursor: pointer; }
    .sp-link { display: block; margin-top: 2px; max-width: 520px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @container (max-width: 1100px) { .sp-hide-lg { display: none; } }
    @container (max-width: 860px) { .sp-hide-md { display: none; } }
    @container (max-width: 640px) {
      .sp-table thead { display: none; }
      .sp-table tbody tr { display: grid; grid-template-columns: 64px minmax(0, 1fr) 32px; gap: 4px 12px; padding: 12px; border-bottom: 1px solid var(--sp-line); }
      .sp-table td { padding: 0; border: 0; }
      .sp-table td:nth-child(2) { grid-column: 2; }
      .sp-table td:nth-child(3), .sp-table td:nth-child(5) { grid-column: 2; }
      .sp-table .sp-col-menu { grid-column: 3; grid-row: 1; }
    }
  `],
})
export class PublicationsPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  @ViewChild('sheet') private sheet?: ElementRef<HTMLDialogElement>;

  readonly siteName = this.appContext.activeSite()?.name ?? 'This site';
  readonly stateFilters: Array<{ key: StateKey; label: string; tone: Tone }> = [
    { key: 'all', label: 'All', tone: 'muted' },
    { key: 'scheduled', label: 'Scheduled', tone: 'info' },
    { key: 'published', label: 'Published', tone: 'success' },
    { key: 'failed', label: 'Failed', tone: 'danger' },
    { key: 'canceled', label: 'Canceled', tone: 'muted' },
  ];
  stateKey: StateKey = 'all';
  counts: Partial<Record<string, number>> = {};
  items: StudioPublication[] = [];
  page = 1;
  pageSize = 20;
  total = 0;
  selected: StudioPublication | null = null;
  loading = false;
  error = '';
  sort: SortKey = 'scheduled-desc';
  /** ?projectId= (from an article) filters to its publications; ?id= (from Calendar) opens one. */
  private readonly queryParams = inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap;
  readonly projectId = this.queryParams?.get('projectId') ?? '';
  filters = {
    channel: (this.projectId ? 'website' : '') as '' | PublicationChannel,
    siteId: this.appContext.activeSite()?.id ?? '',
    search: '',
  };
  private refreshSubscription: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }
  get rangeStart(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
  }
  get rangeEnd(): number {
    return Math.min(this.total, this.page * this.pageSize);
  }

  ngOnInit(): void {
    const status = this.stateFilters.find((state) => state.key === this.queryParams?.get('status'));
    if (status) this.stateKey = status.key;
    this.refresh();
    const id = this.queryParams?.get('id');
    if (id) this.inspect({ id } as StudioPublication);
    this.refreshSubscription = timer(30_000, 30_000).subscribe(() => {
      if (!document.hidden) this.load(true);
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  setState(key: StateKey): void {
    this.stateKey = key;
    this.page = 1;
    this.load();
  }

  searchChanged(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 300);
  }

  applyFilters(): void {
    this.page = 1;
    this.refresh();
  }

  refresh(): void {
    this.load();
    this.loadCounts();
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  private query(state: StateKey, page: number, pageSize: number) {
    const [sort, direction] = this.sort.split('-') as ['scheduled' | 'created' | 'updated', 'asc' | 'desc'];
    return this.api.listPublicationsV2(page, pageSize, {
      channel: this.filters.channel || undefined,
      status: state === 'all' ? undefined : (state as PublicationState),
      siteId: this.filters.siteId || undefined,
      projectId: this.projectId || undefined,
      search: this.filters.search || undefined,
      sort,
      direction,
    });
  }

  load(silent = false): void {
    if (!silent) this.loading = true;
    this.query(this.stateKey, this.page, this.pageSize).subscribe({
      next: (response) => {
        this.items = response.items;
        this.total = response.total;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        if (!silent) {
          this.items = [];
          this.total = 0;
          this.error = 'Publications could not be loaded.';
        }
      },
    });
  }

  /** Real totals per state for the current channel, search and article. */
  private loadCounts(): void {
    forkJoin(Object.fromEntries(this.stateFilters.map((state) => [state.key, this.query(state.key, 1, 1)]))).subscribe({
      next: (responses) => (this.counts = Object.fromEntries(Object.entries(responses).map(([key, response]) => [key, response.total]))),
      error: () => (this.counts = {}),
    });
  }

  titleOf(item: StudioPublication): string {
    return item.socialContent?.body?.slice(0, 120) || item.version?.title || item.project?.title || 'Publication';
  }

  shortUrl(url: string): string {
    return url.replace(/^https?:\/\/(www\.)?/, '');
  }

  destination(item: StudioPublication): string {
    return item.channel === 'website' ? item.site?.name ?? 'Website' : item.account?.displayName ?? item.channel;
  }

  inspect(item: StudioPublication): void {
    this.api.getPublication(item.id).subscribe({
      next: (publication) => {
        this.selected = publication;
        const dialog = this.sheet?.nativeElement;
        if (dialog && !dialog.open) dialog.showModal();
      },
      error: () => (this.error = 'Publication details could not be loaded.'),
    });
  }

  closeSheet(): void {
    this.sheet?.nativeElement.close();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === this.sheet?.nativeElement) this.closeSheet();
  }

  canEdit(item: StudioPublication): boolean {
    return ['draft', 'ready', 'scheduled', 'failed', 'canceled'].includes(item.status);
  }

  statusTone(status: string): Tone {
    if (status === 'published' || status === 'draft_synced' || status === 'succeeded') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'scheduled') return 'info';
    if (['queued', 'publishing', 'processing', 'running'].includes(status)) return 'warning';
    return 'muted';
  }

  statusWord(status: string): string {
    const word = status.replace(/_/g, ' ');
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  verificationLabel(item: StudioPublication): string {
    const verification = item.metadata?.verification;
    if (item.status !== 'published') return '—';
    if (!verification) return 'Live URL not verified yet';
    return verification.state === 'verified' ? 'Live URL verified' : `Not verified: ${verification.detail}`;
  }

  failureReasonLabel(reason: string): string {
    return ({
      awaiting_retry: 'Retrying automatically',
      retries_exhausted: 'Retries exhausted',
      permanent_failure: 'Needs a fix before retry',
      release_blocked: 'Blocked before release',
      enqueue_failed: 'Could not be queued',
      stalled: 'Stalled: check the destination, then retry',
    } as Record<string, string>)[reason] ?? reason.replace(/_/g, ' ');
  }

  private blockerMessage(err: unknown): string | null {
    const message = (err as { error?: { error?: { message?: string } } })?.error?.error?.message ?? '';
    if (!message.startsWith('release_blocked:')) return null;
    return `Not released. Fix first: ${message.slice('release_blocked:'.length).split(',').map((code) => code.replace(/_/g, ' ')).join(', ')}.`;
  }

  dateLabel(value: string | null | undefined): string {
    return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  }

  /** After an action: refresh the list, the counts and the open sheet. */
  private afterAction(item: StudioPublication, message: string): void {
    this.toast.success(message);
    this.load(true);
    this.loadCounts();
    if (this.selected?.id === item.id) this.inspect(item);
  }

  retry(item: StudioPublication): void {
    this.api.retryPublication(item.id).subscribe({
      next: () => this.afterAction(item, 'Retry queued.'),
      error: () => this.toast.error('The publication could not be retried.'),
    });
  }

  publishNow(item: StudioPublication): void {
    this.api.publishNow(item.id).subscribe({
      next: () => this.afterAction(item, 'Publishing started.'),
      // 409 release_blocked:<codes> names what must be fixed before a human release.
      error: (err) => this.toast.error(this.blockerMessage(err) ?? 'The publication could not be started.'),
    });
  }

  async cancel(item: StudioPublication): Promise<void> {
    this.closeSheet();
    const confirmed = await this.confirm.confirm({
      title: `Cancel this scheduled ${item.channel} publication?`,
      message: 'The scheduled publication is removed and will not run.',
      confirmLabel: 'Cancel publication',
      danger: true,
    });
    if (!confirmed) return;
    this.api.cancelPublication(item.id).subscribe({
      next: () => this.afterAction(item, 'Publication canceled.'),
      error: () => this.toast.error('The publication could not be canceled.'),
    });
  }

  async unpublish(item: StudioPublication): Promise<void> {
    this.closeSheet();
    const destination = this.destination(item);
    const confirmed = await this.confirm.confirm({
      title: `Unpublish from ${destination}?`,
      message: `${item.channel === 'website' ? 'The remote article is removed' : 'The remote post is deleted'} on ${destination}. This cannot be undone automatically.`,
      confirmLabel: 'Unpublish',
      danger: true,
    });
    if (!confirmed) return;
    this.api.unpublishPublication(item.id).subscribe({
      next: () => this.afterAction(item, 'Unpublish started.'),
      error: () => this.toast.error('The publication could not be unpublished.'),
    });
  }

  async remove(item: StudioPublication): Promise<void> {
    this.closeSheet();
    const publishedExternally = item.status === 'published' && Boolean(item.externalId);
    const confirmed = await this.confirm.confirm({
      title: publishedExternally ? 'Delete the local record?' : `Delete this ${item.channel} publication record?`,
      message: publishedExternally
        ? `This publication is live on ${this.destination(item)}. Deleting here only removes the local record: unpublish first to remove it externally.`
        : 'Only the local publication record is removed.',
      confirmLabel: 'Delete record',
      danger: true,
    });
    if (!confirmed) return;
    this.api.deletePublication(item.id).subscribe({
      next: () => {
        this.toast.success('Publication record deleted.');
        this.load(true);
        this.loadCounts();
      },
      error: () => this.toast.error('The publication record could not be deleted.'),
    });
  }
}
