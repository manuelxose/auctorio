import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import type { EditorialPlan, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-editorial-plan-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-eyebrow">Editorial control</p>
          <h1 class="au-page__title">Editorial Plan</h1>
          <p class="au-page__subtitle">Plan what to publish before generating the actual content.</p>
        </div>
      </header>

      <section class="au-surface au-surface--padded">
        <div class="au-plan-callout"><strong>Planning is separate from writing.</strong> AI will propose structured rows only. Content is created later from approved items.</div>
        <form class="au-form" (ngSubmit)="generate()">
          <div class="au-field-grid">
            <label class="au-field"><span class="au-field__label">From</span><input class="au-input" type="date" name="dateFrom" [(ngModel)]="draft.dateFrom" required /></label>
            <label class="au-field"><span class="au-field__label">To</span><input class="au-input" type="date" name="dateTo" [(ngModel)]="draft.dateTo" required /></label>
            <label class="au-field"><span class="au-field__label">Site</span><select class="au-input" name="siteId" [(ngModel)]="draft.siteId" required><option value="" disabled>Select a site</option><option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option></select></label>
            <label class="au-field"><span class="au-field__label">Publications</span><input class="au-input" type="number" name="publicationCount" min="1" max="100" [(ngModel)]="draft.publicationCount" required /></label>
          </div>
          <label class="au-field"><span class="au-field__label">Objective</span><input class="au-input" name="objective" [(ngModel)]="draft.objective" placeholder="Build search visibility around streaming news" /></label>
          <div class="au-field-grid">
            <label class="au-field"><span class="au-field__label">Audience</span><input class="au-input" name="audience" [(ngModel)]="draft.audience" placeholder="Audience description" /></label>
            <label class="au-field"><span class="au-field__label">Topics</span><input class="au-input" name="topics" [(ngModel)]="draft.topics" placeholder="Comma-separated topics" /></label>
          </div>
          <fieldset class="au-plan-channels"><legend class="au-field__label">Channels</legend><label><input type="checkbox" name="website" [(ngModel)]="channels.website" /> Website</label><label><input type="checkbox" name="x" [(ngModel)]="channels.x" /> X</label><label><input type="checkbox" name="instagram" [(ngModel)]="channels.instagram" /> Instagram</label></fieldset>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <button class="au-button au-button--primary" type="submit" [disabled]="generating">{{ generating ? 'Generating plan...' : 'Generate plan with AI' }}</button>
        </form>
      </section>

      <div class="au-banner au-banner--error" *ngIf="loadError">{{ loadError }}</div>
      <section class="au-surface" *ngIf="plans.length > 0">
        <header class="au-surface__header"><h2 class="au-surface__title">Saved plans</h2><span class="au-tag">{{ plans.length }}</span></header>
        <button class="au-row" type="button" *ngFor="let plan of plans" (click)="open(plan)"><span class="au-row__title">{{ plan.name }}</span><span class="au-tag" [class.au-tag--success]="plan.status === 'ready'" [class.au-tag--danger]="plan.status === 'failed'">{{ plan.status }}</span><span class="au-row__meta">{{ plan._count?.items || 0 }} rows</span></button>
      </section>

      <section class="au-surface" *ngIf="selectedPlan">
        <header class="au-surface__header"><h2 class="au-surface__title">{{ selectedPlan.name }}</h2><div class="au-inline"><span class="au-tag au-tag--success">{{ selectedPlan.items?.length || 0 }} planned</span><button class="au-button au-button--secondary au-button--sm" type="button" (click)="bulkApprove()" [disabled]="selectedIds.size === 0">Approve selected</button><button class="au-button au-button--ghost au-button--sm" type="button" (click)="bulkStatus('rejected')" [disabled]="selectedIds.size === 0">Reject selected</button><button class="au-button au-button--ghost au-button--sm au-button--danger" type="button" (click)="bulkRemove()" [disabled]="selectedIds.size === 0">Delete selected</button></div></header>
        <div class="au-toolbar au-toolbar--wrap">
          <input class="au-input au-input--search" type="search" placeholder="Search rows…" [(ngModel)]="planSearch" (ngModelChange)="filterPlanRows()" />
          <select class="au-input au-input--inline" [(ngModel)]="planChannelFilter" (ngModelChange)="filterPlanRows()"><option value="">All channels</option><option value="website">Website</option><option value="x">X</option><option value="instagram">Instagram</option></select>
          <select class="au-input au-input--inline" [(ngModel)]="planStatusFilter" (ngModelChange)="filterPlanRows()"><option value="">All statuses</option><option value="proposed">Proposed</option><option value="approved">Approved</option><option value="generating">Generating</option><option value="content_ready">Content ready</option><option value="rejected">Rejected</option><option value="canceled">Canceled</option></select>
        </div>
        <div class="au-plan-table-wrap"><table class="au-plan-table"><thead><tr><th><input type="checkbox" aria-label="Select all proposed rows" (change)="selectAll($event)" /></th><th>Date</th><th>Title</th><th>Channel</th><th>Keyword</th><th>SEO title</th><th>Status</th><th>Actions</th></tr></thead><tbody><tr *ngFor="let item of filteredPlanRows"><td><input type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelection(item.id)" [attr.aria-label]="'Select ' + item.title" /></td><td *ngIf="editingItemId !== item.id">{{ item.scheduledFor | date:'mediumDate' }}<br /><small>{{ item.scheduledFor | date:'shortTime' }}</small></td><td *ngIf="editingItemId === item.id"><input class="au-input au-input--compact" type="datetime-local" [(ngModel)]="editDraft.scheduledFor" [attr.aria-label]="'Schedule ' + item.title" /></td><td *ngIf="editingItemId !== item.id"><strong>{{ item.title }}</strong><small>{{ item.topic || 'Unassigned topic' }}</small></td><td *ngIf="editingItemId === item.id"><input class="au-input au-input--compact" [(ngModel)]="editDraft.title" [attr.aria-label]="'Title for ' + item.title" /></td><td><span class="au-tag">{{ item.channel }}</span></td><td *ngIf="editingItemId !== item.id">{{ item.primaryKeyword || '—' }}</td><td *ngIf="editingItemId === item.id"><input class="au-input au-input--compact" [(ngModel)]="editDraft.primaryKeyword" aria-label="Primary keyword" /></td><td *ngIf="editingItemId !== item.id">{{ item.seoTitle || '—' }}</td><td *ngIf="editingItemId === item.id"><input class="au-input au-input--compact" [(ngModel)]="editDraft.seoTitle" aria-label="SEO title" /></td><td><span class="au-tag" [class.au-tag--success]="item.status === 'approved'" [class.au-tag--warning]="item.status === 'proposed'">{{ item.status }}</span></td><td><div class="au-inline"><button class="au-button au-button--ghost au-button--sm" type="button" *ngIf="editingItemId !== item.id" (click)="startEdit(item)">Edit</button><button class="au-button au-button--primary au-button--sm" type="button" *ngIf="editingItemId === item.id" (click)="saveEdit(item.id)">Save</button><button class="au-button au-button--ghost au-button--sm" type="button" *ngIf="editingItemId === item.id" (click)="cancelEdit()">Cancel</button><button class="au-button au-button--ghost au-button--sm" type="button" *ngIf="editingItemId !== item.id && item.status === 'proposed'" (click)="approve(item.id)">Approve</button><button class="au-button au-button--secondary au-button--sm" type="button" *ngIf="editingItemId !== item.id && item.status === 'approved' && !item.projectId" (click)="generateContent(item.id)">Generate content</button><button class="au-button au-button--ghost au-button--sm au-button--danger" type="button" *ngIf="editingItemId !== item.id && !item.projectId" (click)="remove(item.id)">Delete</button></div></td></tr></tbody></table></div>
      </section>
      <div class="au-empty" *ngIf="!loading && plans.length === 0 && !loadError">No publications planned for this period. Generate an AI plan to start.</div>
    </section>
  `,
})
export class EditorialPlanPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
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
  bulkRemove(): void { if (!window.confirm(`Delete ${this.selectedIds.size} selected planned row(s)?`)) return; this.api.bulkDeleteEditorialPlanItems([...this.selectedIds]).subscribe({ next: () => { this.selectedIds.clear(); this.refreshSelected(); }, error: (err) => { this.error = err?.error?.error?.message || 'Selected rows could not be deleted.'; } }); }
  remove(itemId: string): void { if (!window.confirm('Delete this planned row?')) return; this.api.deleteEditorialPlanItem(itemId).subscribe({ next: () => this.refreshSelected(), error: (err) => { this.error = err?.error?.error?.message || 'The planned row could not be deleted.'; } }); }
  generateContent(itemId: string): void { this.api.generateContentFromEditorialPlanItem(itemId).subscribe({ next: () => this.refreshSelected(), error: (err) => { this.error = err?.error?.error?.message || 'Content could not be generated from this row.'; } }); }
  private refreshSelected(): void { if (this.selectedPlan) this.open(this.selectedPlan); }
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
