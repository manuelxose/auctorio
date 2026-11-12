import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AppIconComponent } from '../ui/app-icon.component';
import { ConfirmService } from '../../services/confirm.service';
import { PlanningApiService, apiMessage, isRunning } from '../../services/planning-api.service';
import type { OperationItem } from '../../models/studio.models';
import type { PlanEvidenceEntry, PlanItem, PlanOutlineEntry, PlanningInventory } from '../../models/planning.models';
import { channelLabel, evidenceOf, itemTitle, localDate, localTime, outlineOf, statusLabel, statusTone, stringList, zonedToUtc } from './planning-utils';

const CONTENT_TYPES = ['guide', 'news', 'ranking', 'comparison', 'analysis', 'explainer', 'tutorial', 'faq', 'review', 'preview', 'match-preview', 'match-report', 'schedule', 'where-to-watch', 'streaming-recommendation', 'evergreen-pillar', 'cluster-article'];
const INTENTS = ['informational', 'navigational', 'commercial-investigation', 'transactional', 'comparison', 'news', 'entertainment-discovery', 'where-to-watch', 'sports-live', 'mixed'];

type Draft = {
  title: string;
  workingTitle: string;
  finalSuggestedTitle: string;
  topic: string;
  topicCluster: string;
  contentType: string;
  primaryIntent: string;
  secondaryIntents: string;
  primaryKeyword: string;
  secondaryKeywords: string;
  relatedEntities: string;
  seoTitle: string;
  metaDescription: string;
  audience: string;
  outline: PlanOutlineEntry[];
  wordMin: number | null;
  wordMax: number | null;
  evidence: PlanEvidenceEntry[];
  links: string[];
  priority: number;
  date: string;
  time: string;
  notes: string;
  tone: string;
  includeFaq: 'default' | 'yes' | 'no';
  includeImage: 'default' | 'yes' | 'no';
  instructions: string;
};

const csv = (value: string) => value.split(',').map((entry) => entry.trim()).filter(Boolean);
const tri = (value: boolean | null | undefined): Draft['includeFaq'] => (value === true ? 'yes' : value === false ? 'no' : 'default');
const fromTri = (value: Draft['includeFaq']) => (value === 'yes' ? true : value === 'no' ? false : null);

/**
 * Full-brief editor for one plan item. Overlays the workspace (the calendar stays mounted underneath),
 * traps focus while open, closes on Escape and returns focus to whatever opened it.
 */
@Component({
  selector: 'app-plan-item-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent],
  styles: [
    `
      .pd-backdrop { position: fixed; inset: 0; background: var(--au-overlay); z-index: 40; }
      .pd { position: fixed; top: 0; right: 0; bottom: 0; width: min(620px, 100vw); display: flex; flex-direction: column; background: var(--au-surface-solid, var(--au-surface)); border-left: 1px solid var(--au-border); box-shadow: var(--au-shadow-pop); z-index: 41; }
      .pd__head { display: flex; align-items: flex-start; gap: var(--au-s3); padding: var(--au-s4); border-bottom: 1px solid var(--au-border); }
      .pd__head h2 { margin: 0; font-size: var(--au-fs-section); line-height: 1.3; overflow-wrap: anywhere; }
      .pd__meta { display: flex; flex-wrap: wrap; gap: var(--au-s2); align-items: center; margin-top: var(--au-s1); font-size: var(--au-fs-body-sm); color: var(--au-muted); }
      .pd__body { flex: 1; overflow-y: auto; padding: var(--au-s4); display: grid; gap: var(--au-s4); align-content: start; }
      .pd__foot { display: flex; flex-wrap: wrap; gap: var(--au-s2); align-items: center; padding: var(--au-s3) var(--au-s4); border-top: 1px solid var(--au-border); }
      .pd__foot-spacer { flex: 1; }
      .pd fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: var(--au-s3); }
      .pd legend { font-weight: 600; font-size: var(--au-fs-body); padding: 0; margin-bottom: var(--au-s2); }
      .pd__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--au-s3); }
      .pd__grid .au-field { margin: 0; }
      .pd .au-field { margin: 0; }
      .pd__count { font-variant-numeric: tabular-nums; color: var(--au-muted); font-size: var(--au-fs-caption); }
      .pd__count.is-over { color: var(--au-danger); }
      .pd__list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--au-s2); }
      .pd__row { display: flex; gap: var(--au-s2); align-items: center; min-width: 0; }
      .pd__row > .au-input { flex: 1; min-width: 0; }
      .pd__row-text { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: var(--au-fs-body-sm); }
      .pd__row-text small { display: block; color: var(--au-muted); }
      .pd__heading { border: 1px solid var(--au-border); border-radius: var(--au-r-md); padding: var(--au-s2); display: grid; gap: var(--au-s2); }
      .pd__subs { padding-left: var(--au-s4); display: grid; gap: var(--au-s1); }
      .pd__picker { position: relative; }
      .pd__results { list-style: none; margin: var(--au-s1) 0 0; padding: var(--au-s1); border: 1px solid var(--au-border); border-radius: var(--au-r-md); background: var(--au-surface); max-height: 220px; overflow-y: auto; }
      .pd__results button { display: block; width: 100%; text-align: left; border: 0; background: transparent; font: inherit; padding: var(--au-s2); border-radius: var(--au-r-sm); cursor: pointer; color: var(--au-text); }
      .pd__results button:hover, .pd__results button:focus-visible { background: var(--au-surface-hover); }
      .pd__results small { display: block; color: var(--au-muted); overflow-wrap: anywhere; }
      .pd__status { font-size: var(--au-fs-body-sm); color: var(--au-muted); }
      .pd__status.is-error { color: var(--au-danger); }
      @media (max-width: 560px) {
        .pd__grid { grid-template-columns: 1fr; }
        .pd .au-btn { min-height: 40px; }
      }
    `,
  ],
  template: `
    <div class="pd-backdrop" (click)="requestClose()" aria-hidden="true"></div>
    <aside #panel class="pd" role="dialog" aria-modal="true" aria-labelledby="pd-title">
      <header class="pd__head">
        <div class="au-min-0" style="flex: 1; min-width: 0">
          <h2 id="pd-title">{{ titleOf() }}</h2>
          <div class="pd__meta">
            <span class="au-badge" [class]="'au-badge au-badge--' + tone(item.status)">{{ label(item.status) }}</span>
            <span>{{ channel(item.channel) }}</span>
            <span *ngIf="item.scheduledFor">{{ item.scheduledFor | date: 'EEE d MMM, HH:mm' : undefined : 'en-US' }} · {{ timezone }}</span>
          </div>
        </div>
        <button #closeBtn class="au-btn au-btn--ghost au-btn--icon" type="button" (click)="requestClose()" aria-label="Close brief editor">
          <app-icon name="close"></app-icon>
        </button>
      </header>

      <form class="pd__body" id="pd-form" (ngSubmit)="save()">
        <fieldset>
          <legend>Headline</legend>
          <label class="au-field">
            <span class="au-field__label">Headline</span>
            <input class="au-input" name="title" [(ngModel)]="draft.title" required maxlength="300" />
          </label>
          <div class="pd__grid">
            <label class="au-field">
              <span class="au-field__label">Working title</span>
              <input class="au-input" name="workingTitle" [(ngModel)]="draft.workingTitle" maxlength="300" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Final title</span>
              <input class="au-input" name="finalSuggestedTitle" [(ngModel)]="draft.finalSuggestedTitle" maxlength="300" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Topic and search</legend>
          <div class="pd__grid">
            <label class="au-field">
              <span class="au-field__label">Topic</span>
              <input class="au-input" name="topic" [(ngModel)]="draft.topic" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Cluster / category</span>
              <input class="au-input" name="topicCluster" [(ngModel)]="draft.topicCluster" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Content type</span>
              <select class="au-select" name="contentType" [(ngModel)]="draft.contentType">
                <option value="">Not set</option>
                <option *ngFor="let type of contentTypes" [value]="type">{{ type }}</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Primary search intent</span>
              <select class="au-select" name="primaryIntent" [(ngModel)]="draft.primaryIntent">
                <option value="">Not set</option>
                <option *ngFor="let intent of intents" [value]="intent">{{ intent }}</option>
              </select>
            </label>
          </div>
          <label class="au-field">
            <span class="au-field__label">Secondary intents</span>
            <input class="au-input" name="secondaryIntents" [(ngModel)]="draft.secondaryIntents" aria-describedby="pd-csv" />
          </label>
          <div class="pd__grid">
            <label class="au-field">
              <span class="au-field__label">Primary keyword</span>
              <input class="au-input" name="primaryKeyword" [(ngModel)]="draft.primaryKeyword" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Secondary keywords</span>
              <input class="au-input" name="secondaryKeywords" [(ngModel)]="draft.secondaryKeywords" aria-describedby="pd-csv" />
            </label>
          </div>
          <label class="au-field">
            <span class="au-field__label">Related entities</span>
            <input class="au-input" name="relatedEntities" [(ngModel)]="draft.relatedEntities" aria-describedby="pd-csv" />
          </label>
          <p class="au-hint" id="pd-csv">Separate multiple values with commas.</p>
          <label class="au-field">
            <span class="au-field__label">SEO title <span class="pd__count" [class.is-over]="draft.seoTitle.length > 60">{{ draft.seoTitle.length }}/60</span></span>
            <input class="au-input" name="seoTitle" [(ngModel)]="draft.seoTitle" maxlength="200" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Meta description <span class="pd__count" [class.is-over]="draft.metaDescription.length > 155">{{ draft.metaDescription.length }}/155</span></span>
            <textarea class="au-textarea" name="metaDescription" rows="2" [(ngModel)]="draft.metaDescription" maxlength="400"></textarea>
          </label>
          <label class="au-field">
            <span class="au-field__label">Audience</span>
            <input class="au-input" name="audience" [(ngModel)]="draft.audience" />
          </label>
        </fieldset>

        <fieldset>
          <legend>Outline</legend>
          <ol class="pd__list">
            <li class="pd__heading" *ngFor="let entry of draft.outline; let i = index; let first = first; let last = last">
              <div class="pd__row">
                <input class="au-input" [name]="'heading' + i" [(ngModel)]="entry.heading" [attr.aria-label]="'Heading ' + (i + 1)" />
                <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" [disabled]="first" (click)="move(draft.outline, i, -1)" [attr.aria-label]="'Move heading ' + (i + 1) + ' up'"><app-icon name="arrow-up"></app-icon></button>
                <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" [disabled]="last" (click)="move(draft.outline, i, 1)" [attr.aria-label]="'Move heading ' + (i + 1) + ' down'"><app-icon name="arrow-down"></app-icon></button>
                <button class="au-btn au-btn--danger-ghost au-btn--icon au-btn--sm" type="button" (click)="draft.outline.splice(i, 1)" [attr.aria-label]="'Remove heading ' + (i + 1)"><app-icon name="trash"></app-icon></button>
              </div>
              <ul class="pd__list pd__subs">
                <li class="pd__row" *ngFor="let sub of entry.subpoints; let j = index; let subFirst = first; let subLast = last; trackBy: trackIndex">
                  <input class="au-input" [name]="'sub' + i + '-' + j" [ngModel]="sub" (ngModelChange)="entry.subpoints![j] = $event" [attr.aria-label]="'Heading ' + (i + 1) + ', point ' + (j + 1)" />
                  <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" [disabled]="subFirst" (click)="move(entry.subpoints!, j, -1)" [attr.aria-label]="'Move point ' + (j + 1) + ' up'"><app-icon name="arrow-up"></app-icon></button>
                  <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" [disabled]="subLast" (click)="move(entry.subpoints!, j, 1)" [attr.aria-label]="'Move point ' + (j + 1) + ' down'"><app-icon name="arrow-down"></app-icon></button>
                  <button class="au-btn au-btn--danger-ghost au-btn--icon au-btn--sm" type="button" (click)="entry.subpoints!.splice(j, 1)" [attr.aria-label]="'Remove point ' + (j + 1)"><app-icon name="trash"></app-icon></button>
                </li>
                <li><button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="(entry.subpoints = entry.subpoints ?? []).push('')"><app-icon name="plus"></app-icon> Add point</button></li>
              </ul>
            </li>
          </ol>
          <div><button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="draft.outline.push({ heading: '', subpoints: [] })"><app-icon name="plus"></app-icon> Add heading</button></div>
          <div class="pd__grid">
            <label class="au-field">
              <span class="au-field__label">Word count min</span>
              <input class="au-input" type="number" name="wordMin" min="200" max="10000" step="50" [(ngModel)]="draft.wordMin" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Word count max</span>
              <input class="au-input" type="number" name="wordMax" min="200" max="10000" step="50" [(ngModel)]="draft.wordMax" [attr.aria-invalid]="wordRangeInvalid()" aria-describedby="pd-words" />
            </label>
          </div>
          <p class="au-error" id="pd-words" *ngIf="wordRangeInvalid()">The minimum cannot exceed the maximum.</p>
        </fieldset>

        <fieldset>
          <legend>Evidence and internal links</legend>
          <p class="au-hint">Only pages indexed from this site and known source items can be added, so the writer never cites invented URLs.</p>
          <ul class="pd__list" aria-label="Source evidence">
            <li class="pd__row" *ngFor="let entry of draft.evidence; let i = index">
              <span class="pd__row-text">{{ entry.title }}<small *ngIf="entry.url">{{ entry.url }}</small></span>
              <button class="au-btn au-btn--danger-ghost au-btn--icon au-btn--sm" type="button" (click)="draft.evidence.splice(i, 1)" [attr.aria-label]="'Remove evidence ' + entry.title"><app-icon name="trash"></app-icon></button>
            </li>
            <li class="au-hint" *ngIf="draft.evidence.length === 0">No evidence attached.</li>
          </ul>
          <ul class="pd__list" aria-label="Internal links">
            <li class="pd__row" *ngFor="let url of draft.links; let i = index">
              <span class="pd__row-text"><small>Internal link</small>{{ url }}</span>
              <button class="au-btn au-btn--danger-ghost au-btn--icon au-btn--sm" type="button" (click)="draft.links.splice(i, 1)" [attr.aria-label]="'Remove internal link ' + url"><app-icon name="trash"></app-icon></button>
            </li>
            <li class="au-hint" *ngIf="draft.links.length === 0">No internal links.</li>
          </ul>
          <div class="pd__picker" *ngIf="siteId">
            <label class="au-field">
              <span class="au-field__label">Find a page or source to add</span>
              <input class="au-input" type="search" name="inventoryQuery" [(ngModel)]="inventoryQuery" (ngModelChange)="search$.next($event)" placeholder="Search indexed pages and sources" autocomplete="off" />
            </label>
            <ul class="pd__results" *ngIf="inventory && inventoryQuery.trim()">
              <li *ngFor="let page of inventory.indexedPages">
                <button type="button" (click)="addLink(page.url)" [disabled]="draft.links.includes(page.url)">Add as internal link · {{ page.title }}<small>{{ page.url }}</small></button>
                <button type="button" (click)="addEvidence(page.title, page.url, 'indexed-page')" [disabled]="hasEvidence(page.url)">Add as evidence · {{ page.title }}<small>{{ page.url }}</small></button>
              </li>
              <li *ngFor="let source of inventory.sourceItems">
                <button type="button" (click)="addEvidence(source.title, source.url, 'source')" [disabled]="hasEvidence(source.url)">Add as evidence · {{ source.title }}<small>{{ source.url }}</small></button>
              </li>
              <li class="au-hint" *ngIf="inventory.indexedPages.length + inventory.sourceItems.length === 0">No indexed page or source matches.</li>
            </ul>
          </div>
        </fieldset>

        <fieldset>
          <legend>Schedule and priority</legend>
          <div class="pd__grid">
            <label class="au-field">
              <span class="au-field__label">Date ({{ timezone }})</span>
              <input class="au-input" type="date" name="date" [(ngModel)]="draft.date" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Time</span>
              <input class="au-input" type="time" name="time" [(ngModel)]="draft.time" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Priority (1 low – 10 high)</span>
              <input class="au-input" type="number" name="priority" min="1" max="10" [(ngModel)]="draft.priority" />
            </label>
          </div>
          <label class="au-field">
            <span class="au-field__label">Notes for the writer</span>
            <textarea class="au-textarea" name="notes" rows="3" [(ngModel)]="draft.notes"></textarea>
          </label>
        </fieldset>

        <fieldset>
          <legend>Generation settings</legend>
          <div class="pd__grid">
            <label class="au-field">
              <span class="au-field__label">Tone</span>
              <input class="au-input" name="tone" [(ngModel)]="draft.tone" placeholder="Site default" maxlength="80" />
            </label>
            <label class="au-field">
              <span class="au-field__label">FAQ section</span>
              <select class="au-select" name="includeFaq" [(ngModel)]="draft.includeFaq">
                <option value="default">Site default</option>
                <option value="yes">Include</option>
                <option value="no">Leave out</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Featured image</span>
              <select class="au-select" name="includeImage" [(ngModel)]="draft.includeImage">
                <option value="default">Site default</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <label class="au-field">
            <span class="au-field__label">Extra instructions</span>
            <textarea class="au-textarea" name="instructions" rows="2" [(ngModel)]="draft.instructions" maxlength="2000"></textarea>
          </label>
        </fieldset>
      </form>

      <footer class="pd__foot">
        <p class="pd__status" [class.is-error]="statusIsError" role="status" aria-live="polite">{{ status }}</p>
        <span class="pd__foot-spacer"></span>
        <a *ngIf="item.projectId" class="au-btn au-btn--ghost" [routerLink]="['/studio/content', item.projectId]">Open content</a>
        <button *ngIf="item.status === 'proposed' || item.status === 'rejected'" class="au-btn au-btn--ghost" type="button" [disabled]="busy" (click)="regenerate()">
          <app-icon name="refresh"></app-icon> {{ regenerating ? 'Regenerating…' : 'Regenerate' }}
        </button>
        <button *ngIf="item.status === 'proposed' || item.status === 'approved'" class="au-btn au-btn--ghost" type="button" [disabled]="busy" (click)="setStatus('rejected')">Reject</button>
        <button *ngIf="item.status === 'proposed' || item.status === 'rejected'" class="au-btn au-btn--secondary" type="button" [disabled]="busy" (click)="setStatus('approved')">
          <app-icon name="circle-check"></app-icon> Approve
        </button>
        <button *ngIf="item.status === 'approved' && !item.projectId" class="au-btn au-btn--secondary" type="button" [disabled]="busy" (click)="generateDraft()">
          <app-icon name="sparkles"></app-icon> Generate draft
        </button>
        <button class="au-btn au-btn--primary" type="submit" form="pd-form" [disabled]="busy || !draft.title.trim() || wordRangeInvalid() || !dirty()">
          {{ saving ? 'Saving…' : 'Save brief' }}
        </button>
      </footer>
    </aside>
  `,
})
export class PlanItemDrawerComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly api = inject(PlanningApiService);
  private readonly confirm = inject(ConfirmService);
  @Input({ required: true }) item!: PlanItem;
  @Input() timezone = 'Europe/Madrid';
  @Input() siteId: string | null = null;
  /** Emitted after any server change; `replacedBy` is set when regeneration swapped the item. */
  @Output() changed = new EventEmitter<{ item?: PlanItem; regenerated?: boolean }>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLElement>;
  @ViewChild('closeBtn', { static: true }) closeBtn!: ElementRef<HTMLButtonElement>;

  readonly contentTypes = CONTENT_TYPES;
  readonly intents = INTENTS;
  draft!: Draft;
  private initial = '';
  saving = false;
  regenerating = false;
  pending = false;
  private confirming = false;
  status = '';
  statusIsError = false;
  inventoryQuery = '';
  inventory: PlanningInventory | null = null;
  readonly search$ = new Subject<string>();
  private readonly opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  private readonly subs = new Subscription();

  readonly label = statusLabel;
  readonly tone = statusTone;
  readonly channel = channelLabel;

  constructor() {
    this.subs.add(
      this.search$
        .pipe(debounceTime(250), distinctUntilChanged(), switchMap((q) => this.api.inventory(this.siteId!, q.trim())))
        .subscribe({ next: (inventory) => (this.inventory = inventory), error: () => (this.inventory = { indexedPages: [], sourceItems: [] }) }),
    );
  }

  get busy(): boolean {
    return this.saving || this.regenerating || this.pending;
  }

  ngOnChanges(): void {
    const item = this.item;
    const generation = item.metadata?.generation ?? {};
    this.draft = {
      title: item.title,
      workingTitle: item.workingTitle ?? '',
      finalSuggestedTitle: item.finalSuggestedTitle ?? '',
      topic: item.topic ?? '',
      topicCluster: item.topicCluster ?? '',
      contentType: item.contentType ?? '',
      primaryIntent: item.primaryIntent ?? '',
      secondaryIntents: stringList(item.secondaryIntents).join(', '),
      primaryKeyword: item.primaryKeyword ?? '',
      secondaryKeywords: stringList(item.secondaryKeywords).join(', '),
      relatedEntities: stringList(item.relatedEntities).join(', '),
      seoTitle: item.seoTitle ?? '',
      metaDescription: item.metaDescription ?? '',
      audience: item.audience ?? '',
      outline: outlineOf(item.outline),
      wordMin: item.recommendedWordCountMin,
      wordMax: item.recommendedWordCountMax,
      evidence: evidenceOf(item.sourceEvidence),
      links: stringList(item.suggestedInternalLinks),
      priority: item.priority ?? 5,
      date: item.scheduledFor ? localDate(item.scheduledFor, this.timezone) : '',
      time: item.scheduledFor ? localTime(item.scheduledFor, this.timezone) : '09:00',
      notes: item.notes ?? '',
      tone: generation.tone ?? '',
      includeFaq: tri(generation.includeFaq),
      includeImage: tri(generation.includeImage),
      instructions: generation.instructions ?? '',
    };
    this.initial = JSON.stringify(this.draft);
  }

  ngAfterViewInit(): void {
    this.closeBtn.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.opener?.focus?.();
  }

  titleOf(): string {
    return itemTitle(this.item);
  }

  dirty(): boolean {
    return JSON.stringify(this.draft) !== this.initial;
  }

  wordRangeInvalid(): boolean {
    return this.draft.wordMin !== null && this.draft.wordMax !== null && Number(this.draft.wordMin) > Number(this.draft.wordMax);
  }

  trackIndex(index: number): number {
    return index;
  }

  move<T>(list: T[], index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
  }

  addLink(url: string): void {
    if (!this.draft.links.includes(url)) this.draft.links.push(url);
  }

  addEvidence(title: string, url: string, sourceType: string): void {
    if (!this.hasEvidence(url)) this.draft.evidence.push({ title, url, sourceType });
  }

  hasEvidence(url: string): boolean {
    return this.draft.evidence.some((entry) => entry.url === url);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // While the discard confirmation is open it owns the keyboard.
    if (this.confirming) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      this.panel.nativeElement.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (!this.panel.nativeElement.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async requestClose(): Promise<void> {
    if (this.regenerating) {
      this.say('Regeneration keeps running in the background; the plan refreshes when it finishes.');
    }
    if (this.dirty()) {
      this.confirming = true;
      const discard = await this.confirm.confirm({ title: 'Discard unsaved changes?', message: 'Your edits to this brief have not been saved.', confirmLabel: 'Discard', danger: true });
      this.confirming = false;
      if (!discard) {
        this.closeBtn.nativeElement.focus();
        return;
      }
    }
    this.closed.emit();
  }

  private payload(): Record<string, unknown> {
    const d = this.draft;
    const text = (value: string) => value.trim() || null;
    return {
      title: d.title.trim(),
      workingTitle: text(d.workingTitle),
      finalSuggestedTitle: text(d.finalSuggestedTitle),
      topic: text(d.topic),
      topicCluster: text(d.topicCluster),
      contentType: text(d.contentType),
      primaryIntent: text(d.primaryIntent),
      secondaryIntents: csv(d.secondaryIntents),
      primaryKeyword: text(d.primaryKeyword),
      secondaryKeywords: csv(d.secondaryKeywords),
      relatedEntities: csv(d.relatedEntities),
      seoTitle: text(d.seoTitle),
      metaDescription: text(d.metaDescription),
      audience: text(d.audience),
      outline: d.outline
        .filter((entry) => entry.heading.trim())
        .map((entry) => ({ heading: entry.heading.trim(), subpoints: (entry.subpoints ?? []).map((point) => point.trim()).filter(Boolean) })),
      recommendedWordCountMin: d.wordMin === null || (d.wordMin as unknown) === '' ? null : Number(d.wordMin),
      recommendedWordCountMax: d.wordMax === null || (d.wordMax as unknown) === '' ? null : Number(d.wordMax),
      sourceEvidence: d.evidence,
      suggestedInternalLinks: d.links,
      priority: Math.min(10, Math.max(1, Math.round(Number(d.priority) || 5))),
      scheduledFor: d.date && d.time ? zonedToUtc(d.date, d.time, this.timezone).toISOString() : null,
      notes: text(d.notes),
      generation: { tone: text(d.tone), includeFaq: fromTri(d.includeFaq), includeImage: fromTri(d.includeImage), instructions: text(d.instructions) },
    };
  }

  save(): void {
    if (this.busy || !this.dirty() || this.wordRangeInvalid()) return;
    this.saving = true;
    this.say('Saving…');
    this.api.updateItem(this.item.id, this.payload()).subscribe({
      next: (updated) => {
        this.saving = false;
        this.item = { ...this.item, ...updated };
        this.ngOnChanges();
        this.say('Brief saved. Generation will use these fields.');
        this.changed.emit({ item: this.item });
      },
      error: (err) => {
        this.saving = false;
        this.say(apiMessage(err, 'The brief could not be saved.'), true);
      },
    });
  }

  setStatus(status: 'approved' | 'rejected'): void {
    this.pending = true;
    const request = status === 'approved' ? this.api.approveItem(this.item.id) : this.api.bulkStatus([this.item.id], 'rejected');
    request.subscribe({
      next: () => {
        this.pending = false;
        this.item = { ...this.item, status };
        this.say(status === 'approved' ? 'Proposal approved.' : 'Proposal rejected.');
        this.changed.emit({ item: this.item });
      },
      error: (err) => {
        this.pending = false;
        this.say(apiMessage(err, 'The status could not be changed.'), true);
      },
    });
  }

  generateDraft(): void {
    this.pending = true;
    this.say('Starting the draft…');
    this.api.generateDraft(this.item.id).subscribe({
      next: (result) => {
        this.pending = false;
        this.item = { ...this.item, status: 'generating', projectId: result.project.id };
        this.say('Draft generation started. Open content to follow it.');
        this.changed.emit({ item: this.item });
      },
      error: (err) => {
        this.pending = false;
        this.say(apiMessage(err, 'The draft could not be started.'), true);
      },
    });
  }

  regenerate(): void {
    if (this.dirty()) {
      this.say('Save or discard your edits before regenerating: regeneration replaces this proposal.', true);
      return;
    }
    this.regenerating = true;
    this.say('Regenerating this proposal…');
    this.api.regenerateItem(this.item.id).subscribe({
      next: (accepted) => {
        this.subs.add(
          this.api.watchOperation(accepted.operationId).subscribe({
            next: (op: OperationItem) => {
              if (isRunning(op)) {
                this.say(op.phase || 'Regenerating this proposal…');
                return;
              }
              this.regenerating = false;
              if (op.status === 'failed') this.say(op.errorSummary || 'Regeneration failed; the original proposal was kept.', true);
              else this.say('Proposal regenerated.');
              this.changed.emit({ regenerated: op.status !== 'failed' });
            },
            error: () => {
              this.regenerating = false;
              this.say('Lost track of the regeneration. It keeps running; refresh the plan.', true);
            },
          }),
        );
      },
      error: (err) => {
        this.regenerating = false;
        this.say(apiMessage(err, 'The proposal could not be regenerated.'), true);
      },
    });
  }

  private say(message: string, error = false): void {
    this.status = message;
    this.statusIsError = error;
  }
}
