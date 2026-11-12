import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlanningApiService, apiMessage } from '../../services/planning-api.service';
import type { PlanChannel, PlanPreset, SitePlanningSettings } from '../../models/planning.models';
import { WEEKDAYS } from './planning-utils';

const TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Europe/Madrid', 'UTC'];

/** Per-site planning defaults (timezone, cadence, channels, default preset); the generator prefills from them. */
@Component({
  selector: 'app-planning-defaults-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      .pdc { border: 1px solid var(--au-border); border-radius: var(--au-r-md); padding: var(--au-s3); background: var(--au-surface-2); display: grid; gap: var(--au-s3); }
      .pdc h3 { margin: 0; font-size: var(--au-fs-body); }
      .pdc__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--au-s3); }
      .pdc .au-field { margin: 0; }
      .pdc fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--au-s2); }
      .pdc legend { font-size: var(--au-fs-body-sm); font-weight: 500; color: var(--au-muted); margin-bottom: var(--au-s1); }
      .pdc__actions { display: flex; gap: var(--au-s2); align-items: center; flex-wrap: wrap; }
    `,
  ],
  template: `
    <section class="pdc" aria-labelledby="pdc-title">
      <h3 id="pdc-title">Planning defaults for this site</h3>
      <p class="au-muted au-mb-0" *ngIf="!settings">Loading…</p>
      <ng-container *ngIf="settings">
        <div class="pdc__grid">
          <label class="au-field">
            <span class="au-field__label">Site timezone</span>
            <input class="au-input" name="tz" list="pdc-tz" [(ngModel)]="settings.timezone" />
            <datalist id="pdc-tz"><option *ngFor="let zone of timezones" [value]="zone"></option></datalist>
          </label>
          <label class="au-field">
            <span class="au-field__label">Proposals per day</span>
            <input class="au-input" type="number" min="1" max="8" name="apd" [(ngModel)]="settings.articlesPerDay" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Publish times</span>
            <input class="au-input" name="times" [(ngModel)]="times" placeholder="09:00, 18:00" aria-describedby="pdc-times" />
            <span class="au-field__hint" id="pdc-times">24 h, comma-separated</span>
          </label>
          <label class="au-field">
            <span class="au-field__label">Default preset</span>
            <select class="au-select" name="preset" [(ngModel)]="settings.defaultPresetId">
              <option [ngValue]="null">None</option>
              <option *ngFor="let preset of presets" [ngValue]="preset.id">{{ preset.name }}</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Publishing days</legend>
          <label class="au-checkbox" *ngFor="let day of weekdays">
            <input type="checkbox" [checked]="settings.weekdays.includes(day.value)" (change)="toggleDay(day.value)" /> {{ day.short }}
          </label>
        </fieldset>
        <fieldset>
          <legend>Channels</legend>
          <label class="au-checkbox" *ngFor="let channel of channelOptions">
            <input type="checkbox" [checked]="settings.channels.includes(channel.value)" (change)="toggleChannel(channel.value)" /> {{ channel.label }}
          </label>
        </fieldset>
        <div class="pdc__actions">
          <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="saving" (click)="save()">{{ saving ? 'Saving…' : 'Save defaults' }}</button>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="done.emit(null)">Close</button>
          <span role="status" aria-live="polite" [class.au-error]="error" class="au-muted">{{ message }}</span>
        </div>
      </ng-container>
    </section>
  `,
})
export class PlanningDefaultsCardComponent implements OnChanges {
  private readonly api = inject(PlanningApiService);
  @Input({ required: true }) siteId!: string;
  @Input() presets: PlanPreset[] = [];
  @Output() done = new EventEmitter<SitePlanningSettings | null>();
  readonly timezones = TIMEZONES;
  readonly weekdays = WEEKDAYS;
  readonly channelOptions: Array<{ value: PlanChannel; label: string }> = [
    { value: 'website', label: 'Website' },
    { value: 'x', label: 'X' },
    { value: 'instagram', label: 'Instagram' },
  ];
  settings: SitePlanningSettings | null = null;
  times = '';
  saving = false;
  message = '';
  error = false;

  ngOnChanges(): void {
    this.settings = null;
    this.api.getPlanningSettings(this.siteId).subscribe({
      next: (settings) => {
        this.settings = { ...settings, weekdays: [...settings.weekdays], channels: [...settings.channels] };
        this.times = settings.publishTimes.join(', ');
      },
      error: (err) => this.say(apiMessage(err, 'Defaults could not be loaded.'), true),
    });
  }

  toggleDay(day: number): void {
    const days = this.settings!.weekdays;
    this.settings!.weekdays = days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day];
  }

  toggleChannel(channel: PlanChannel): void {
    const channels = this.settings!.channels;
    this.settings!.channels = channels.includes(channel) ? channels.filter((entry) => entry !== channel) : [...channels, channel];
  }

  save(): void {
    const settings = this.settings!;
    this.saving = true;
    this.say('');
    this.api
      .putPlanningSettings(this.siteId, {
        timezone: settings.timezone.trim(),
        articlesPerDay: Number(settings.articlesPerDay),
        weekdays: settings.weekdays,
        publishTimes: this.times.split(',').map((time) => time.trim()).filter(Boolean),
        channels: settings.channels,
        defaultPresetId: settings.defaultPresetId,
      })
      .subscribe({
        next: (saved) => {
          this.saving = false;
          this.say('Defaults saved.');
          this.done.emit(saved);
        },
        error: (err) => {
          this.saving = false;
          this.say(apiMessage(err, 'Defaults could not be saved.'), true);
        },
      });
  }

  private say(message: string, error = false): void {
    this.message = message;
    this.error = error;
  }
}
