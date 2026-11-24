import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PlanningApiService, apiMessage } from '../../services/planning-api.service';
import { ToastService } from '../../services/toast.service';
import type { SitePlanningSettings } from '../../models/planning.models';
import { WEEKDAYS } from './planning-utils';

/** Settings · Articles (M5): publishing days as chips, sections link to Settings › Writing. Count and time stay under "More". */
@Component({
  selector: 'app-article-settings-card',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styles: [
    `
      .asc__days { display: flex; flex-wrap: wrap; gap: var(--au-s2); border: 0; padding: 0; margin: 0 0 var(--au-s3); }
      .asc__days legend { font-size: var(--au-fs-body-sm); font-weight: 600; margin-bottom: var(--au-s2); }
      .asc__day { min-width: 52px; min-height: 40px; border: 1px solid var(--au-border); border-radius: 999px; background: var(--au-surface); color: var(--au-text); font: inherit; cursor: pointer; }
      .asc__day[aria-pressed='true'] { background: var(--au-text); color: var(--au-surface-solid, #fff); border-color: var(--au-text); }
      .asc__day:focus-visible { outline: 2px solid var(--au-brand); outline-offset: 2px; }
      @media (pointer: coarse) { .asc__day { min-height: 44px; } }
      .asc__more { margin-top: var(--au-s3); }
      .asc__more summary { cursor: pointer; font-size: var(--au-fs-body-sm); color: var(--au-muted); }
    `,
  ],
  template: `
    <section class="au-panel au-panel--padded au-mb-3" aria-labelledby="asc-title">
      <h2 class="au-panel__title" id="asc-title">Artículos</h2>
      <p class="au-panel__subtitle au-mb-3">{{ summary }}</p>
      @if (!settings) {
        <p class="au-muted au-mb-0">{{ message || 'Cargando…' }}</p>
      } @else {
        <fieldset class="asc__days">
          <legend>Días de publicación</legend>
          @for (day of weekdays; track day.value) {
            <button type="button" class="asc__day" [attr.aria-pressed]="settings.weekdays.includes(day.value)" [attr.aria-label]="day.long" (click)="toggleDay(day.value)">{{ day.short }}</button>
          }
        </fieldset>

        <p class="au-hint au-mb-0">Las secciones, la extensión y las reglas de redacción están en <a class="au-link" routerLink="/studio/settings/writing">Configuración › Escritura</a>.</p>

        <details class="asc__more">
          <summary>Más: artículos por día y hora de publicación</summary>
          <div class="au-field-grid au-mt-2">
            <label class="au-field">
              <span class="au-field__label">Artículos por día</span>
              <input class="au-input" type="number" min="1" max="8" name="apd" [(ngModel)]="settings.articlesPerDay" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Horas de publicación</span>
              <input class="au-input" name="times" [(ngModel)]="times" placeholder="09:00" aria-describedby="asc-times" />
              <span class="au-field__hint" id="asc-times">Formato 24 h, separadas por comas. Vacío: 09:00.</span>
            </label>
          </div>
        </details>

        <div class="au-form__actions au-mb-0">
          <button class="au-btn au-btn--primary" type="button" [disabled]="saving || !settings.weekdays.length" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar artículos' }}</button>
          <span role="status" aria-live="polite" class="au-muted">{{ settings.weekdays.length ? message : 'Elige al menos un día.' }}</span>
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
  settings: SitePlanningSettings | null = null;
  times = '';
  saving = false;
  message = '';

  get summary(): string {
    if (!this.settings) return 'Con qué frecuencia salen los artículos y qué bloques tiene una guía.';
    const days = this.settings.weekdays.length === 7 ? 'todos los días' : `${this.settings.weekdays.length} ${this.settings.weekdays.length === 1 ? 'día' : 'días'} a la semana`;
    return `${this.settings.articlesPerDay} ${this.settings.articlesPerDay === 1 ? 'artículo' : 'artículos'} al día, ${days}.`;
  }

  ngOnInit(): void {
    this.api.getPlanningSettings(this.siteId).subscribe({
      next: (settings) => {
        this.settings = { ...settings, weekdays: [...settings.weekdays], articleTargets: { ...(settings.articleTargets ?? {}), sections: { ...(settings.articleTargets?.sections ?? {}) } } };
        this.times = settings.publishTimes.join(', ');
      },
      error: (err) => (this.message = apiMessage(err, 'No se pudo cargar la configuración de artículos.')),
    });
  }

  toggleDay(day: number): void {
    const days = this.settings!.weekdays;
    this.settings!.weekdays = days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day].sort();
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
          this.toast.success('Configuración de artículos guardada.');
        },
        error: (err) => {
          this.saving = false;
          this.message = apiMessage(err, 'No se pudo guardar la configuración de artículos.');
        },
      });
  }
}
