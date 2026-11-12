import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppIconComponent } from '../ui/app-icon.component';
import { StudioApiService } from '../../services/studio-api.service';
import { PlanningApiService, apiMessage } from '../../services/planning-api.service';
import type { SiteIntelligenceOverview, StudioSite } from '../../models/studio.models';
import type { GeneratorPresetPayload, PlanChannel, PlanPreset, SitePlanningSettings } from '../../models/planning.models';
import { PlanningDefaultsCardComponent } from './planning-defaults-card.component';
import { WEEKDAYS, addDays, expectedSlotCount, localDate } from './planning-utils';

const STRATEGY_MODES = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'seo-growth', label: 'SEO growth' },
  { value: 'topical-authority', label: 'Topical authority' },
  { value: 'news-freshness', label: 'News / freshness' },
  { value: 'evergreen-growth', label: 'Evergreen growth' },
  { value: 'commercial-transactional', label: 'Commercial / transactional' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'seasonal', label: 'Seasonal' },
];
const INTENTS = ['informational', 'navigational', 'commercial-investigation', 'transactional', 'comparison', 'news', 'entertainment-discovery', 'where-to-watch', 'sports-live', 'mixed'];
const FORMATS = ['guide', 'news', 'ranking', 'comparison', 'analysis', 'explainer', 'tutorial', 'faq', 'review', 'preview', 'match-preview', 'match-report', 'schedule', 'where-to-watch', 'streaming-recommendation', 'evergreen-pillar', 'cluster-article'];
const list = (value: string) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

/** Compact plan generator: cadence first, strategy presets, advanced options collapsed, exact count before submit. */
@Component({
  selector: 'app-plan-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, PlanningDefaultsCardComponent],
  styles: [
    `
      .pg { display: grid; gap: var(--au-s3); }
      .pg__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--au-s3); }
      .pg .au-field { margin: 0; }
      .pg fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--au-s1) var(--au-s3); align-items: center; }
      .pg legend { font-size: var(--au-fs-body-sm); font-weight: 500; color: var(--au-muted); margin-bottom: var(--au-s1); }
      .pg__days { display: flex; flex-wrap: wrap; gap: 4px; }
      .pg__day { min-width: 44px; min-height: 36px; border: 1px solid var(--au-border); border-radius: var(--au-r-sm); background: var(--au-surface); font: inherit; font-size: var(--au-fs-body-sm); cursor: pointer; color: var(--au-text-2); }
      .pg__day[aria-pressed='true'] { background: var(--au-surface-selected); border-color: var(--au-brand); color: var(--au-brand); font-weight: 600; }
      .pg__intel { display: flex; flex-wrap: wrap; gap: var(--au-s2); align-items: center; font-size: var(--au-fs-body-sm); color: var(--au-muted); }
      .pg__summary { display: flex; flex-wrap: wrap; gap: var(--au-s3); align-items: center; padding: var(--au-s2) var(--au-s3); border-radius: var(--au-r-md); background: var(--au-surface-2); border: 1px solid var(--au-border); }
      .pg__summary strong { font-size: var(--au-fs-section); font-variant-numeric: tabular-nums; }
      .pg__spacer { flex: 1; }
      .pg details summary { cursor: pointer; font-weight: 600; font-size: var(--au-fs-body-sm); }
      .pg details[open] summary { margin-bottom: var(--au-s3); }
      .pg__formats { display: flex; flex-wrap: wrap; gap: var(--au-s1) var(--au-s3); }
      .pg__presets { display: flex; flex-wrap: wrap; gap: var(--au-s2); align-items: end; }
      .pg__presets .au-field { min-width: 200px; flex: 1 1 200px; }
    `,
  ],
  template: `
    <form class="pg" (ngSubmit)="submit()">
      <div class="pg__row">
        <label class="au-field">
          <span class="au-field__label">Site</span>
          <select class="au-select" name="siteId" [(ngModel)]="siteId" (ngModelChange)="onSite()" required>
            <option value="" disabled>Select a site</option>
            <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
          </select>
        </label>
        <label class="au-field">
          <span class="au-field__label">From</span>
          <input class="au-input" type="date" name="dateFrom" [(ngModel)]="dateFrom" required />
        </label>
        <label class="au-field">
          <span class="au-field__label">To</span>
          <input class="au-input" type="date" name="dateTo" [(ngModel)]="dateTo" [min]="dateFrom" required />
        </label>
        <label class="au-field">
          <span class="au-field__label">Proposals per day</span>
          <input class="au-input" type="number" name="perDay" min="1" max="8" [(ngModel)]="articlesPerDay" required />
        </label>
        <label class="au-field">
          <span class="au-field__label">Publish times</span>
          <input class="au-input" name="times" [(ngModel)]="times" placeholder="09:00, 18:00" aria-describedby="pg-times" />
          <span class="au-field__hint" id="pg-times">{{ timezone }} · extra slots use 09:00, 13:00, 18:00…</span>
        </label>
      </div>

      <fieldset>
        <legend>Publishing days</legend>
        <div class="pg__days">
          <button *ngFor="let day of weekdays" type="button" class="pg__day" [attr.aria-pressed]="days.includes(day.value)" [attr.aria-label]="day.long" (click)="toggleDay(day.value)">{{ day.short }}</button>
        </div>
      </fieldset>

      <div class="pg__row">
        <fieldset>
          <legend>Channels</legend>
          <label class="au-checkbox" *ngFor="let channel of channelOptions"><input type="checkbox" [name]="'ch-' + channel.value" [(ngModel)]="channels[channel.value]" /> {{ channel.label }}</label>
        </fieldset>
        <label class="au-field">
          <span class="au-field__label">Strategy</span>
          <select class="au-select" name="mode" [(ngModel)]="strategyMode">
            <option *ngFor="let mode of modes" [value]="mode.value">{{ mode.label }}</option>
          </select>
        </label>
      </div>

      <div class="pg__presets">
        <label class="au-field">
          <span class="au-field__label">Saved preset</span>
          <select class="au-select" name="preset" [(ngModel)]="presetId" (ngModelChange)="applyPreset()">
            <option value="">None</option>
            <option *ngFor="let preset of presets" [value]="preset.id">{{ preset.name }}{{ preset.siteId ? '' : ' (all sites)' }}</option>
          </select>
        </label>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="savePreset()" [disabled]="!siteId">Save as preset…</button>
        <button *ngIf="presetId" class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="updatePreset()">Update preset</button>
        <button *ngIf="presetId" class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="deletePreset()">Delete preset</button>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="showDefaults = !showDefaults" [attr.aria-expanded]="showDefaults" [disabled]="!siteId">Edit defaults</button>
      </div>

      <app-planning-defaults-card *ngIf="showDefaults && siteId" [siteId]="siteId" [presets]="presets" (done)="onDefaults($event)"></app-planning-defaults-card>

      <details>
        <summary>Advanced options</summary>
        <div class="pg">
          <div class="pg__row">
            <label class="au-field">
              <span class="au-field__label">Primary search intent</span>
              <select class="au-select" name="intent" [(ngModel)]="primaryIntent">
                <option value="">Auto</option>
                <option *ngFor="let intent of intents" [value]="intent">{{ intent }}</option>
              </select>
            </label>
            <label class="au-field"><span class="au-field__label">Campaign name</span><input class="au-input" name="campaign" [(ngModel)]="campaignName" /></label>
            <label class="au-field"><span class="au-field__label">Market</span><input class="au-input" name="market" [(ngModel)]="market" placeholder="e.g. Spain" /></label>
            <label class="au-field"><span class="au-field__label">Objective</span><input class="au-input" name="objective" [(ngModel)]="objective" /></label>
            <label class="au-field"><span class="au-field__label">Audience</span><input class="au-input" name="audience" [(ngModel)]="audience" /></label>
          </div>
          <div class="pg__row">
            <label class="au-field"><span class="au-field__label">Priority topics</span><input class="au-input" name="topics" [(ngModel)]="topics" placeholder="Comma-separated" /></label>
            <label class="au-field"><span class="au-field__label">Excluded topics</span><input class="au-input" name="excluded" [(ngModel)]="excludedTopics" placeholder="Comma-separated" /></label>
            <label class="au-field"><span class="au-field__label">Keyword seeds</span><input class="au-input" name="seeds" [(ngModel)]="keywordSeeds" placeholder="Comma-separated" /></label>
            <label class="au-field"><span class="au-field__label">Seasonal events</span><input class="au-input" name="seasonal" [(ngModel)]="seasonalEvents" placeholder="Comma-separated" /></label>
          </div>
          <fieldset>
            <legend>Content formats (none = any)</legend>
            <div class="pg__formats">
              <label class="au-checkbox" *ngFor="let format of formats"><input type="checkbox" [checked]="contentFormats.includes(format)" (change)="toggleFormat(format)" /> {{ format }}</label>
            </div>
          </fieldset>
        </div>
      </details>

      <div class="pg__intel" *ngIf="siteId">
        <ng-container *ngIf="intel?.profile">Site intelligence ready · {{ intel?.totalPages }} pages indexed</ng-container>
        <ng-container *ngIf="intel && !intel.profile">No site intelligence yet: plans will not be grounded in the site's content.</ng-container>
        <a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/site-intelligence">Site intelligence</a>
      </div>

      <div class="pg__summary" role="status" aria-live="polite">
        <strong>{{ expected.count }}</strong>
        <span>
          proposals will be planned
          <ng-container *ngIf="expected.past"> · {{ expected.past }} slot{{ expected.past === 1 ? '' : 's' }} already in the past will be skipped</ng-container>
        </span>
        <span class="au-error" *ngIf="expected.count > 200">One plan holds at most 200 proposals.</span>
        <span class="au-error" *ngIf="!hasChannel()">Pick at least one channel.</span>
        <span class="pg__spacer"></span>
        <button class="au-btn au-btn--primary" type="submit" [disabled]="busy || !siteId || expected.count === 0 || expected.count > 200 || !hasChannel()">
          <app-icon name="sparkles"></app-icon> {{ busy ? 'Planning…' : 'Generate ' + expected.count + ' proposals' }}
        </button>
      </div>
      <p class="au-error" *ngIf="message" role="alert">{{ message }}</p>
    </form>
  `,
})
export class PlanGeneratorComponent implements OnInit {
  private readonly studio = inject(StudioApiService);
  private readonly api = inject(PlanningApiService);
  @Input() sites: StudioSite[] = [];
  @Input() initialSiteId = '';
  @Input() initialPillar = '';
  @Input() busy = false;
  @Output() generate = new EventEmitter<Record<string, unknown>>();

  readonly weekdays = WEEKDAYS;
  readonly modes = STRATEGY_MODES;
  readonly intents = INTENTS;
  readonly formats = FORMATS;
  readonly channelOptions: Array<{ value: PlanChannel; label: string }> = [
    { value: 'website', label: 'Website' },
    { value: 'x', label: 'X' },
    { value: 'instagram', label: 'Instagram' },
  ];
  siteId = '';
  timezone = 'Europe/Madrid';
  dateFrom = '';
  dateTo = '';
  articlesPerDay = 1;
  times = '';
  days: number[] = [0, 1, 2, 3, 4, 5, 6];
  channels: Record<PlanChannel, boolean> = { website: true, x: false, instagram: false };
  strategyMode = 'balanced';
  primaryIntent = '';
  campaignName = '';
  market = '';
  objective = '';
  audience = '';
  topics = '';
  excludedTopics = '';
  keywordSeeds = '';
  seasonalEvents = '';
  contentFormats: string[] = [];
  presets: PlanPreset[] = [];
  presetId = '';
  showDefaults = false;
  intel: SiteIntelligenceOverview | null = null;
  message = '';

  ngOnInit(): void {
    this.siteId = this.initialSiteId || this.sites[0]?.id || '';
    if (this.initialPillar) this.topics = this.initialPillar;
    this.onSite();
  }

  get expected(): { count: number; past: number } {
    return expectedSlotCount({ dateFrom: this.dateFrom, dateTo: this.dateTo, weekdays: this.days, articlesPerDay: Number(this.articlesPerDay) || 0, times: this.timeList(), timeZone: this.timezone });
  }

  hasChannel(): boolean {
    return Object.values(this.channels).some(Boolean);
  }

  private timeList(): string[] {
    return list(this.times).filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  }

  onSite(): void {
    this.intel = null;
    this.presetId = '';
    if (!this.siteId) return;
    this.studio.getSiteIntelligence(this.siteId).subscribe({ next: (intel) => (this.intel = intel), error: () => (this.intel = null) });
    this.api.listPresets(this.siteId).subscribe({ next: ({ items }) => (this.presets = items), error: () => (this.presets = []) });
    this.api.getPlanningSettings(this.siteId).subscribe({
      next: (settings) => {
        this.applyDefaults(settings);
        if (settings.defaultPresetId) {
          this.presetId = settings.defaultPresetId;
          // Presets load in parallel; apply once both are in.
          setTimeout(() => this.applyPreset(), 0);
        }
      },
      error: () => undefined,
    });
  }

  private applyDefaults(settings: SitePlanningSettings): void {
    this.timezone = settings.timezone;
    this.articlesPerDay = settings.articlesPerDay;
    this.days = [...settings.weekdays];
    this.times = settings.publishTimes.join(', ');
    this.channels = { website: settings.channels.includes('website'), x: settings.channels.includes('x'), instagram: settings.channels.includes('instagram') };
    const today = localDate(new Date(), this.timezone);
    this.dateFrom = addDays(today, 1);
    this.dateTo = addDays(today, 7);
  }

  onDefaults(settings: SitePlanningSettings | null): void {
    this.showDefaults = false;
    if (settings) this.applyDefaults(settings);
  }

  toggleDay(day: number): void {
    this.days = this.days.includes(day) ? this.days.filter((entry) => entry !== day) : [...this.days, day];
  }

  toggleFormat(format: string): void {
    this.contentFormats = this.contentFormats.includes(format) ? this.contentFormats.filter((entry) => entry !== format) : [...this.contentFormats, format];
  }

  private presetPayload(): GeneratorPresetPayload {
    return {
      articlesPerDay: Number(this.articlesPerDay),
      weekdays: this.days,
      publishTimes: this.timeList(),
      channels: (Object.keys(this.channels) as PlanChannel[]).filter((channel) => this.channels[channel]),
      strategyMode: this.strategyMode,
      primaryIntent: this.primaryIntent || undefined,
      contentFormats: this.contentFormats,
      campaignName: this.campaignName || undefined,
      market: this.market || undefined,
      objective: this.objective || undefined,
      audience: this.audience || undefined,
      topics: list(this.topics),
      excludedTopics: list(this.excludedTopics),
      keywordSeeds: list(this.keywordSeeds),
      seasonalEvents: list(this.seasonalEvents),
    };
  }

  applyPreset(): void {
    const preset = this.presets.find((entry) => entry.id === this.presetId);
    if (!preset) return;
    const p = preset.payload;
    if (p.articlesPerDay) this.articlesPerDay = p.articlesPerDay;
    if (p.weekdays?.length) this.days = [...p.weekdays];
    if (p.publishTimes) this.times = p.publishTimes.join(', ');
    if (p.channels?.length) this.channels = { website: p.channels.includes('website'), x: p.channels.includes('x'), instagram: p.channels.includes('instagram') };
    this.strategyMode = p.strategyMode ?? 'balanced';
    this.primaryIntent = p.primaryIntent ?? '';
    this.contentFormats = [...(p.contentFormats ?? [])];
    this.campaignName = p.campaignName ?? '';
    this.market = p.market ?? '';
    this.objective = p.objective ?? '';
    this.audience = p.audience ?? '';
    this.topics = this.initialPillar || (p.topics ?? []).join(', ');
    this.excludedTopics = (p.excludedTopics ?? []).join(', ');
    this.keywordSeeds = (p.keywordSeeds ?? []).join(', ');
    this.seasonalEvents = (p.seasonalEvents ?? []).join(', ');
  }

  savePreset(): void {
    const name = typeof window !== 'undefined' ? window.prompt('Preset name') : null;
    if (!name?.trim()) return;
    const forAllSites = window.confirm('Make this preset available on every site? Cancel keeps it for this site only.');
    this.api.createPreset({ name: name.trim(), siteId: forAllSites ? null : this.siteId, payload: this.presetPayload() }).subscribe({
      next: (preset) => {
        this.presets = [...this.presets, preset].sort((a, b) => a.name.localeCompare(b.name));
        this.presetId = preset.id;
        this.message = '';
      },
      error: (err) => (this.message = apiMessage(err, 'The preset could not be saved.')),
    });
  }

  updatePreset(): void {
    this.api.updatePreset(this.presetId, { payload: this.presetPayload() }).subscribe({
      next: (preset) => (this.presets = this.presets.map((entry) => (entry.id === preset.id ? preset : entry))),
      error: (err) => (this.message = apiMessage(err, 'The preset could not be updated.')),
    });
  }

  deletePreset(): void {
    const id = this.presetId;
    this.api.deletePreset(id).subscribe({
      next: () => {
        this.presets = this.presets.filter((entry) => entry.id !== id);
        this.presetId = '';
      },
      error: (err) => (this.message = apiMessage(err, 'The preset could not be deleted.')),
    });
  }

  submit(): void {
    if (this.busy || !this.siteId || this.expected.count === 0 || this.expected.count > 200 || !this.hasChannel()) return;
    const p = this.presetPayload();
    this.generate.emit({
      siteId: this.siteId,
      dateFrom: this.dateFrom,
      dateTo: this.dateTo,
      // No timezone: the server plans in the site's timezone.
      articlesPerDay: p.articlesPerDay,
      weekdays: p.weekdays,
      publishTimes: p.publishTimes,
      channels: p.channels,
      strategyMode: p.strategyMode,
      primaryIntent: p.primaryIntent,
      contentFormats: p.contentFormats?.length ? p.contentFormats : undefined,
      campaignName: p.campaignName,
      market: p.market,
      objective: p.objective,
      audience: p.audience,
      topics: p.topics,
      excludedTopics: p.excludedTopics,
      keywordSeeds: p.keywordSeeds,
      seasonalEvents: p.seasonalEvents,
    });
  }
}
