import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlanningApiService, apiMessage } from '../../services/planning-api.service';
import { ToastService } from '../../services/toast.service';
import type { ArticleSectionKey, SitePlanningSettings } from '../../models/planning.models';
import { WEEKDAYS } from './planning-utils';

/** Settings · Articles (M5): publishing days as chips, guide sections as switches. Count and time stay under "More". */
@Component({
  selector: 'app-article-settings-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      .asc__days { display: flex; flex-wrap: wrap; gap: var(--au-s2); border: 0; padding: 0; margin: 0 0 var(--au-s3); }
      .asc__days legend, .asc__sections legend { font-size: var(--au-fs-body-sm); font-weight: 600; margin-bottom: var(--au-s2); }
      .asc__day { min-width: 52px; min-height: 40px; border: 1px solid var(--au-border); border-radius: 999px; background: var(--au-surface); color: var(--au-text); font: inherit; cursor: pointer; }
      .asc__day[aria-pressed='true'] { background: var(--au-text); color: var(--au-surface-solid, #fff); border-color: var(--au-text); }
      .asc__day:focus-visible { outline: 2px solid var(--au-brand); outline-offset: 2px; }
      @media (pointer: coarse) { .asc__day { min-height: 44px; } }
      .asc__sections { border: 0; padding: 0; margin: var(--au-s4) 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--au-s2); }
      .asc__sections legend { grid-column: 1 / -1; }
      .asc__more { margin-top: var(--au-s3); }
      .asc__more summary { cursor: pointer; font-size: var(--au-fs-body-sm); color: var(--au-muted); }
    `,
  ],
  template: `
    <section class="au-panel au-panel--padded au-mb-3" aria-labelledby="asc-title">
      <h2 class="au-panel__title" id="asc-title">Articles</h2>
      <p class="au-panel__subtitle au-mb-3">{{ summary }}</p>
      @if (!settings) {
        <p class="au-muted au-mb-0">{{ message || 'Loading…' }}</p>
      } @else {
        <fieldset class="asc__days">
          <legend>Publishing days</legend>
          @for (day of weekdays; track day.value) {
            <button type="button" class="asc__day" [attr.aria-pressed]="settings.weekdays.includes(day.value)" [attr.aria-label]="day.long" (click)="toggleDay(day.value)">{{ day.short }}</button>
          }
        </fieldset>

        <fieldset class="asc__sections">
          <legend>Guide sections</legend>
          @for (section of sectionOptions; track section.key) {
            <label class="au-checkbox"><input type="checkbox" [checked]="isOn(section.key)" (change)="toggleSection(section.key)" /> {{ section.label }}</label>
          }
        </fieldset>

        <details class="asc__more">
          <summary>More: articles per day and publish time</summary>
          <div class="au-field-grid au-mt-2">
            <label class="au-field">
              <span class="au-field__label">Articles per day</span>
              <input class="au-input" type="number" min="1" max="8" name="apd" [(ngModel)]="settings.articlesPerDay" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Publish times</span>
              <input class="au-input" name="times" [(ngModel)]="times" placeholder="09:00" aria-describedby="asc-times" />
              <span class="au-field__hint" id="asc-times">24 h, comma-separated. Empty: 09:00.</span>
            </label>
          </div>
        </details>

        <div class="au-form__actions au-mb-0">
          <button class="au-btn au-btn--primary" type="button" [disabled]="saving || !settings.weekdays.length" (click)="save()">{{ saving ? 'Saving…' : 'Save articles' }}</button>
          <span role="status" aria-live="polite" class="au-muted">{{ settings.weekdays.length ? message : 'Pick at least one day.' }}</span>
        </div>
      }
    </section>
  `,
})
export class ArticleSettingsCardComponent implements OnInit {
  private readonly api = inject(PlanningApiService);
  private readonly toast = inject(ToastService);
  @Input({ required: true }) siteId!: string;
  readonly weekdays = WEEKDAYS;
  readonly sectionOptions: Array<{ key: ArticleSectionKey; label: string }> = [
    { key: 'summary', label: '"In short" summary box' },
    { key: 'toc', label: 'Table of contents' },
    { key: 'faq', label: 'FAQ' },
    { key: 'sources', label: 'Sources' },
    { key: 'furtherReading', label: 'Further reading' },
    { key: 'cta', label: 'Call-to-action card' },
    { key: 'jsonLd', label: 'Structured data (JSON-LD)' },
  ];
  settings: SitePlanningSettings | null = null;
  times = '';
  saving = false;
  message = '';

  get summary(): string {
    if (!this.settings) return 'How often articles go out and which blocks a guide has.';
    const days = this.settings.weekdays.length === 7 ? 'every day' : `${this.settings.weekdays.length} day${this.settings.weekdays.length === 1 ? '' : 's'} a week`;
    return `${this.settings.articlesPerDay} article${this.settings.articlesPerDay === 1 ? '' : 's'} a day, ${days}.`;
  }

  ngOnInit(): void {
    this.api.getPlanningSettings(this.siteId).subscribe({
      next: (settings) => {
        this.settings = { ...settings, weekdays: [...settings.weekdays], articleTargets: { ...(settings.articleTargets ?? {}), sections: { ...(settings.articleTargets?.sections ?? {}) } } };
        this.times = settings.publishTimes.join(', ');
      },
      error: (err) => (this.message = apiMessage(err, 'Article settings could not be loaded.')),
    });
  }

  toggleDay(day: number): void {
    const days = this.settings!.weekdays;
    this.settings!.weekdays = days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day].sort();
  }

  /** Every section is on unless the site switched it off. */
  isOn(key: ArticleSectionKey): boolean {
    return this.settings?.articleTargets?.sections?.[key] !== false;
  }

  toggleSection(key: ArticleSectionKey): void {
    const sections = (this.settings!.articleTargets!.sections ??= {});
    sections[key] = !this.isOn(key);
  }

  save(): void {
    const settings = this.settings!;
    this.saving = true;
    this.message = '';
    this.api
      .putPlanningSettings(this.siteId, {
        articlesPerDay: Number(settings.articlesPerDay),
        weekdays: settings.weekdays,
        publishTimes: this.times.split(',').map((time) => time.trim()).filter(Boolean),
        articleTargets: settings.articleTargets,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.toast.success('Article settings saved.');
        },
        error: (err) => {
          this.saving = false;
          this.message = apiMessage(err, 'Article settings could not be saved.');
        },
      });
  }
}
