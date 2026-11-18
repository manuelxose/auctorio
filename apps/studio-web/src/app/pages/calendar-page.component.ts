import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { PlanningApiService } from '../services/planning-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { EditorialContextService } from '../services/editorial-context.service';
import { ConfirmService } from '../services/confirm.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { ArticleChip, CalendarEvent, PublicationChannel, StudioProjectSummary, PublishingAccount } from '../models/studio.models';
import type { PlanKeywordsResult } from '../models/planning.models';
import { localDate, localTime, zonedToUtc } from '../components/planning/planning-utils';

type CalendarView = 'next30' | 'list' | 'day' | 'week' | 'month';
type ChipFilter = 'all' | ArticleChip;
type DayCell = { date: Date; dayNum: number; events: CalendarEvent[] };

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="cal">
      <header class="cal-head">
        <div>
          <h1 class="cal-head__title">Calendar</h1>
          <p class="cal-head__sub">{{ siteName }} · Times in {{ timeZone }}</p>
        </div>
        <div class="cal-head__actions">
          <button class="au-btn au-btn--secondary" type="button" (click)="openSchedule()">
            <app-icon name="calendar"></app-icon>
            Schedule a publication
          </button>
          <button class="au-btn au-btn--primary" type="button" (click)="openKeywords()">
            <app-icon name="plus"></app-icon>
            Add keywords
          </button>
        </div>
      </header>

      <div class="cal-states" role="group" aria-label="Filter by state">
        @for (chip of chipFilters; track chip.key) {
          <button type="button" class="cal-state" [attr.data-chip]="chip.key" [attr.aria-pressed]="chipFilter === chip.key" (click)="setChip(chip.key)">
            @if (chip.key !== 'all') { <i class="cal-dot" aria-hidden="true"></i> }
            <span class="cal-state__label">{{ chip.label }}</span>
            <span class="cal-state__count">{{ chipCount(chip.key) }}</span>
          </button>
        }
      </div>

      <div class="cal-bar">
        <div class="cal-bar__nav">
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="goToday()">Today</button>
          <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="move(-1)" aria-label="Previous period">
            <app-icon name="chevron-left"></app-icon>
          </button>
          <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="move(1)" aria-label="Next period">
            <app-icon name="chevron-right"></app-icon>
          </button>
          <h2 class="cal-bar__range" aria-live="polite">{{ rangeLabel }}</h2>
        </div>
        <div class="cal-bar__tools">
          <select class="au-select cal-bar__select" [(ngModel)]="channelFilter" (ngModelChange)="load()" aria-label="Filter by channel">
            <option value="">All channels</option>
            <option value="website">Website</option>
            <option value="x">X</option>
            <option value="instagram">Instagram</option>
          </select>
          <div class="cal-views" role="group" aria-label="View">
            @for (view of views; track view.key) {
              <button class="cal-view" [class.is-active]="view.key === viewMode" [attr.aria-pressed]="view.key === viewMode" type="button" (click)="setView(view.key)">{{ view.label }}</button>
            }
          </div>
        </div>
      </div>

      @if (error) {
        <div class="au-banner au-banner--error">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">{{ error }}</span>
          <button class="au-banner__action" type="button" (click)="load()">Retry</button>
        </div>
      }
      @if (notice) {
        <div class="au-banner au-banner--success">
          <app-icon name="circle-check"></app-icon>
          <span class="au-banner__text">{{ notice }}</span>
        </div>
      }
      @if (!keywordMetrics) {
        <p class="cal-note"><app-icon name="info"></app-icon> Volume and difficulty show "—" until DataForSEO is connected. Until then the AI picks plan keywords</p>
      }
      <p class="au-sr-only" role="status" aria-live="polite">{{ moveResult }}</p>

      <!-- Month and 30 days: a real 7-column grid with weekday headers -->
      @if (viewMode === 'month' || viewMode === 'next30') {
        <div class="cal-month" role="grid" [attr.aria-label]="rangeLabel">
          @for (name of weekdayNames; track name) { <div class="cal-month__dow" role="columnheader">{{ name }}</div> }
          @for (blank of leadingBlanks; track $index) { <div class="cal-cell is-outside" aria-hidden="true"></div> }
          @for (day of monthDays; track day.date.getTime()) {
            <div class="cal-cell" role="gridcell" [class.is-today]="isToday(day.date)" [class.is-past]="isPast(day.date)" [class.is-weekend]="isWeekend(day.date)"
              (dragover)="$event.preventDefault()" (drop)="onDropOnDay($event, day.date)">
              <div class="cal-cell__head">
                <button type="button" class="cal-cell__num" (click)="focusDay(day.date)" [attr.aria-label]="'Open ' + dayLabel(day.date)">{{ day.dayNum }}</button>
              </div>
              @for (event of day.events.slice(0, 3); track event.id) {
                <button type="button" class="cal-ev" [class.is-proposal]="event.kind === 'plan_item'" [attr.data-chip]="event.chip"
                  [draggable]="canDrag(event)" (dragstart)="onDragStart($event, event)" (dragend)="onDragEnd($event)"
                  (click)="openPeek(event)" [title]="event.title" [attr.aria-label]="ariaLabel(event)">
                  <i class="cal-dot" aria-hidden="true"></i>
                  <span class="cal-ev__text"><span class="cal-ev__time">{{ timeLabel(event.scheduledFor) }}</span> {{ event.title }}</span>
                </button>
              }
              @if (day.events.length > 3) {
                <button type="button" class="cal-cell__more" (click)="focusDay(day.date)">+{{ day.events.length - 3 }} more</button>
              }
            </div>
          }
          @for (blank of trailingBlanks; track $index) { <div class="cal-cell is-outside" aria-hidden="true"></div> }
        </div>
      }

      <!-- Week: one column per day, cards stack -->
      @if (viewMode === 'week') {
        <div class="cal-week">
          @for (day of dayColumns; track day.date.getTime()) {
            <div class="cal-week__col" [class.is-today]="isToday(day.date)" [class.is-past]="isPast(day.date)" (dragover)="$event.preventDefault()" (drop)="onDropOnDay($event, day.date)">
              <button type="button" class="cal-week__head" (click)="focusDay(day.date)" [attr.aria-label]="'Open ' + dayLabel(day.date)">
                <span class="cal-week__dow">{{ day.date.toLocaleDateString('en-US', { weekday: 'short' }) }}</span>
                <span class="cal-week__num">{{ day.date.getDate() }}</span>
              </button>
              <div class="cal-week__body">
                @for (event of day.events; track event.id) {
                  <button type="button" class="cal-card" [class.is-proposal]="event.kind === 'plan_item'" [attr.data-chip]="event.chip"
                    [draggable]="canDrag(event)" (dragstart)="onDragStart($event, event)" (dragend)="onDragEnd($event)"
                    (dragover)="$event.preventDefault()" (drop)="onDropOnCard($event, event)" (click)="openPeek(event)" [attr.aria-label]="ariaLabel(event)">
                    <span class="cal-card__top"><i class="cal-dot" aria-hidden="true"></i>{{ timeLabel(event.scheduledFor) }}<span class="cal-card__chan">{{ event.channel }}</span></span>
                    <span class="cal-card__title">{{ event.title }}</span>
                    @if (event.kind === 'plan_item' && event.primaryKeyword) {
                      <ng-container *ngTemplateOutlet="metricsTpl; context: { $implicit: event }"></ng-container>
                    }
                  </button>
                } @empty {
                  <span class="cal-week__empty">Nothing planned</span>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- List and Day: agenda rows -->
      @if (viewMode === 'list' || viewMode === 'day') {
        <div class="cal-agenda">
          @if (visibleEvents.length === 0) {
            <app-empty-state icon="calendar" title="Nothing scheduled in this period" text="Add keywords to fill the calendar, or schedule a publication."></app-empty-state>
          }
          @for (group of groupedEvents; track group.label) {
            <section class="cal-agenda__group">
              <h3 class="cal-agenda__date">{{ group.label }}</h3>
              @for (entry of group.entries; track entry.item.id) {
                <div class="cal-row" [class.is-proposal]="entry.item.kind === 'plan_item'" [attr.data-chip]="entry.item.chip"
                  role="group" [attr.aria-label]="ariaLabel(entry.item)"
                  [draggable]="canDrag(entry.item)" (dragstart)="onDragStart($event, entry.item)" (dragend)="onDragEnd($event)"
                  (dragover)="$event.preventDefault()" (drop)="onDropOnCard($event, entry.item)">
                  <span class="cal-row__time" [title]="utcLabel(entry.item.scheduledFor)">{{ timeLabel(entry.item.scheduledFor) }}</span>
                  <span class="cal-row__state"><i class="cal-dot" aria-hidden="true"></i>{{ entry.item.chip ? chipLabel(entry.item.chip) : statusLabel(entry.item) }}</span>
                  <button type="button" class="cal-row__main" (click)="openPeek(entry.item)">
                    <span class="cal-row__title">{{ entry.item.title }}</span>
                    <span class="cal-row__meta">
                      {{ entry.item.kind === 'plan_item' ? 'Proposal' : 'Publication' }} · {{ entry.item.channel }} · {{ entry.item.destination }}
                      @if (entry.item.contentType) { · {{ typeLabel(entry.item.contentType) }} }
                      @if (entry.item.automated) { · automatic }
                    </span>
                    @if (entry.item.lastError) { <span class="cal-row__error">{{ entry.item.lastError }}</span> }
                  </button>
                  <span class="cal-row__metrics">
                    @if (entry.item.kind === 'plan_item' && entry.item.primaryKeyword) {
                      <ng-container *ngTemplateOutlet="metricsTpl; context: { $implicit: entry.item }"></ng-container>
                    }
                  </span>
                  <span class="cal-row__actions">
                    @if (isQueuedBrief(entry.item)) {
                      <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="openInstructions(entry.item)">Instructions</button>
                    }
                    @if (entry.item.projectId) {
                      <a class="au-btn au-btn--ghost au-btn--sm" [routerLink]="['/studio/content', entry.item.projectId]">Open</a>
                    }
                    <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="openPeek(entry.item)" [attr.aria-label]="'More for ' + entry.item.title">
                      <app-icon name="dots"></app-icon>
                    </button>
                  </span>
                </div>
              }
            </section>
          }
        </div>
      }

      <p class="cal-legend">
        <span class="cal-legend__item"><i class="cal-legend__swatch is-proposal" aria-hidden="true"></i>Dashed: proposal, not scheduled to publish</span>
        <span class="cal-legend__item"><i class="cal-legend__swatch" aria-hidden="true"></i>Solid: scheduled publication</span>
        <span class="cal-legend__item">Drag an article to another day to move it</span>
      </p>
    </section>

    <!-- Keyword + difficulty + volume: the calendar's signature line -->
    <ng-template #metricsTpl let-event>
      <span class="cal-metrics" [title]="'Keyword: ' + event.primaryKeyword">
        <span class="cal-metrics__kw">{{ event.primaryKeyword }}</span>
        <span class="cal-metrics__kd" [attr.data-tone]="difficultyTone(event.keywordDifficulty)"><i aria-hidden="true"></i>KD {{ event.keywordDifficulty ?? '—' }}</span>
        <span class="cal-metrics__vol">{{ compact(event.searchVolume) }}</span>
      </span>
    </ng-template>

    <!-- Peek: everything about one article, with its actions -->
    <dialog #peekDialog class="cal-sheet" aria-labelledby="peek-title" (close)="peek = null; cancelMove(); topicId = ''" (click)="onSheetBackdrop($event)">
      @if (peek; as event) {
        <div class="cal-sheet__inner">
          <header class="cal-sheet__head">
            <span class="cal-sheet__state" [attr.data-chip]="event.chip"><i class="cal-dot" aria-hidden="true"></i>{{ event.chip ? chipLabel(event.chip) : statusLabel(event) }} · {{ event.kind === 'plan_item' ? 'Proposal' : 'Publication' }}</span>
            <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="closePeek()" aria-label="Close"><app-icon name="close"></app-icon></button>
          </header>
          <h2 class="cal-sheet__title" id="peek-title">{{ event.title }}</h2>
          <dl class="cal-facts">
            <div><dt>When</dt><dd>{{ peekWhen(event) }}</dd></div>
            <div><dt>Where</dt><dd>{{ event.channel }} · {{ event.destination }}</dd></div>
            @if (event.contentType) { <div><dt>Type</dt><dd>{{ typeLabel(event.contentType) }}</dd></div> }
            @if (event.primaryKeyword) {
              <div><dt>Keyword</dt><dd>{{ event.primaryKeyword }}</dd></div>
              <div><dt>Difficulty</dt><dd class="cal-facts__num" [attr.data-tone]="difficultyTone(event.keywordDifficulty)">{{ event.keywordDifficulty ?? '—' }}{{ difficultyText(event.keywordDifficulty) }}</dd></div>
              <div><dt>Volume</dt><dd class="cal-facts__num">{{ event.searchVolume != null ? (event.searchVolume | number) + ' / mo' : '—' }}</dd></div>
            }
          </dl>
          @if (event.lastError) { <p class="cal-sheet__error"><app-icon name="warning"></app-icon>{{ event.lastError }}</p> }
          @if (event.externalUrl) { <a class="cal-sheet__link" [href]="event.externalUrl" target="_blank" rel="noopener"><app-icon name="external"></app-icon>{{ event.externalUrl }}</a> }

          <div class="cal-sheet__actions">
            @if (event.projectId) {
              <a class="au-btn au-btn--primary" [routerLink]="['/studio/content', event.projectId]" (click)="closePeek()">Open article</a>
            }
            @if (event.kind === 'plan_item') {
              <a class="au-btn au-btn--secondary" routerLink="/studio/plan" [queryParams]="{ plan: event.planId, item: event.id }" (click)="closePeek()">
                {{ event.status === 'proposed' ? 'Review brief' : 'Full brief' }}
              </a>
            } @else {
              <a class="au-btn au-btn--secondary" routerLink="/studio/results" [queryParams]="{ id: event.id }" (click)="closePeek()">
                {{ event.status === 'failed' ? 'Fix in Results' : 'Manage' }}
              </a>
            }
          </div>

          <div class="cal-sheet__list" role="group" aria-label="Article actions">
            @if (isQueuedBrief(event)) {
              <button type="button" class="cal-action" (click)="openInstructions(event)"><app-icon name="edit"></app-icon>Instructions for the writer</button>
              <button type="button" class="cal-action" (click)="startTopic(event)" [attr.aria-expanded]="topicId === event.id"><app-icon name="refresh"></app-icon>Change topic</button>
              @if (topicId === event.id) {
                <form class="cal-inline" (ngSubmit)="confirmTopic(event)" (keydown.escape)="$event.stopPropagation(); topicId = ''">
                  <label class="au-field au-mb-0">
                    <span class="au-field__label">New keyword</span>
                    <input class="au-input" type="text" name="topic" maxlength="120" [(ngModel)]="topicText" required />
                  </label>
                  <button class="au-btn au-btn--primary au-btn--sm" type="submit" [disabled]="!topicText.trim() || topicSaving">{{ topicSaving ? 'Saving…' : 'Change' }}</button>
                </form>
              }
            }
            @if (event.status !== 'published' && event.status !== 'canceled') {
              <button type="button" class="cal-action" (click)="startMove(event)" [attr.aria-expanded]="movingId === event.id"><app-icon name="clock"></app-icon>Move to another date</button>
              @if (movingId === event.id) {
                <form class="cal-inline" (ngSubmit)="confirmMove(event)" (keydown.escape)="$event.stopPropagation(); cancelMove()">
                  <label class="au-field au-mb-0">
                    <span class="au-field__label">Move to ({{ timeZone }})</span>
                    <input class="au-input" type="datetime-local" name="moveTo" [(ngModel)]="moveTo" required />
                  </label>
                  <button class="au-btn au-btn--primary au-btn--sm" type="submit" [disabled]="!moveTo">Move</button>
                </form>
              }
            }
            @if (isQueuedBrief(event)) {
              <button type="button" class="cal-action cal-action--danger" (click)="deleteItem(event)"><app-icon name="trash"></app-icon>Delete</button>
            }
          </div>
        </div>
      }
    </dialog>

    <dialog #keywordsDialog class="au-dialog cal-dialog" aria-labelledby="keywords-title">
      <form (ngSubmit)="addKeywords()">
        <h2 class="au-dialog__title" id="keywords-title">Add keywords</h2>
        <p class="au-dialog__body">One per line, up to 50. Each becomes an article on the next free day. Repeats, close variants and off-topic ones are skipped</p>
        <label class="au-field">
          <span class="au-field__label">Keywords</span>
          <textarea class="au-input cal-dialog__area" name="keywords" rows="8" [(ngModel)]="keywordsText" required aria-describedby="keywords-count"></textarea>
          <span class="au-hint" id="keywords-count">{{ keywordList.length }} / 50{{ keywordList.length > 50 ? ' (too many)' : '' }}</span>
        </label>
        @if (keywordsResult; as result) {
          <div class="cal-result" role="status">
            <p>{{ result.created.length }} added{{ result.unscheduled.length ? ', ' + result.unscheduled.length + ' without a free day' : '' }}{{ result.dropped.length ? ', ' + result.dropped.length + ' skipped' : '' }}</p>
            @if (result.dropped.length) {
              <ul>
                @for (entry of result.dropped; track entry.keyword) { <li>{{ entry.keyword }}: {{ dropReason(entry.reason) }}</li> }
              </ul>
            }
          </div>
        }
        <div class="au-dialog__actions">
          <button class="au-btn au-btn--secondary" type="button" (click)="keywordsDialog.close()">Close</button>
          <button class="au-btn au-btn--primary" type="submit" [disabled]="addingKeywords || !keywordList.length || keywordList.length > 50">
            {{ addingKeywords ? 'Adding…' : 'Add to calendar' }}
          </button>
        </div>
      </form>
    </dialog>

    <dialog #scheduleDialog class="au-dialog cal-dialog" aria-labelledby="schedule-title">
      <form (ngSubmit)="createFromCalendar()">
        <h2 class="au-dialog__title" id="schedule-title">Schedule a publication</h2>
        <p class="au-dialog__body">Social channels need an approved social piece on the content</p>
        <label class="au-field">
          <span class="au-field__label">Content</span>
          <select class="au-select" name="projectId" [(ngModel)]="draft.projectId" required>
            <option value="" disabled>Select content</option>
            @for (project of projects; track project.id) { <option [value]="project.id">{{ project.title }}</option> }
          </select>
        </label>
        <label class="au-field">
          <span class="au-field__label">Channel</span>
          <select class="au-select" name="channel" [(ngModel)]="draft.channel">
            <option value="website">Website ({{ siteName }})</option>
            <option value="x">X</option>
            <option value="instagram">Instagram</option>
          </select>
        </label>
        @if (draft.channel !== 'website') {
          <label class="au-field">
            <span class="au-field__label">Account</span>
            <select class="au-select" name="accountId" [(ngModel)]="draft.accountId">
              <option value="">Default account</option>
              @for (account of accountsForChannel; track account.id) { <option [value]="account.id">{{ account.displayName }}</option> }
            </select>
          </label>
        }
        <label class="au-field">
          <span class="au-field__label">When</span>
          <input class="au-input" type="datetime-local" name="scheduledFor" [(ngModel)]="draft.scheduledFor" required aria-describedby="schedule-tz" />
          <span class="au-hint" id="schedule-tz">{{ timeZone }}</span>
        </label>
        <div class="au-dialog__actions">
          <button class="au-btn au-btn--secondary" type="button" (click)="scheduleDialog.close()">Cancel</button>
          <button class="au-btn au-btn--primary" type="submit" [disabled]="creating">{{ creating ? 'Scheduling…' : 'Schedule' }}</button>
        </div>
      </form>
    </dialog>

    <dialog #instructionsDialog class="au-dialog cal-dialog" aria-labelledby="instructions-title" (close)="instructionsFor = null">
      @if (instructionsFor; as item) {
        <form (ngSubmit)="saveInstructions()">
          <h2 class="au-dialog__title" id="instructions-title">Instructions for the writer</h2>
          <p class="au-dialog__body">{{ item.title }}</p>
          <label class="au-field">
            <span class="au-field__label">Instructions</span>
            <textarea class="au-input" name="instructions" rows="5" maxlength="2000" [(ngModel)]="instructions.text" placeholder="What to cover, what to avoid, the tone"></textarea>
          </label>
          <label class="au-field">
            <span class="au-field__label">Reference URL (optional)</span>
            <input class="au-input" type="url" name="referenceUrl" maxlength="500" [(ngModel)]="instructions.url" placeholder="https://" aria-describedby="reference-hint" />
            <span class="au-hint" id="reference-hint">A page to take as a model. It is not copied</span>
          </label>
          <div class="au-dialog__actions">
            <button class="au-btn au-btn--secondary" type="button" (click)="closeInstructions()">Cancel</button>
            <button class="au-btn au-btn--primary" type="submit" [disabled]="instructions.saving">{{ instructions.saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      }
    </dialog>
  `,
  // Agenda, peek sheet and dialogs load with the route; the grid lives in styles.css (component style budget is 8 kB).
  styles: [`
    /* Agenda */
    .cal-agenda { border: 1px solid var(--cal-line); border-radius: var(--cal-r); background: var(--cal-cell); overflow: hidden; }
    .cal-agenda__group + .cal-agenda__group { border-top: 1px solid var(--cal-line); }
    .cal-agenda__date { position: sticky; top: 0; z-index: 1; margin: 0; padding: 12px 16px 8px; background: var(--cal-cell); font-size: 13px; font-weight: 500; color: var(--au-text-2); }
    .cal-row { display: grid; grid-template-columns: 56px 112px minmax(0, 1fr) minmax(0, 320px) auto; align-items: center; gap: 16px; padding: 8px 16px; border-top: 1px solid var(--cal-line); transition: background-color .15s ease; }
    .cal-row:hover { background: var(--au-surface-2); }
    .cal-row__time { font-family: var(--au-mono); font-size: 13px; color: var(--au-text-2); }
    .cal-row__state { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--au-muted); }
    .cal-row.is-proposal .cal-row__state .cal-dot { background: transparent; border: 1.5px dashed var(--ev); }
    .cal-row__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 4px; margin: -4px; border: 0; border-radius: 6px; background: none; color: var(--au-text); font: inherit; text-align: left; cursor: pointer; }
    .cal-row__title { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cal-row__meta { font-size: 12px; color: var(--au-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cal-row__error { font-size: 12px; color: var(--au-danger); }
    .cal-row__metrics { min-width: 0; }
    .cal-row__actions { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }

    /* Signature: keyword · KD dot · volume */
    .cal-metrics { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--au-muted); }
    .cal-metrics__kw { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--au-text-2); }
    .cal-metrics__kd, .cal-metrics__vol { flex: none; font-family: var(--au-mono); }
    .cal-metrics__kd { display: inline-flex; align-items: center; gap: 4px; }
    .cal-metrics__kd i { width: 6px; height: 6px; border-radius: 50%; background: var(--au-border-strong); }
    :host [data-tone='easy'] i { background: var(--au-success); }
    :host [data-tone='medium'] i { background: var(--au-warning); }
    :host [data-tone='hard'] i { background: var(--au-danger); }

    .cal-legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 12px 0 0; color: var(--au-muted); font-size: 12px; }
    .cal-legend__item { display: inline-flex; align-items: center; gap: 8px; }
    .cal-legend__swatch { width: 16px; height: 10px; border-radius: 3px; background: var(--au-surface-2); border: 1px solid var(--au-border-strong); }
    .cal-legend__swatch.is-proposal { background: transparent; border-style: dashed; }

    /* Peek sheet */
    .cal-sheet { margin: 0 0 0 auto; width: min(440px, 100vw); height: 100dvh; max-height: none; padding: 0; border: 0; border-left: 1px solid var(--cal-line); background: var(--au-surface-solid); color: var(--au-text); }
    .cal-sheet::backdrop { background: var(--au-scrim-soft); }
    .cal-sheet[open] { animation: cal-in .18s cubic-bezier(.2, .8, .2, 1); }
    @keyframes cal-in { from { opacity: 0; transform: translateX(12px); } }
    @media (prefers-reduced-motion: reduce) { .cal-sheet[open] { animation: none; } }
    .cal-sheet__inner { display: flex; flex-direction: column; gap: 20px; padding: 20px 24px 32px; }
    .cal-sheet__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .cal-sheet__state { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--au-muted); }
    .cal-sheet__title { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 600; }
    .cal-facts { display: grid; gap: 0; margin: 0; border-top: 1px solid var(--cal-line); }
    .cal-facts div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--cal-line); font-size: 13px; }
    .cal-facts dt { color: var(--au-muted); }
    .cal-facts dd { margin: 0; overflow-wrap: anywhere; }
    .cal-facts__num { font-family: var(--au-mono); }
    .cal-sheet__error { display: flex; gap: 8px; margin: 0; color: var(--au-danger); font-size: 13px; }
    .cal-sheet__error app-icon, .cal-sheet__link app-icon { width: 16px; height: 16px; flex: none; }
    .cal-sheet__link { display: flex; gap: 8px; font-size: 13px; color: var(--au-brand); overflow-wrap: anywhere; }
    .cal-sheet__actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .cal-sheet__list { display: flex; flex-direction: column; border-top: 1px solid var(--cal-line); }
    .cal-action { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 8px; border: 0; border-bottom: 1px solid var(--cal-line); background: none; color: var(--au-text); font: inherit; font-size: 14px; text-align: left; cursor: pointer; transition: background-color .15s ease; }
    .cal-action:hover { background: var(--au-surface-2); }
    .cal-action app-icon { width: 16px; height: 16px; color: var(--au-muted); }
    .cal-action--danger, .cal-action--danger app-icon { color: var(--au-danger); }
    .cal-inline { display: flex; align-items: flex-end; gap: 8px; padding: 12px 8px; border-bottom: 1px solid var(--cal-line); }
    .cal-inline .au-field { flex: 1; }

    .cal-dialog { width: min(520px, calc(100vw - 32px)); }
    .cal-dialog__area { resize: vertical; font-family: var(--au-mono); font-size: 13px; }
    .cal-result { margin-bottom: 16px; font-size: 13px; }
    .cal-result p { margin: 0 0 4px; }
    .cal-result ul { margin: 0; padding-left: 18px; color: var(--au-muted); }
  `],
})
export class CalendarPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly planning = inject(PlanningApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly context = inject(EditorialContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  /** The calendar always shows the top bar's active site; the shell re-creates the page when it changes. */
  private readonly siteId = this.appContext.activeSite()?.id ?? '';
  readonly siteName = this.appContext.activeSite()?.name ?? 'this site';

  views: Array<{ key: CalendarView; label: string }> = [
    { key: 'next30', label: '30 days' },
    { key: 'month', label: 'Month' },
    { key: 'week', label: 'Week' },
    { key: 'day', label: 'Day' },
    { key: 'list', label: 'List' },
  ];
  readonly weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  viewMode: CalendarView = 'next30';
  readonly chipFilters: Array<{ key: ChipFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'queued', label: 'Queued' },
    { key: 'drafting', label: 'Drafting' },
    { key: 'review', label: 'Review' },
    { key: 'published', label: 'Published' },
    { key: 'failed', label: 'Failed' },
  ];
  chipFilter: ChipFilter = 'all';
  keywordsText = '';
  addingKeywords = false;
  keywordsResult: PlanKeywordsResult | null = null;
  keywordMetrics = true;
  topicId = '';
  topicText = '';
  topicSaving = false;
  peek: CalendarEvent | null = null;
  instructionsFor: CalendarEvent | null = null;
  instructions = { text: '', url: '', saving: false };
  @ViewChild('instructionsDialog') private instructionsDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('peekDialog') private peekDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('keywordsDialog') private keywordsDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('scheduleDialog') private scheduleDialog?: ElementRef<HTMLDialogElement>;
  private instructionsReturnFocus: HTMLElement | null = null;
  private openScheduleOnInit = false;
  events: CalendarEvent[] = [];
  /** The site's IANA timezone (from the API); wall-clock inputs and labels use it, the API stores UTC. */
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  channelFilter = '';
  anchor = new Date();
  movingId = '';
  moveTo = '';
  moveResult = '';
  error = '';
  notice = '';
  creating = false;
  projects: StudioProjectSummary[] = [];
  accounts: PublishingAccount[] = [];
  draft = { projectId: '', channel: 'website' as PublicationChannel, accountId: '', scheduledFor: '' };

  get accountsForChannel(): PublishingAccount[] {
    return this.accounts.filter((account) => account.platform === this.draft.channel && account.enabled);
  }

  private draggedEvent: CalendarEvent | null = null;
  private readonly reschedulingIds = new Set<string>();
  private refreshSubscription: Subscription | null = null;

  get rangeLabel(): string {
    const { from, to } = this.range();
    const last = new Date(to.getTime() - 1);
    if (this.viewMode === 'month') return from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (this.viewMode === 'day') return from.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const sameYear = from.getFullYear() === last.getFullYear();
    const start = from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
    return `${start} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  ngOnInit(): void {
    this.context.update({ area: 'calendar' });
    const chip = this.route?.snapshot.queryParamMap.get('chip');
    if (this.chipFilters.some((filter) => filter.key === chip)) this.chipFilter = chip as ChipFilter;
    // ?projectId= comes from an article's "Schedule in Calendar": open the form with it preselected.
    const projectId = this.route?.snapshot.queryParamMap.get('projectId');
    if (projectId) {
      this.draft.projectId = projectId;
      this.openScheduleOnInit = true;
    }
    this.api.listProjects({ page: 1, pageSize: 50, siteId: this.siteId || undefined }).subscribe({
      next: (response) => (this.projects = response.items),
      error: () => (this.projects = []),
    });
    this.api.listPublishingAccounts().subscribe({
      next: (response) => (this.accounts = response.items),
      error: () => (this.accounts = []),
    });
    this.load();
    this.refreshSubscription = timer(30_000, 30_000).subscribe(() => {
      if (!document.hidden) this.load(true);
    });
  }

  ngAfterViewInit(): void {
    if (this.openScheduleOnInit) queueMicrotask(() => this.openSchedule());
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.context.clear(['area', 'siteId', 'planId', 'planItemId', 'periodFrom', 'periodTo']);
  }

  private range(): { from: Date; to: Date } {
    const a = this.anchor;
    if (this.viewMode === 'next30') {
      const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      return { from: start, to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 30) };
    }
    if (this.viewMode === 'month') return { from: new Date(a.getFullYear(), a.getMonth(), 1), to: new Date(a.getFullYear(), a.getMonth() + 1, 1) };
    if (this.viewMode === 'week') {
      const day = a.getDay();
      const start = new Date(a.getFullYear(), a.getMonth(), a.getDate() + (day === 0 ? -6 : 1 - day));
      return { from: start, to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
    }
    if (this.viewMode === 'day') {
      const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      return { from: start, to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) };
    }
    const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    return { from: start, to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 14) };
  }

  load(silent = false): void {
    if (!silent) this.error = '';
    const { from, to } = this.range();
    this.context.update({ siteId: this.siteId || null, periodFrom: this.dayKey(from), periodTo: this.dayKey(new Date(to.getTime() - 1)) });
    this.api
      .listCalendar(from.toISOString(), to.toISOString(), this.channelFilter ? (this.channelFilter as PublicationChannel) : undefined, this.siteId || undefined)
      .subscribe({
        next: (response) => {
          this.events = response.items;
          if (response.timeZone) this.timeZone = response.timeZone;
          this.keywordMetrics = response.keywordMetrics !== false;
        },
        error: () => {
          if (!silent) this.error = 'Calendar could not be loaded. Try again.';
        },
      });
  }

  setView(view: CalendarView): void {
    this.viewMode = view;
    this.load();
  }

  goToday(): void {
    this.anchor = new Date();
    this.load();
  }

  move(delta: number): void {
    const a = this.anchor;
    if (this.viewMode === 'next30') this.anchor = new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta * 30);
    else if (this.viewMode === 'month') this.anchor = new Date(a.getFullYear(), a.getMonth() + delta, 1);
    else if (this.viewMode === 'week') this.anchor = new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta * 7);
    else if (this.viewMode === 'list') this.anchor = new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta * 14);
    else this.anchor = new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta);
    this.load();
  }

  get groupedEvents(): Array<{ label: string; entries: Array<{ item: CalendarEvent }> }> {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const event of this.visibleEvents) {
      const key = event.scheduledFor ? localDate(event.scheduledFor, this.timeZone) : 'unscheduled';
      byDate.set(key, [...(byDate.get(key) ?? []), event]);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b)))
      .map(([key, entries]) => ({
        label: key === 'unscheduled' ? 'Unscheduled' : new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }),
        entries: entries.sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '')).map((item) => ({ item })),
      }));
  }

  get dayColumns(): DayCell[] {
    const { from } = this.range();
    return Array.from({ length: 7 }, (_value, index) => {
      const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + index);
      return { date, dayNum: date.getDate(), events: this.eventsOn(date) };
    });
  }

  get monthDays(): DayCell[] {
    const { from } = this.range();
    const count = this.viewMode === 'next30' ? 30 : new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_value, index) => {
      const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + index);
      return { date, dayNum: date.getDate(), events: this.eventsOn(date) };
    });
  }

  /** Empty cells before the first day so the grid lines up under Mon…Sun. */
  get leadingBlanks(): number[] {
    return Array.from({ length: (this.range().from.getDay() + 6) % 7 });
  }

  /** Empty cells that close the last week, so the grid ends on a full row. */
  get trailingBlanks(): number[] {
    return Array.from({ length: (7 - ((this.leadingBlanks.length + this.monthDays.length) % 7)) % 7 });
  }

  /** Calendar cells are browser-local dates; an event belongs to the cell of its site-local day. */
  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private eventsOn(date: Date): CalendarEvent[] {
    const key = this.dayKey(date);
    return this.visibleEvents
      .filter((event) => event.scheduledFor && localDate(event.scheduledFor, this.timeZone) === key)
      .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));
  }

  dayLabel(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  ariaLabel(event: CalendarEvent): string {
    const kind = event.kind === 'plan_item' ? 'Proposal, not scheduled to publish' : 'Scheduled publication';
    const when = event.scheduledFor ? `${localDate(event.scheduledFor, this.timeZone)} ${localTime(event.scheduledFor, this.timeZone)} ${this.timeZone}` : 'unscheduled';
    return `${kind}: ${event.title}, ${this.statusLabel(event)}, ${when}`;
  }

  utcLabel(value: string | null): string {
    return value ? `Stored as ${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
  }

  peekWhen(event: CalendarEvent): string {
    if (!event.scheduledFor) return 'Unscheduled';
    const day = new Date(`${localDate(event.scheduledFor, this.timeZone)}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
    return `${day}, ${localTime(event.scheduledFor, this.timeZone)} (${this.timeZone})`;
  }

  canDrag(event: CalendarEvent): boolean {
    return !['published', 'generating', 'canceled'].includes(event.status) && !this.reschedulingIds.has(event.id);
  }

  statusLabel(event: CalendarEvent): string {
    if (event.kind === 'publication') return event.status;
    return ({ proposed: 'proposal', approved: 'approved brief', generating: 'writing draft', content_ready: 'draft ready', review_required: 'in review' } as Record<string, string>)[event.status] ?? event.status.replace(/_/g, ' ');
  }

  /** Canceled items (null chip) stay off the calendar. */
  get visibleEvents(): CalendarEvent[] {
    return this.events.filter((event) => event.chip !== null && (this.chipFilter === 'all' || event.chip === this.chipFilter));
  }

  chipCount(chip: ChipFilter): number {
    return this.events.filter((event) => event.chip !== null && (chip === 'all' || event.chip === chip)).length;
  }

  chipLabel(chip: ArticleChip): string {
    return this.chipFilters.find((filter) => filter.key === chip)?.label ?? chip;
  }

  setChip(chip: ChipFilter): void {
    this.chipFilter = this.chipFilter === chip ? 'all' : chip;
  }

  isQueuedBrief(event: CalendarEvent): boolean {
    return event.kind === 'plan_item' && event.chip === 'queued' && !event.projectId;
  }

  /** BLG-style bucket of the 0–100 provider difficulty (mirrors dataforseo.ts difficultyLabel). */
  difficultyText(difficulty: number | null | undefined): string {
    if (difficulty == null) return '';
    return difficulty < 30 ? ' (Easy)' : difficulty < 50 ? ' (Medium)' : difficulty < 70 ? ' (Hard)' : ' (Very hard)';
  }

  difficultyTone(difficulty: number | null | undefined): string | null {
    if (difficulty == null) return null;
    return difficulty < 30 ? 'easy' : difficulty < 50 ? 'medium' : 'hard';
  }

  /** Measured volume only ("—" when the provider has none); 1600 → "1.6K/mo". */
  compact(volume: number | null | undefined): string {
    return volume == null ? 'Vol —' : `${COMPACT.format(volume)}/mo`;
  }

  typeLabel(contentType: string): string {
    return ({ explainer: 'Explainer', ranking: 'Listicle', guide: 'Guide', news: 'News', comparison: 'Comparison', tutorial: 'How-to', 'where-to-watch': 'Where to watch' } as Record<string, string>)[contentType] ?? contentType.replace(/-/g, ' ');
  }

  // ── Peek sheet ──

  openPeek(event: CalendarEvent): void {
    this.peek = event;
    this.movingId = '';
    this.topicId = '';
    const dialog = this.peekDialog?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal();
  }

  closePeek(): void {
    this.peekDialog?.nativeElement.close();
  }

  /** A click on the backdrop lands on the dialog element itself. */
  onSheetBackdrop(event: MouseEvent): void {
    if (event.target === this.peekDialog?.nativeElement) this.closePeek();
  }

  startTopic(event: CalendarEvent): void {
    this.topicId = this.topicId === event.id ? '' : event.id;
    this.topicText = event.primaryKeyword ?? event.title;
  }

  confirmTopic(event: CalendarEvent): void {
    const keyword = this.topicText.replace(/\s+/g, ' ').trim();
    if (!keyword) return;
    const title = keyword.charAt(0).toUpperCase() + keyword.slice(1);
    this.topicSaving = true;
    // The server clears the old keyword's metrics and measures the new one.
    this.planning.updateItem(event.id, { primaryKeyword: keyword, targetQuery: keyword, topic: keyword, title, workingTitle: title, finalSuggestedTitle: null }).subscribe({
      next: () => {
        this.topicSaving = false;
        this.topicId = '';
        this.closePeek();
        this.toast.success('Topic changed.');
        this.load(true);
      },
      error: (err) => {
        this.topicSaving = false;
        this.toast.error(err?.error?.error?.message || 'The topic could not be changed.');
      },
    });
  }

  async deleteItem(event: CalendarEvent): Promise<void> {
    this.closePeek();
    const ok = await this.confirm.confirm({ title: 'Delete this article?', message: `"${event.title}" leaves the calendar. Nothing has been written for it yet.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    this.planning.deleteItem(event.id).subscribe({
      next: () => {
        this.events = this.events.filter((other) => other.id !== event.id);
        this.toast.success('Article removed from the calendar.');
      },
      error: (err) => this.toast.error(err?.error?.error?.message || 'The article could not be deleted.'),
    });
  }

  // ── Keywords and schedule dialogs ──

  openKeywords(): void {
    this.keywordsResult = null;
    this.keywordsDialog?.nativeElement.showModal();
  }

  openSchedule(): void {
    this.scheduleDialog?.nativeElement.showModal();
  }

  get keywordList(): string[] {
    return this.keywordsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  dropReason(reason: string): string {
    return ({ variant: 'merged into a similar keyword as a secondary keyword', duplicate: 'repeated in the list', already_planned: 'already planned or covered', off_topic: 'off-topic for this site' } as Record<string, string>)[reason] ?? reason;
  }

  addKeywords(): void {
    const keywords = this.keywordList;
    if (!this.siteId || !keywords.length || keywords.length > 50) return;
    this.addingKeywords = true;
    this.keywordsResult = null;
    this.planning.addKeywords(this.siteId, keywords).subscribe({
      next: (result) => {
        this.addingKeywords = false;
        this.keywordsResult = result;
        if (result.created.length) {
          this.keywordsText = '';
          this.toast.success(`${result.created.length} article${result.created.length === 1 ? '' : 's'} added to the calendar.`);
          this.load(true);
        }
      },
      error: (err) => {
        this.addingKeywords = false;
        this.toast.error(err?.error?.error?.message || 'The keywords could not be added.');
      },
    });
  }

  openInstructions(event: CalendarEvent): void {
    this.closePeek();
    this.instructionsReturnFocus = document.activeElement as HTMLElement | null;
    this.instructionsFor = event;
    this.instructions = { text: '', url: '', saving: false };
    this.instructionsDialog?.nativeElement.showModal();
    if (!event.planId) return;
    this.planning.getPlan(event.planId).subscribe({
      next: (plan) => {
        const generation = plan.items?.find((item) => item.id === event.id)?.metadata?.generation;
        if (this.instructionsFor?.id === event.id) this.instructions = { text: generation?.instructions ?? '', url: generation?.referenceUrl ?? '', saving: false };
      },
    });
  }

  closeInstructions(): void {
    this.instructionsDialog?.nativeElement.close();
    this.instructionsReturnFocus?.focus();
  }

  saveInstructions(): void {
    const item = this.instructionsFor;
    if (!item) return;
    this.instructions.saving = true;
    this.planning.updateItem(item.id, { generation: { instructions: this.instructions.text, referenceUrl: this.instructions.url } }).subscribe({
      next: () => {
        this.closeInstructions();
        this.toast.success('Instructions saved.');
      },
      error: (err) => {
        this.instructions.saving = false;
        this.toast.error(err?.error?.error?.message || 'The instructions could not be saved.');
      },
    });
  }

  focusDay(date: Date): void {
    this.anchor = date;
    this.viewMode = 'day';
    this.load();
  }

  isToday(date: Date): boolean {
    return date.toDateString() === new Date().toDateString();
  }

  isPast(date: Date): boolean {
    const now = new Date();
    return date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  isWeekend(date: Date): boolean {
    return date.getDay() === 0 || date.getDay() === 6;
  }

  timeLabel(value: string | null): string {
    return value ? localTime(value, this.timeZone) : '—';
  }

  // ── Drag & drop rescheduling with optimistic UI ──

  onDragStart(event: DragEvent, item: CalendarEvent): void {
    if (item.status === 'published' || this.reschedulingIds.has(item.id)) {
      event.preventDefault();
      return;
    }
    this.draggedEvent = item;
    event.dataTransfer?.setData('text/plain', item.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    (event.currentTarget as HTMLElement)?.classList.add('is-dragging');
  }

  onDragEnd(event: DragEvent): void {
    (event.currentTarget as HTMLElement)?.classList.remove('is-dragging');
    this.draggedEvent = null;
  }

  onDropOnCard(event: DragEvent, target: CalendarEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const source = this.draggedEvent;
    if (!source || source.id === target.id) return;
    const targetTime = target.scheduledFor ? new Date(target.scheduledFor) : new Date();
    targetTime.setMinutes(targetTime.getMinutes() + 5);
    this.reschedule(source, targetTime);
  }

  onDropOnDay(event: DragEvent, day: Date): void {
    event.preventDefault();
    const source = this.draggedEvent;
    if (!source) return;
    const time = localTime(source.scheduledFor ?? new Date(), this.timeZone);
    this.reschedule(source, zonedToUtc(this.dayKey(day), time, this.timeZone));
  }

  private reschedule(eventItem: CalendarEvent, target: Date): void {
    if (this.reschedulingIds.has(eventItem.id)) return;
    if (eventItem.status === 'published') {
      this.error = 'Published items cannot be rescheduled.';
      return;
    }
    const previous = eventItem.scheduledFor;
    const optimisticSchedule = target.toISOString();
    this.reschedulingIds.add(eventItem.id);
    eventItem.scheduledFor = optimisticSchedule;
    // Plan items keep their own proposal date; publications own the real delivery time.
    const request: Observable<unknown> = eventItem.kind === 'plan_item'
      ? this.planning.updateItem(eventItem.id, { scheduledFor: optimisticSchedule })
      : this.api.reschedulePublication(eventItem.id, optimisticSchedule);
    request.subscribe({
      next: () => {
        this.reschedulingIds.delete(eventItem.id);
        this.toast.success(eventItem.kind === 'plan_item' ? 'Proposal moved.' : 'Publication rescheduled.');
        this.moveResult = `${eventItem.title} moved to ${localDate(target, this.timeZone)} ${localTime(target, this.timeZone)} (${this.timeZone}).`;
        this.load(true);
      },
      error: (err: unknown) => {
        if (eventItem.scheduledFor === optimisticSchedule) eventItem.scheduledFor = previous;
        this.reschedulingIds.delete(eventItem.id);
        this.error = eventItem.kind === 'plan_item' ? 'The proposal could not be moved.' : 'The publication could not be rescheduled.';
        if (/scheduled_in_past/.test(JSON.stringify((err as { error?: unknown })?.error ?? ''))) this.error += ' Pick a future time, or use Publish now in Publications.';
        this.moveResult = this.error;
        this.load(true);
      },
    });
  }

  // Keyboard alternative to drag: pick an exact date and time in the peek sheet, result announced via aria-live.
  startMove(item: CalendarEvent): void {
    this.movingId = this.movingId === item.id ? '' : item.id;
    const at = item.scheduledFor ?? new Date();
    this.moveTo = `${localDate(at, this.timeZone)}T${localTime(at, this.timeZone)}`;
    this.context.update({ planItemId: item.kind === 'plan_item' && this.movingId ? item.id : null, planId: item.kind === 'plan_item' && this.movingId ? item.planId : null });
  }

  cancelMove(): void {
    this.movingId = '';
    this.context.update({ planItemId: null, planId: null });
  }

  confirmMove(item: CalendarEvent): void {
    const target = this.fromWallClock(this.moveTo);
    if (!target) return;
    this.movingId = '';
    this.moveResult = '';
    this.closePeek();
    this.reschedule(item, target);
  }

  /** `YYYY-MM-DDTHH:mm` from a datetime-local input, read in the site's timezone (DST-safe). */
  private fromWallClock(value: string): Date | null {
    const [date, time] = value.split('T');
    if (!date || !time) return null;
    const target = zonedToUtc(date, time.slice(0, 5), this.timeZone);
    return Number.isNaN(target.getTime()) ? null : target;
  }

  createFromCalendar(): void {
    if (!this.draft.projectId || !this.draft.scheduledFor) {
      this.toast.error('Select content and a scheduled time.');
      return;
    }
    this.creating = true;
    this.api.createPublication({
      projectId: this.draft.projectId,
      channel: this.draft.channel,
      siteId: this.draft.channel === 'website' ? (this.siteId || undefined) : undefined,
      accountId: this.draft.channel !== 'website' ? (this.draft.accountId || undefined) : undefined,
      scheduledFor: this.fromWallClock(this.draft.scheduledFor)?.toISOString(),
    }).subscribe({
      next: () => {
        this.creating = false;
        this.scheduleDialog?.nativeElement.close();
        this.toast.success('Publication added to the calendar.');
        this.draft = { projectId: '', channel: 'website', accountId: '', scheduledFor: '' };
        this.load(true);
      },
      error: (err) => {
        this.creating = false;
        this.toast.error(err?.error?.error?.message || 'The publication could not be scheduled.');
      },
    });
  }
}
