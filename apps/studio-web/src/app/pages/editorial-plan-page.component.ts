import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { EditorialPlan, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-editorial-plan-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Editorial control</p>
          <h1 class="au-page__title">Editorial Plan</h1>
          <p class="au-page__subtitle">Decide what to publish before generating the actual content.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--secondary" routerLink="/studio/calendar">
            <app-icon name="calendar"></app-icon>
            Open calendar
          </a>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <!-- Generate -->
      <section class="au-panel au-panel--padded au-mb-3">
        <h2 class="au-panel__title">Generate a plan</h2>
        <p class="au-panel__subtitle au-mb-3">Choose a period, channels and intent. AI proposes structured rows only.</p>
        <div class="au-plan-callout">
          <strong>Planning is separate from writing.</strong>
          Content is created later, one piece at a time, from approved rows.
        </div>
        <form (ngSubmit)="generate()">
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">From</span>
              <input class="au-input" type="date" name="dateFrom" [(ngModel)]="draft.dateFrom" required />
            </label>
            <label class="au-field">
              <span class="au-field__label">To</span>
              <input class="au-input" type="date" name="dateTo" [(ngModel)]="draft.dateTo" required />
            </label>
            <label class="au-field">
              <span class="au-field__label">Site</span>
              <select class="au-select" name="siteId" [(ngModel)]="draft.siteId" required>
                <option value="" disabled>Select a site</option>
                <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Publications</span>
              <input class="au-input" type="number" name="publicationCount" min="1" max="100" [(ngModel)]="draft.publicationCount" required />
            </label>
          </div>
          <label class="au-field">
            <span class="au-field__label">Objective</span>
            <input class="au-input" name="objective" [(ngModel)]="draft.objective" placeholder="Build search visibility around streaming news" />
          </label>
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Audience</span>
              <input class="au-input" name="audience" [(ngModel)]="draft.audience" placeholder="Audience description" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Topics</span>
              <input class="au-input" name="topics" [(ngModel)]="draft.topics" placeholder="Comma-separated topics" />
            </label>
          </div>
          <fieldset class="au-plan-channels">
            <legend class="au-field__label">Channels</legend>
            <label class="au-checkbox"><input type="checkbox" name="website" [(ngModel)]="channels.website" /> Website</label>
            <label class="au-checkbox"><input type="checkbox" name="x" [(ngModel)]="channels.x" /> X</label>
            <label class="au-checkbox"><input type="checkbox" name="instagram" [(ngModel)]="channels.instagram" /> Instagram</label>
          </fieldset>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="submit" [disabled]="generating">
              <app-icon name="sparkles"></app-icon>
              {{ generating ? 'Building plan…' : 'Generate plan with AI' }}
            </button>
          </div>
        </form>
      </section>

      <!-- Saved plans -->
      <section class="au-panel au-mb-3" *ngIf="plans.length > 0">
        <header class="au-panel__header">
          <h2 class="au-panel__title">Saved plans</h2>
          <span class="au-badge au-badge--neutral">{{ plans.length }}</span>
        </header>
        <button class="au-row" type="button" *ngFor="let plan of plans" (click)="open(plan)">
          <span class="au-row__title">{{ plan.name }}</span>
          <span class="au-badge" [class.au-badge--success]="plan.status === 'ready'" [class.au-badge--danger]="plan.status === 'failed'" [class.au-badge--neutral]="plan.status !== 'ready' && plan.status !== 'failed'">
            {{ plan.status }}
          </span>
          <span class="au-row__meta">{{ plan._count?.items || 0 }} rows</span>
          <app-icon name="chevron-right" class="au-faint"></app-icon>
        </button>
      </section>

      <!-- Selected plan -->
      <section class="au-panel" *ngIf="selectedPlan">
        <header class="au-panel__header">
          <div>
            <h2 class="au-panel__title">{{ selectedPlan.name }}</h2>
            <p class="au-panel__subtitle">{{ selectedPlan.items?.length || 0 }} planned rows</p>
          </div>
          <div class="au-page__actions">
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="bulkApprove()" [disabled]="selectedIds.size === 0">
              <app-icon name="circle-check"></app-icon>
              Approve selected
            </button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="bulkStatus('rejected')" [disabled]="selectedIds.size === 0">Reject selected</button>
            <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="bulkRemove()" [disabled]="selectedIds.size === 0">
              <app-icon name="trash"></app-icon>
              Delete selected
            </button>
          </div>
        </header>
        <div class="au-toolbar au-toolbar--panel">
          <div class="au-search">
            <app-icon name="search"></app-icon>
            <input class="au-input au-input--search" type="search" placeholder="Search rows…" [(ngModel)]="planSearch" (ngModelChange)="filterPlanRows()" />
          </div>
          <select class="au-select au-filter-select" [(ngModel)]="planChannelFilter" (ngModelChange)="filterPlanRows()" aria-label="Filter by channel">
            <option value="">All channels</option>
            <option value="website">Website</option>
            <option value="x">X</option>
            <option value="instagram">Instagram</option>
          </select>
          <select class="au-select au-filter-select" [(ngModel)]="planStatusFilter" (ngModelChange)="filterPlanRows()" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="proposed">Proposed</option>
            <option value="approved">Approved</option>
            <option value="generating">Generating</option>
            <option value="content_ready">Content ready</option>
            <option value="rejected">Rejected</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>

        @if (filteredPlanRows.length === 0) {
          <div class="au-empty">
            <p class="au-empty__title">No rows match the current filters</p>
            <p class="au-empty__text">Adjust the search or filters above.</p>
          </div>
        } @else {
          <div class="au-table-wrap">
            <table class="au-table">
              <thead>
                <tr>
                  <th style="width: 34px">
                    <input type="checkbox" aria-label="Select all proposed rows" (change)="selectAll($event)" />
                  </th>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Channel</th>
                  <th>Keyword</th>
                  <th>SEO title</th>
                  <th>Status</th>
                  <th style="width: 210px">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of filteredPlanRows" [class.is-selected]="selectedIds.has(item.id)">
                  <td>
                    <input type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelection(item.id)" [attr.aria-label]="'Select ' + item.title" />
                  </td>
                  <td class="au-nowrap">
                    <ng-container *ngIf="editingItemId !== item.id">
                      {{ item.scheduledFor | date: 'mediumDate' }}
                      <span class="au-table__sub">{{ item.scheduledFor | date: 'shortTime' }}</span>
                    </ng-container>
                    <input
                      *ngIf="editingItemId === item.id"
                      class="au-input"
                      type="datetime-local"
                      [(ngModel)]="editDraft.scheduledFor"
                      [attr.aria-label]="'Schedule ' + item.title"
                    />
                  </td>
                  <td>
                    <ng-container *ngIf="editingItemId !== item.id">
                      <span class="au-table__title">{{ item.title }}</span>
                      <span class="au-table__sub">{{ item.topic || 'Unassigned topic' }}</span>
                    </ng-container>
                    <input *ngIf="editingItemId === item.id" class="au-input" [(ngModel)]="editDraft.title" [attr.aria-label]="'Title for ' + item.title" />
                  </td>
                  <td>
                    <span class="au-channel" [class]="'au-channel--' + item.channel">{{ item.channel }}</span>
                  </td>
                  <td>
                    <ng-container *ngIf="editingItemId !== item.id">{{ item.primaryKeyword || '—' }}</ng-container>
                    <input *ngIf="editingItemId === item.id" class="au-input" [(ngModel)]="editDraft.primaryKeyword" aria-label="Primary keyword" />
                  </td>
                  <td class="au-muted">
                    <ng-container *ngIf="editingItemId !== item.id">{{ item.seoTitle || '—' }}</ng-container>
                    <input *ngIf="editingItemId === item.id" class="au-input" [(ngModel)]="editDraft.seoTitle" aria-label="SEO title" />
                  </td>
                  <td>
                    <span class="au-badge" [class]="'au-badge--' + statusTone(item.status)">{{ item.status }}</span>
                  </td>
                  <td>
                    <div class="au-inline">
                      <ng-container *ngIf="editingItemId === item.id">
                        <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="saveEdit(item.id)">Save</button>
                        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="cancelEdit()">Cancel</button>
                      </ng-container>
                      <ng-container *ngIf="editingItemId !== item.id">
                        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="startEdit(item)">Edit</button>
                        <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="item.status === 'proposed'" (click)="approve(item.id)">Approve</button>
                        <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="item.status === 'approved' && !item.projectId" (click)="generateContent(item.id)">
                          <app-icon name="sparkles"></app-icon>
                          Generate content
                        </button>
                        <button class="au-btn au-btn--danger-ghost au-btn--icon au-btn--sm" type="button" *ngIf="!item.projectId" (click)="remove(item.id)" [attr.aria-label]="'Delete ' + item.title">
                          <app-icon name="trash"></app-icon>
                        </button>
                      </ng-container>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        }
      </section>

      <app-empty-state
        *ngIf="!loading && plans.length === 0 && !loadError"
        icon="plan"
        title="No plan yet"
        text="Generate an AI plan for the next publishing period to see structured rows here."
      ></app-empty-state>
    </section>
  `,
})
export class EditorialPlanPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  sites: StudioSite[] = [];
  plans: EditorialPlan[] = [];
  selectedPlan: EditorialPlan | null = null;
  loading = true;
  generating = false;
  error = '';
  loadError = '';
  selectedIds = new Set<string>();
  editingItemId = '';
  editDraft = { title: '', primaryKeyword: '', seoTitle: '', scheduledFor: '' };
  planSearch = '';
  planChannelFilter = '';
  planStatusFilter = '';
  filteredPlanRows: Array<NonNullable<EditorialPlan['items']>[number]> = [];
  channels = { website: true, x: true, instagram: false };
  draft = { dateFrom: new Date().toISOString().slice(0, 10), dateTo: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10), siteId: '', objective: '', audience: '', topics: '', publicationCount: 7 };

  ngOnInit(): void { this.sites = this.appContext.sites(); this.draft.siteId = this.appContext.activeSite()?.id ?? this.sites[0]?.id ?? ''; this.load(); }
  load(): void {
    this.loading = true;
    this.api.listEditorialPlans().subscribe({ next: (response) => { this.plans = response.items; this.loading = false; }, error: () => { this.loadError = 'Editorial plans could not be loaded. Try again.'; this.loading = false; } });
  }
  open(plan: EditorialPlan): void { this.api.getEditorialPlan(plan.id).subscribe({ next: (detail) => { this.selectedPlan = detail; this.filterPlanRows(); }, error: () => { this.loadError = 'This editorial plan could not be opened.'; } }); }
  filterPlanRows(): void {
    const query = this.planSearch.trim().toLowerCase();
    this.filteredPlanRows = (this.selectedPlan?.items ?? []).filter((item) => {
      if (this.planChannelFilter && item.channel !== this.planChannelFilter) return false;
      if (this.planStatusFilter && item.status !== this.planStatusFilter) return false;
      if (!query) return true;
      return [item.title, item.topic ?? '', item.primaryKeyword ?? '', item.seoTitle ?? ''].some((value) => value.toLowerCase().includes(query));
    });
  }
  toggleSelection(itemId: string): void { this.selectedIds = new Set(this.selectedIds); this.selectedIds.has(itemId) ? this.selectedIds.delete(itemId) : this.selectedIds.add(itemId); }
  startEdit(item: NonNullable<EditorialPlan['items']>[number]): void { this.editingItemId = item.id; this.editDraft = { title: item.title, primaryKeyword: item.primaryKeyword || '', seoTitle: item.seoTitle || '', scheduledFor: item.scheduledFor ? new Date(item.scheduledFor).toISOString().slice(0, 16) : '' }; }
  cancelEdit(): void { this.editingItemId = ''; }
  saveEdit(itemId: string): void { this.api.updateEditorialPlanItem(itemId, { title: this.editDraft.title, primaryKeyword: this.editDraft.primaryKeyword || null, seoTitle: this.editDraft.seoTitle || null, scheduledFor: this.editDraft.scheduledFor ? new Date(this.editDraft.scheduledFor).toISOString() : null }).subscribe({ next: () => { this.editingItemId = ''; this.refreshSelected(); }, error: () => { this.error = 'The planned row could not be saved.'; } }); }
  selectAll(event: Event): void { const checked = (event.target as HTMLInputElement).checked; this.selectedIds = new Set(checked ? (this.selectedPlan?.items ?? []).filter((item) => item.status === 'proposed').map((item) => item.id) : []); }
  approve(itemId: string): void { this.api.approveEditorialPlanItem(itemId).subscribe({ next: () => this.refreshSelected(), error: () => { this.error = 'The row could not be approved.'; } }); }
  bulkApprove(): void { this.api.bulkApproveEditorialPlanItems([...this.selectedIds]).subscribe({ next: () => { this.selectedIds.clear(); this.refreshSelected(); }, error: () => { this.error = 'Selected rows could not be approved.'; } }); }
  bulkStatus(status: 'approved' | 'rejected' | 'proposed' | 'canceled'): void { this.api.bulkSetEditorialPlanItemStatus([...this.selectedIds], status).subscribe({ next: () => { this.selectedIds.clear(); this.refreshSelected(); }, error: () => { this.error = 'Selected rows could not be updated.'; } }); }
  bulkRemove(): void { void this.confirmBulkRemove(); }
  private async confirmBulkRemove(): Promise<void> {
    const count = this.selectedIds.size;
    const confirmed = await this.confirm.confirm({
      title: `Delete ${count} planned row${count === 1 ? '' : 's'}?`,
      message: 'Rows that already generated content are not deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.api.bulkDeleteEditorialPlanItems([...this.selectedIds]).subscribe({ next: () => { this.selectedIds.clear(); this.refreshSelected(); this.toast.success('Planned rows deleted.'); }, error: (err) => { this.error = err?.error?.error?.message || 'Selected rows could not be deleted.'; } });
  }
  remove(itemId: string): void { void this.confirmRemove(itemId); }
  private async confirmRemove(itemId: string): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Delete this planned row?',
      message: 'This cannot be undone. Rows that already generated content are not deleted.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.api.deleteEditorialPlanItem(itemId).subscribe({ next: () => this.refreshSelected(), error: (err) => { this.error = err?.error?.error?.message || 'The planned row could not be deleted.'; } });
  }
  generateContent(itemId: string): void { this.api.generateContentFromEditorialPlanItem(itemId).subscribe({ next: () => { this.toast.success('Content generation started from the approved row.'); this.refreshSelected(); }, error: (err) => { this.error = err?.error?.error?.message || 'Content could not be generated from this row.'; } }); }
  private refreshSelected(): void { if (this.selectedPlan) this.open(this.selectedPlan); }
  statusTone(status: string): 'success' | 'danger' | 'warning' | 'brand' | 'neutral' {
    switch (status) {
      case 'approved':
        return 'success';
      case 'rejected':
      case 'canceled':
        return 'danger';
      case 'proposed':
        return 'warning';
      case 'generating':
      case 'content_ready':
        return 'brand';
      default:
        return 'neutral';
    }
  }
  generate(): void {
    this.error = '';
    const channels = (Object.keys(this.channels) as Array<'website' | 'x' | 'instagram'>).filter((channel) => this.channels[channel]);
    if (channels.length === 0) { this.error = 'Select at least one channel.'; return; }
    this.generating = true;
    this.api.generateEditorialPlan({ dateFrom: this.draft.dateFrom, dateTo: this.draft.dateTo, siteId: this.draft.siteId || undefined, objective: this.draft.objective || undefined, audience: this.draft.audience || undefined, topics: this.draft.topics.split(',').map((topic) => topic.trim()).filter(Boolean), channels, publicationCount: Number(this.draft.publicationCount) }).subscribe({
      next: (plan) => { this.generating = false; this.plans = [plan, ...this.plans]; this.selectedPlan = plan; this.filterPlanRows(); },
      error: (err) => { this.generating = false; this.error = err?.error?.error?.message || err?.error?.message || 'The editorial plan could not be generated.'; },
    });
  }
}
