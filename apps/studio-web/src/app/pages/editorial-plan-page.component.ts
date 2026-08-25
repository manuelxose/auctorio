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
import type { EditorialPlan, SiteIntelligenceOverview, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-editorial-plan-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  styles: [
    `
      .au-panel__header--wrap { flex-wrap: wrap; align-items: flex-start; }
      .au-min-0 { min-width: 0; }
      .au-accordion-toggle { width: 100%; text-align: left; background: transparent; border: none; font: inherit; cursor: pointer; }
      .au-accordion-toggle:hover { background: var(--au-surface-hover); }
      .au-plan-row { cursor: pointer; }
      .au-plan-row:hover td { background: var(--au-surface-hover); }
      .au-plan-row.is-open td { background: var(--au-surface-selected); }
      .au-plan-detail-row td { background: var(--au-surface-2); padding: 0; }
      .au-plan-detail { border-bottom: 1px solid var(--au-border); }
      .au-plan-summary { display: flex; align-items: center; gap: var(--au-s3); padding: var(--au-s2) var(--au-s4); border-bottom: 1px solid var(--au-border); flex-wrap: wrap; }
      .au-plan-summary__bar { display: flex; flex: 1 1 240px; height: 8px; border-radius: 999px; background: var(--au-surface); overflow: hidden; }
      .au-plan-summary__fill { height: 100%; }
      .au-plan-summary__fill--approved { background: var(--au-success); }
      .au-plan-summary__fill--ready { background: var(--au-brand); }
      .au-plan-summary__legend { display: flex; flex-wrap: wrap; gap: var(--au-s3); font-size: var(--au-fs-metadata); color: var(--au-muted); }
      .au-legend { display: inline-flex; align-items: center; gap: 6px; }
      .au-legend__dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
    `,
  ],
  template: `
    <section class="au-page">
      <header class="au-page__header au-page__header--split">
        <div>
          <p class="au-page__eyebrow">Editorial control</p>
          <h1 class="au-page__title">Editorial Plan</h1>
          <p class="au-page__subtitle">Decide what to publish before generating the actual content.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--secondary" type="button" (click)="showForm = !showForm">
            <app-icon name="sparkles"></app-icon>
            {{ showForm ? 'Hide generator' : 'Generate a plan' }}
          </button>
          <a class="au-btn au-btn--ghost" routerLink="/studio/calendar">
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

      <!-- Generate (collapsible so the plan table stays the primary view) -->
      <section class="au-panel au-mb-3" *ngIf="showForm">
        <header class="au-panel__header">
          <div>
            <h2 class="au-panel__title">Generate a plan</h2>
            <p class="au-panel__subtitle">Period, destination and strategy. AI proposes site-aware structured briefs only.</p>
          </div>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="showForm = false" aria-label="Close generator">
            <app-icon name="close"></app-icon>
          </button>
        </header>

        <div class="au-panel--padded">
        <div class="au-plan-callout">
          <strong>Planning is separate from writing.</strong>
          Content is created later, one piece at a time, from approved rows.
        </div>

        <!-- Site intelligence summary -->
        <div class="au-si-strip" *ngIf="siteIntel">
          <div class="au-si-strip__title">
            <app-icon name="scan"></app-icon>
            <span><strong>Using current site intelligence</strong></span>
            <span class="au-badge au-badge--success" *ngIf="siteIntel.profile">ready</span>
            <span class="au-badge au-badge--warning" *ngIf="!siteIntel.profile">missing</span>
          </div>
          <div class="au-si-strip__facts">
            <span>{{ siteIntel.totalPages }} pages indexed</span>
            <span>{{ siteIntel.extractedPages }} crawled</span>
            <span>{{ siteIntel.profile?.topicClusters?.length ?? 0 }} topic clusters</span>
            <span>{{ (siteIntel.profile?.mainTopics ?? []).slice(0, 4).join(', ') || 'no topics yet' }}</span>
            <span *ngIf="siteIntel.lastRun">last crawl: {{ siteIntel.lastRun | date: 'short' }}</span>
            <span *ngIf="siteIntel.profile?.warnings?.length" class="au-muted">{{ siteIntel.profile?.warnings?.length }} warning(s)</span>
          </div>
          <div class="au-si-strip__actions">
            <a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/site-intelligence">
              <app-icon name="scan"></app-icon>
              Open site intelligence
            </a>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="intelRefreshing" (click)="refreshIntel()">
              <app-icon name="refresh"></app-icon>
              {{ intelRefreshing ? 'Refreshing…' : 'Refresh site intelligence' }}
            </button>
          </div>
        </div>
        <div class="au-si-strip au-si-strip--empty" *ngIf="!siteIntel && draft.siteId && !intelRefreshing">
          <app-icon name="scan"></app-icon>
          <span><strong>No site intelligence for this destination.</strong> Index the website before planning so ideas are grounded in its real content.</span>
          <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="intelRefreshing" (click)="refreshIntel(true)">
            Index website before planning
          </button>
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
              <select class="au-select" name="siteId" [(ngModel)]="draft.siteId" (ngModelChange)="onSiteChange()" required>
                <option value="" disabled>Select a site</option>
                <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Publications</span>
              <input class="au-input" type="number" name="publicationCount" min="1" max="100" [(ngModel)]="draft.publicationCount" required />
            </label>
          </div>
          <fieldset class="au-plan-channels">
            <legend class="au-field__label">Channels</legend>
            <label class="au-checkbox"><input type="checkbox" name="website" [(ngModel)]="channels.website" /> Website</label>
            <label class="au-checkbox"><input type="checkbox" name="x" [(ngModel)]="channels.x" /> X</label>
            <label class="au-checkbox"><input type="checkbox" name="instagram" [(ngModel)]="channels.instagram" /> Instagram</label>
          </fieldset>

          <h3 class="au-panel__subtitle au-mt-2 au-mb-1"><strong>Strategy</strong></h3>
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Editorial strategy mode</span>
              <select class="au-select" name="strategyMode" [(ngModel)]="strategy.mode">
                <option *ngFor="let mode of strategyModes" [value]="mode.value">{{ mode.label }}</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Primary search intent</span>
              <select class="au-select" name="primaryIntent" [(ngModel)]="strategy.primaryIntent">
                <option value="">Auto</option>
                <option *ngFor="let intent of intents" [value]="intent">{{ intent }}</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Campaign / objective name</span>
              <input class="au-input" name="campaignName" [(ngModel)]="strategy.campaignName" placeholder="e.g. September streaming push" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Market / country</span>
              <input class="au-input" name="market" [(ngModel)]="strategy.market" placeholder="e.g. Spain" />
            </label>
          </div>
          <label class="au-field">
            <span class="au-field__label">Content formats</span>
            <div class="au-format-pills">
              <label class="au-checkbox" *ngFor="let format of contentFormats">
                <input type="checkbox" [checked]="strategy.contentFormats.includes(format)" (change)="toggleFormat(format)" /> {{ format }}
              </label>
            </div>
          </label>
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Objective</span>
              <input class="au-input" name="objective" [(ngModel)]="draft.objective" placeholder="Build search visibility around streaming news" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Audience</span>
              <input class="au-input" name="audience" [(ngModel)]="draft.audience" placeholder="Audience description" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Priority topics</span>
              <input class="au-input" name="topics" [(ngModel)]="draft.topics" placeholder="Comma-separated topics" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Excluded topics</span>
              <input class="au-input" name="excludedTopics" [(ngModel)]="draft.excludedTopics" placeholder="Comma-separated" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Keyword seeds</span>
              <input class="au-input" name="keywordSeeds" [(ngModel)]="strategy.keywordSeeds" placeholder="Comma-separated queries" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Seasonal events</span>
              <input class="au-input" name="seasonalEvents" [(ngModel)]="strategy.seasonalEvents" placeholder="Comma-separated events" />
            </label>
          </div>

          <p class="au-error" *ngIf="error">{{ error }}</p>

          <div class="au-progress-steps" *ngIf="generating">
            <span class="au-progress-step" *ngFor="let step of progressSteps" [class.is-active]="progressIndex === step.index" [class.is-done]="progressIndex > step.index">
              <app-icon name="circle-check" *ngIf="progressIndex > step.index"></app-icon>
              <app-icon name="sparkles" *ngIf="progressIndex === step.index"></app-icon>
              {{ step.label }}
            </span>
          </div>

          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="submit" [disabled]="generating || intelRefreshing">
              <app-icon name="sparkles"></app-icon>
              {{ generating ? 'Building plan…' : 'Generate plan with AI' }}
            </button>
            <span class="au-muted" *ngIf="!siteIntel && draft.siteId">The plan will be site-aware once the destination is indexed.</span>
          </div>
        </form>
        </div>
      </section>

      <!-- Saved plans: one expandable table -->
      <section class="au-panel" *ngIf="plans.length > 0">
        <header class="au-panel__header">
          <div>
            <h2 class="au-panel__title">Saved plans</h2>
            <p class="au-panel__subtitle">Click a plan to expand its rows in place.</p>
          </div>
          <span class="au-badge au-badge--neutral">{{ plans.length }} plan{{ plans.length === 1 ? '' : 's' }}</span>
        </header>

        <div class="au-table-wrap">
          <table class="au-table au-table--hover">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Period</th>
                <th scope="col">Site</th>
                <th scope="col">Status</th>
                <th scope="col">Rows</th>
                <th scope="col">Ready</th>
                <th scope="col" class="au-table__actions"><span class="au-visually-hidden">Expand</span></th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngFor="let plan of plans">
                <tr class="au-plan-row" [class.is-open]="isExpanded(plan.id)" (click)="togglePlan(plan)" (keydown.enter)="togglePlan(plan)" [attr.tabindex]="0" [attr.aria-expanded]="isExpanded(plan.id)">
                  <td data-label="Plan">
                    <span class="au-table__title">{{ plan.name }}</span>
                    <span class="au-table__sub">{{ plan.strategyMode || '—' }}<ng-container *ngIf="channelList(plan).length > 0"> · {{ channelList(plan).map(channelLabel).join(', ') }}</ng-container></span>
                  </td>
                  <td data-label="Period">{{ plan.dateFrom | date: 'mediumDate' }} → {{ plan.dateTo | date: 'mediumDate' }}</td>
                  <td data-label="Site">{{ plan.siteName || '—' }}</td>
                  <td data-label="Status">
                    <span class="au-badge" [class]="'au-badge--' + planStatusTone(plan.status)">{{ plan.status }}</span>
                  </td>
                  <td data-label="Rows">{{ plan._count?.items ?? 0 }}</td>
                  <td data-label="Ready">
                    <div class="au-progress">
                      <span class="au-progress__bar" [style.width.%]="listPlanProgress(plan)"></span>
                    </div>
                    <span class="au-table__meta">{{ plan.statusCounts?.['content_ready'] ?? 0 }} of {{ plan._count?.items ?? 0 }} ready</span>
                  </td>
                  <td class="au-table__actions">
                    <app-icon [name]="isExpanded(plan.id) ? 'chevron-up' : 'chevron-down'" class="au-faint"></app-icon>
                  </td>
                </tr>

                <tr class="au-plan-detail-row" *ngIf="isExpanded(plan.id)">
                  <td colspan="7">
                    <div class="au-plan-detail">
                      <div class="au-skeleton" *ngIf="planDetailLoading" style="margin: var(--au-s3) var(--au-s4)">Loading plan…</div>

                      <ng-container *ngIf="!planDetailLoading && selectedPlan?.id === plan.id">
                        <!-- Summary -->
                        <div class="au-plan-summary">
                          <div class="au-plan-summary__bar" role="progressbar" [attr.aria-valuenow]="planProgress()" aria-valuemin="0" aria-valuemax="100">
                            <span class="au-plan-summary__fill au-plan-summary__fill--approved" [style.width.%]="planShare('approved')"></span>
                            <span class="au-plan-summary__fill au-plan-summary__fill--ready" [style.width.%]="planShare('content_ready')"></span>
                          </div>
                          <div class="au-plan-summary__legend">
                            <span class="au-legend"><span class="au-legend__dot" style="background: var(--au-success)"></span>{{ planCount('approved') }} approved</span>
                            <span class="au-legend"><span class="au-legend__dot" style="background: var(--au-brand)"></span>{{ planCount('content_ready') }} ready</span>
                            <span class="au-legend"><span class="au-legend__dot" style="background: var(--au-warning)"></span>{{ planCount('proposed') }} proposed</span>
                            <span class="au-legend"><span class="au-legend__dot" style="background: var(--au-danger)"></span>{{ planCount('rejected') }} rejected</span>
                          </div>
                          <div class="au-inline">
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
                        </div>

                        <!-- Row filters -->
                        <div class="au-toolbar au-toolbar--panel">
                          <div class="au-search">
                            <app-icon name="search"></app-icon>
                            <input class="au-input au-input--search" type="search" placeholder="Search rows…" [(ngModel)]="planSearch" (ngModelChange)="filterPlanRows()" aria-label="Search plan rows" />
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
                          <span class="au-muted au-toolbar__spacer">{{ filteredPlanRows.length }} of {{ selectedPlan?.items?.length || 0 }} rows</span>
                        </div>

                        <!-- Rows -->
                        @if (filteredPlanRows.length === 0) {
                          <div class="au-empty">
                            <p class="au-empty__title">No rows match the current filters</p>
                            <p class="au-empty__text">Adjust the search or filters above.</p>
                          </div>
                        } @else {
                          <div class="au-table-wrap au-table-wrap--scrollable">
                            <table class="au-table">
                              <thead>
                                <tr>
                                  <th style="width: 34px">
                                    <input type="checkbox" aria-label="Select all proposed rows" (change)="selectAll($event)" />
                                  </th>
                                  <th>Date</th>
                                  <th>Title</th>
                                  <th>Type</th>
                                  <th>Intent</th>
                                  <th>Relevance</th>
                                  <th>Risk</th>
                                  <th>Status</th>
                                  <th style="width: 210px">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                <ng-container *ngFor="let item of pagedPlanRows()">
                                  <tr [class.is-selected]="selectedIds.has(item.id)">
                                    <td>
                                      <input type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelection(item.id)" [attr.aria-label]="'Select ' + item.title" />
                                    </td>
                                    <td class="au-nowrap">
                                      <ng-container *ngIf="editingItemId !== item.id">
                                        {{ item.scheduledFor | date: 'mediumDate' }}
                                        <span class="au-table__sub">{{ item.scheduledFor | date: 'shortTime' }}</span>
                                      </ng-container>
                                      <input *ngIf="editingItemId === item.id" class="au-input" type="datetime-local" [(ngModel)]="editDraft.scheduledFor" [attr.aria-label]="'Schedule ' + item.title" />
                                    </td>
                                    <td>
                                      <ng-container *ngIf="editingItemId !== item.id">
                                        <span class="au-table__title">{{ item.title }}</span>
                                        <span class="au-table__sub">{{ item.topicCluster ? 'Cluster: ' + item.topicCluster : (item.topic || 'Unassigned topic') }}</span>
                                      </ng-container>
                                      <input *ngIf="editingItemId === item.id" class="au-input" [(ngModel)]="editDraft.title" [attr.aria-label]="'Title for ' + item.title" />
                                    </td>
                                    <td>
                                      <span class="au-channel">{{ item.contentType || 'article' }}</span>
                                    </td>
                                    <td>
                                      <span class="au-badge au-badge--neutral">{{ item.primaryIntent || 'auto' }}</span>
                                      <span class="au-table__sub" *ngIf="item.targetQuery">{{ item.targetQuery }}</span>
                                    </td>
                                    <td>
                                      <ng-container *ngIf="item.relevanceScore !== null && item.relevanceScore !== undefined">
                                        <span class="au-score" [class.au-score--low]="(item.relevanceScore ?? 0) < 45" [class.au-score--good]="(item.relevanceScore ?? 0) >= 70">{{ item.relevanceScore }}</span>
                                      </ng-container>
                                      <span class="au-muted" *ngIf="item.relevanceScore === null || item.relevanceScore === undefined">—</span>
                                    </td>
                                    <td>
                                      <span class="au-badge" [class.au-badge--success]="item.cannibalizationRisk === 'none'" [class.au-badge--warning]="item.cannibalizationRisk === 'related-cluster'" [class.au-badge--danger]="item.cannibalizationRisk === 'high' || item.cannibalizationRisk === 'update-existing'" [class.au-badge--neutral]="!item.cannibalizationRisk">{{ item.cannibalizationRisk || '—' }}</span>
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
                                          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="toggleExpand(item.id)" [attr.aria-expanded]="expandedItemId === item.id">
                                            <app-icon name="chevron-down" *ngIf="expandedItemId !== item.id"></app-icon>
                                            <app-icon name="chevron-up" *ngIf="expandedItemId === item.id"></app-icon>
                                            Brief
                                          </button>
                                          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="startEdit(item)">Edit</button>
                                          <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="item.status === 'proposed'" (click)="approve(item.id)">Approve</button>
                                          <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="item.status === 'approved' && !item.projectId" (click)="generateContent(item.id)">
                                            <app-icon name="sparkles"></app-icon>
                                            Generate
                                          </button>
                                          <button class="au-btn au-btn--danger-ghost au-btn--icon au-btn--sm" type="button" *ngIf="!item.projectId" (click)="remove(item.id)" [attr.aria-label]="'Delete ' + item.title">
                                            <app-icon name="trash"></app-icon>
                                          </button>
                                        </ng-container>
                                      </div>
                                    </td>
                                  </tr>
                                  <tr class="au-brief-row" *ngIf="expandedItemId === item.id && editingItemId !== item.id">
                                    <td colspan="9">
                                      <div class="au-brief">
                                        <div class="au-field-grid">
                                          <div class="au-meta">
                                            <strong>Rationale</strong>
                                            <p class="au-muted">{{ item.rationale || '—' }}</p>
                                          </div>
                                          <div class="au-meta">
                                            <strong>Word target</strong>
                                            <p class="au-muted">{{ item.recommendedWordCountMin ?? '—' }}–{{ item.recommendedWordCountMax ?? '—' }} words</p>
                                          </div>
                                          <div class="au-meta">
                                            <strong>Keyword</strong>
                                            <p class="au-muted">{{ item.primaryKeyword || '—' }}</p>
                                          </div>
                                          <div class="au-meta">
                                            <strong>SEO title</strong>
                                            <p class="au-muted">{{ item.seoTitle || '—' }}</p>
                                          </div>
                                          <div class="au-meta">
                                            <strong>Meta description</strong>
                                            <p class="au-muted">{{ item.metaDescription || '—' }}</p>
                                          </div>
                                          <div class="au-meta">
                                            <strong>Opportunity / difficulty</strong>
                                            <p class="au-muted">{{ item.opportunityScore ?? '—' }} / {{ item.difficultyEstimate ?? '—' }}</p>
                                          </div>
                                        </div>
                                        <div class="au-field-grid au-mt-2">
                                          <div class="au-meta">
                                            <strong>Outline</strong>
                                            <ul class="au-muted">
                                              <li *ngFor="let section of outlineOf(item.outline)">{{ section }}</li>
                                            </ul>
                                          </div>
                                          <div class="au-meta">
                                            <strong>Internal links (from site inventory)</strong>
                                            <ul class="au-muted">
                                              <li *ngFor="let link of listOf(item.suggestedInternalLinks)">{{ link }}</li>
                                            </ul>
                                          </div>
                                          <div class="au-meta">
                                            <strong>Source evidence</strong>
                                            <ul class="au-muted">
                                              <li *ngFor="let evidence of evidenceOf(item.sourceEvidence)">{{ evidence }}</li>
                                            </ul>
                                          </div>
                                          <div class="au-meta">
                                            <strong>Image brief</strong>
                                            <p class="au-muted">{{ item.imageConcept || '—' }}</p>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                </ng-container>
                              </tbody>
                            </table>
                          </div>

                          <div class="au-toolbar au-toolbar--panel" *ngIf="planRowTotalPages() > 1">
                            <span class="au-muted">{{ filteredPlanRows.length }} rows</span>
                            <div class="au-toolbar__spacer"></div>
                            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="planRowPage <= 1" (click)="goPlanRowPage(planRowPage - 1)">Previous</button>
                            <span class="au-muted">Page {{ planRowPage }} of {{ planRowTotalPages() }}</span>
                            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="planRowPage >= planRowTotalPages()" (click)="goPlanRowPage(planRowPage + 1)">Next</button>
                          </div>
                        }
                      </ng-container>
                    </div>
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
      </section>

      <app-empty-state
        *ngIf="!loading && plans.length === 0 && !loadError"
        icon="plan"
        title="No plan yet"
        text="Generate an AI plan for the next publishing period to see structured rows here."
      >
        <button class="au-btn au-btn--primary" type="button" (click)="showForm = true">
          <app-icon name="sparkles"></app-icon>
          Generate a plan
        </button>
      </app-empty-state>
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
  showForm = false;
  expandedPlanId = '';
  planDetailLoading = false;
  selectedIds = new Set<string>();
  editingItemId = '';
  expandedItemId = '';
  editDraft = { title: '', primaryKeyword: '', seoTitle: '', scheduledFor: '' };
  planSearch = '';
  planChannelFilter = '';
  planStatusFilter = '';
  planRowPage = 1;
  planRowPageSize = 10;
  filteredPlanRows: Array<NonNullable<EditorialPlan['items']>[number]> = [];
  channels = { website: true, x: true, instagram: false };
  draft = { dateFrom: new Date().toISOString().slice(0, 10), dateTo: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10), siteId: '', objective: '', audience: '', topics: '', excludedTopics: '', publicationCount: 7 };
  strategy = { mode: 'balanced', primaryIntent: '', contentFormats: [] as string[], campaignName: '', market: '', keywordSeeds: '', seasonalEvents: '' };
  strategyModes = [
    { value: 'balanced', label: 'Balanced' },
    { value: 'seo-growth', label: 'SEO Growth' },
    { value: 'topical-authority', label: 'Topical Authority' },
    { value: 'news-freshness', label: 'News / Freshness' },
    { value: 'evergreen-growth', label: 'Evergreen Growth' },
    { value: 'commercial-transactional', label: 'Commercial / Transactional' },
    { value: 'engagement', label: 'Engagement' },
    { value: 'seasonal', label: 'Seasonal' },
  ];
  intents = ['informational', 'navigational', 'commercial-investigation', 'transactional', 'comparison', 'news', 'entertainment-discovery', 'where-to-watch', 'sports-live', 'mixed'];
  contentFormats = ['guide', 'news', 'ranking', 'comparison', 'analysis', 'explainer', 'tutorial', 'faq', 'review', 'preview', 'match-preview', 'match-report', 'schedule', 'where-to-watch', 'streaming-recommendation', 'evergreen-pillar', 'cluster-article'];
  siteIntel: SiteIntelligenceOverview | null = null;
  intelRefreshing = false;
  progressIndex = -1;
  progressSteps = [
    { index: 0, label: 'Loading site profile' },
    { index: 1, label: 'Analyzing existing coverage' },
    { index: 2, label: 'Checking content gaps' },
    { index: 3, label: 'Generating ideas' },
    { index: 4, label: 'Validating relevance' },
    { index: 5, label: 'Checking cannibalization' },
    { index: 6, label: 'Building plan' },
  ];

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.draft.siteId = this.appContext.activeSite()?.id ?? this.sites[0]?.id ?? '';
    this.load();
    this.onSiteChange();
    this.showForm = false;
  }
  onSiteChange(): void {
    this.siteIntel = null;
    if (this.draft.siteId) {
      this.loadIntel();
    }
  }
  loadIntel(): void {
    this.api.getSiteIntelligence(this.draft.siteId).subscribe({
      next: (overview) => { this.siteIntel = overview; },
      error: () => { this.siteIntel = null; },
    });
  }
  refreshIntel(fullIndex = false): void {
    if (!this.draft.siteId || this.intelRefreshing) return;
    this.intelRefreshing = true;
    this.api.indexSite(this.draft.siteId, { crawl: true, force: fullIndex }).subscribe({
      next: () => {
        this.intelRefreshing = false;
        this.toast.success('Site intelligence refresh started.');
        setTimeout(() => this.loadIntel(), 3000);
      },
      error: (err) => {
        this.intelRefreshing = false;
        this.error = err?.error?.error?.message || 'Site intelligence refresh could not start.';
      },
    });
  }
  toggleFormat(format: string): void {
    this.strategy.contentFormats = this.strategy.contentFormats.includes(format)
      ? this.strategy.contentFormats.filter((entry) => entry !== format)
      : [...this.strategy.contentFormats, format];
  }
  toggleExpand(itemId: string): void {
    this.expandedItemId = this.expandedItemId === itemId ? '' : itemId;
  }
  listOf(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  }
  outlineOf(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        const heading = (entry as Record<string, unknown>)['heading'];
        return typeof heading === 'string' ? heading.trim() : '';
      })
      .filter(Boolean);
  }
  evidenceOf(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        const record = entry as Record<string, unknown>;
        const title = typeof record['title'] === 'string' ? record['title'] : '';
        const url = typeof record['url'] === 'string' ? record['url'] : '';
        return `${title || url}`.trim();
      })
      .filter(Boolean);
  }
  load(): void {
    this.loading = true;
    this.api.listEditorialPlans().subscribe({ next: (response) => { this.plans = response.items; this.loading = false; }, error: () => { this.loadError = 'Editorial plans could not be loaded. Try again.'; this.loading = false; } });
  }
  isExpanded(planId: string): boolean {
    return this.expandedPlanId === planId;
  }
  togglePlan(plan: EditorialPlan): void {
    if (this.isExpanded(plan.id)) {
      this.expandedPlanId = '';
      return;
    }
    this.expandedPlanId = plan.id;
    this.planDetailLoading = true;
    this.selectedIds = new Set();
    this.planSearch = '';
    this.planChannelFilter = '';
    this.planStatusFilter = '';
    this.expandedItemId = '';
    this.api.getEditorialPlan(plan.id).subscribe({
      next: (detail) => {
        this.selectedPlan = detail;
        this.planDetailLoading = false;
        this.filterPlanRows();
      },
      error: () => {
        this.planDetailLoading = false;
        this.loadError = 'This editorial plan could not be opened.';
      },
    });
  }
  planStatusTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
    if (status === 'ready') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'generating') return 'warning';
    return 'neutral';
  }
  channelList(plan: EditorialPlan): string[] {
    const counts = plan.channelCounts ?? {};
    return (Object.keys(counts) as Array<'website' | 'x' | 'instagram'>).filter((channel) => (counts[channel] ?? 0) > 0);
  }
  channelLabel(channel: string): string {
    return channel === 'x' ? 'X' : channel === 'instagram' ? 'Instagram' : 'Website';
  }
  planCount(status: string): number {
    const items = this.selectedPlan?.items ?? [];
    return items.filter((item) => item.status === status).length;
  }
  planProgress(): number {
    const items = this.selectedPlan?.items ?? [];
    if (items.length === 0) return 0;
    const done = items.filter((item) => item.status === 'content_ready').length;
    return Math.round((done / items.length) * 100);
  }
  planShare(status: string): number {
    const items = this.selectedPlan?.items ?? [];
    if (items.length === 0) return 0;
    return Math.round((this.planCount(status) / items.length) * 100);
  }
  listPlanProgress(plan: EditorialPlan): number {
    const total = plan._count?.items ?? 0;
    if (total === 0) return 0;
    return Math.round(((plan.statusCounts?.['content_ready'] ?? 0) / total) * 100);
  }
  filterPlanRows(): void {
    const query = this.planSearch.trim().toLowerCase();
    this.filteredPlanRows = (this.selectedPlan?.items ?? []).filter((item) => {
      if (this.planChannelFilter && item.channel !== this.planChannelFilter) return false;
      if (this.planStatusFilter && item.status !== this.planStatusFilter) return false;
      if (!query) return true;
      return [item.title, item.topic ?? '', item.primaryKeyword ?? '', item.seoTitle ?? ''].some((value) => value.toLowerCase().includes(query));
    });
    this.planRowPage = 1;
  }
  planRowTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPlanRows.length / this.planRowPageSize));
  }
  pagedPlanRows(): Array<NonNullable<EditorialPlan['items']>[number]> {
    const start = (this.planRowPage - 1) * this.planRowPageSize;
    return this.filteredPlanRows.slice(start, start + this.planRowPageSize);
  }
  goPlanRowPage(page: number): void {
    this.planRowPage = Math.min(Math.max(1, page), this.planRowTotalPages());
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
  private refreshSelected(): void { if (this.selectedPlan) { const plan = this.selectedPlan; this.api.getEditorialPlan(plan.id).subscribe({ next: (detail) => { this.selectedPlan = detail; this.filterPlanRows(); }, error: () => undefined }); } }
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
    this.progressIndex = 0;
    const progressTimer = setInterval(() => {
      if (this.progressIndex < this.progressSteps.length - 1) this.progressIndex += 1;
    }, 1400);
    this.api.generateEditorialPlan({
      dateFrom: this.draft.dateFrom,
      dateTo: this.draft.dateTo,
      siteId: this.draft.siteId || undefined,
      objective: this.draft.objective || undefined,
      audience: this.draft.audience || undefined,
      topics: this.draft.topics.split(',').map((topic) => topic.trim()).filter(Boolean),
      excludedTopics: this.draft.excludedTopics.split(',').map((topic) => topic.trim()).filter(Boolean),
      channels,
      publicationCount: Number(this.draft.publicationCount),
      strategyMode: this.strategy.mode,
      primaryIntent: this.strategy.primaryIntent || undefined,
      contentFormats: this.strategy.contentFormats.length > 0 ? this.strategy.contentFormats : undefined,
      campaignName: this.strategy.campaignName || undefined,
      market: this.strategy.market || undefined,
      keywordSeeds: this.strategy.keywordSeeds.split(',').map((seed) => seed.trim()).filter(Boolean),
      seasonalEvents: this.strategy.seasonalEvents.split(',').map((event) => event.trim()).filter(Boolean),
    }).subscribe({
      next: (plan) => {
        clearInterval(progressTimer);
        this.generating = false;
        this.progressIndex = -1;
        this.plans = [plan, ...this.plans];
        this.expandedPlanId = plan.id;
        this.selectedPlan = plan;
        this.planDetailLoading = false;
        this.filterPlanRows();
        const dropped = plan.generatedOutput?.dropped?.length ?? 0;
        if (dropped > 0) {
          this.toast.success(`Plan ready with ${plan.items?.length ?? 0} rows. ${dropped} irrelevant row(s) were filtered by relevance guardrails.`);
        }
      },
      error: (err) => {
        clearInterval(progressTimer);
        this.generating = false;
        this.progressIndex = -1;
        this.error = err?.error?.error?.message || err?.error?.message || 'The editorial plan could not be generated.';
      },
    });
  }
}
