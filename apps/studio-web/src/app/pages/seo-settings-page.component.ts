import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SearchConsoleCardComponent } from '../components/seo/search-console-card.component';
import { SeoAllowanceComponent } from '../components/seo/seo-allowance.component';
import { SEO_LOCALE, PROFILE_SOURCES, RESEARCH_INTENSITIES, RESEARCH_MODES, SEO_BUSINESS, SEO_FACTORS, seoError } from '../components/seo-labels';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { sectionFor } from '../layout/studio-nav';
import { AppContextService } from '../services/app-context.service';
import { ProfileField, ResearchOverview, SeoIntelligenceApiService, SeoProfileView } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';

type ListKey = 'topics' | 'excludedTopics' | 'offerings' | 'revenueObjectives' | 'markets' | 'regions' | 'languages';
const LISTS: Array<{ key: ListKey; label: string; hint: string }> = [
  { key: 'revenueObjectives', label: 'Objetivos del negocio', hint: 'Qué quieres conseguir: ventas, contactos, suscripciones…' },
  { key: 'offerings', label: 'Productos o servicios', hint: '' },
  { key: 'markets', label: 'Mercados', hint: 'Idioma y país, por ejemplo es-ES, es-MX. El primero es el principal.' },
  { key: 'languages', label: 'Idiomas', hint: 'Códigos de dos letras, por ejemplo es, en.' },
  { key: 'regions', label: 'Zonas', hint: '' },
  { key: 'topics', label: 'Temas relevantes', hint: '' },
  { key: 'excludedTopics', label: 'Temas excluidos', hint: 'No se investigan ni se proponen.' },
];

/** Configuración → SEO del sitio: what the workspace decides. Amounts and providers are the platform's. */
@Component({
  selector: 'app-seo-settings-page',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, SearchConsoleCardComponent, SeoAllowanceComponent],
  styles: [`
    .stack { display: grid; gap: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .note { color: var(--au-muted); font-size: var(--au-fs-metadata); }
    fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  `],
  template: `
    <section class="au-page advanced-page">
      <header class="au-page__header"><div>
        <p class="au-page__eyebrow">Auctorio / Configuración</p>
        <h1 class="au-page__title">SEO del sitio</h1>
        <p class="au-page__subtitle">Qué persigue tu sitio y cuánto debe investigar Auctorio por él.</p>
      </div></header>
      @if (failed(); as reason) { <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div> }

      @if (research(); as r) {
        @if (tab() === 'business') {
          <section class="au-panel au-panel--padded" aria-labelledby="ss-business">
            <div class="advanced-card-header"><h2 class="au-panel__title" id="ss-business">Negocio y temas</h2><p>{{ r.profile.reviewedAt ? 'Revisado el ' + (r.profile.reviewedAt | date: 'd/MM/y') : 'Sin revisar: lo detectado puede no ser exacto.' }} Un campo vacío vuelve a lo detectado.</p></div>
            <form (ngSubmit)="saveBusiness()"><fieldset [disabled]="!canEditProfile() || !!busy()">
              <div class="au-field-grid">
                <label class="au-field au-field--wide"><span class="au-field__label">Modelo de negocio</span><input class="au-input" name="businessModel" maxlength="300" [placeholder]="shown(r.profile.businessModel)" [(ngModel)]="business.businessModel" /><span class="note">{{ origin(r.profile.businessModel) }}</span></label>
                <label class="au-field au-field--wide"><span class="au-field__label">Público</span><input class="au-input" name="audience" maxlength="300" [placeholder]="shown(r.profile.audience)" [(ngModel)]="business.audience" /><span class="note">{{ origin(r.profile.audience) }}</span></label>
                @for (list of lists; track list.key) {
                  <label class="au-field au-field--wide"><span class="au-field__label">{{ list.label }} (separados por comas)</span><input class="au-input" [name]="list.key" [placeholder]="shown(r.profile[list.key])" [(ngModel)]="business.lists[list.key]" /><span class="note">{{ list.hint }} {{ origin(r.profile[list.key]) }}</span></label>
                }
              </div>
              <div class="actions"><button class="au-btn au-btn--primary au-btn--sm" type="submit">{{ busy() === 'business' ? 'Guardando…' : 'Guardar' }}</button>
                @if (!r.profile.reviewedAt) { <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="review()">Está bien así</button> }</div>
            </fieldset></form>
            @if (!canEditProfile()) { <p class="note">Tu rol puede ver estos ajustes, pero no cambiarlos.</p> }
          </section>
          <section class="au-panel au-panel--padded advanced-followup" aria-labelledby="ss-competitors">
            <div class="advanced-card-header"><h2 class="au-panel__title" id="ss-competitors">Competidores</h2><p>Aceptar, rechazar y corregir competidores se hace en su propia página: de ahí salen los que se investigan.</p></div>
            <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/competitors">Gestionar competidores</a>
          </section>
        }

        @if (tab() === 'research') {
          <div class="stack">
            <app-seo-allowance [allowance]="r.allowance"></app-seo-allowance>
            <section class="au-panel au-panel--padded" aria-labelledby="ss-research">
              <div class="advanced-card-header"><h2 class="au-panel__title" id="ss-research">Investigación</h2><p>La intensidad reparte la asignación de tu suscripción; no la aumenta.</p></div>
              <form (ngSubmit)="savePolicy()"><fieldset [disabled]="!canEditPolicy() || !!busy()">
                <div class="au-field-grid">
                  <label class="au-field"><span class="au-field__label">Automatización</span><select class="au-select" name="mode" [(ngModel)]="policy.mode">@for (mode of modes; track mode[0]) { <option [value]="mode[0]">{{ mode[1] }}</option> }</select></label>
                  <label class="au-field"><span class="au-field__label">Intensidad</span><select class="au-select" name="intensity" [(ngModel)]="policy.intensity">@if (!r.intensity) { <option value="">Ajustada por la plataforma</option> }@for (item of intensities; track item[0]) { <option [value]="item[0]">{{ item[1] }}</option> }</select></label>
                  <label class="au-field"><span class="au-field__label">Días que debe cubrir la reserva</span><input class="au-input" name="targetDays" type="number" min="14" max="120" step="1" required [(ngModel)]="policy.targetDays" /></label>
                  <label class="au-field"><span class="au-field__label">Calidad mínima (20–90)</span><input class="au-input" name="minScore" type="number" min="20" max="90" step="1" required [(ngModel)]="policy.minScore" /></label>
                </div>
                <div class="actions"><button class="au-btn au-btn--primary au-btn--sm" type="submit">{{ busy() === 'policy' ? 'Guardando…' : 'Guardar' }}</button></div>
              </fieldset></form>
              @if (!canEditPolicy()) { <p class="note">Solo quien administra el workspace puede cambiarlo.</p> }
            </section>
          </div>
        }

        @if (tab() === 'data') { <app-search-console-card></app-search-console-card> }

        @if (tab() === 'optimization' && profile(); as p) {
          <section class="au-panel au-panel--padded" aria-labelledby="ss-optimization">
            <div class="advanced-card-header"><h2 class="au-panel__title" id="ss-optimization">Qué valora este sitio</h2><p>{{ p.chosen ? 'Elegido por tu equipo.' : 'Deducido del tipo de sitio: confírmalo o cámbialo.' }} Decide el orden de las oportunidades.</p></div>
            <form (ngSubmit)="saveOptimization()"><fieldset [disabled]="!canEditPolicy() || !!busy()">
              <div class="au-field-grid">
                <label class="au-field"><span class="au-field__label">Tipo de negocio</span><select class="au-select" name="profile" [(ngModel)]="form.profile">@for (key of p.profiles; track key) { <option [value]="key">{{ kinds[key] ?? key }}</option> }</select></label>
                <label class="au-field"><span class="au-field__label">Páginas de control sin tocar (%)</span><input class="au-input" name="holdout" type="number" min="0" max="30" step="1" [(ngModel)]="form.holdout" /><span class="note">Sirven para comparar el efecto de las mejoras.</span></label>
                <label class="au-field au-field--wide"><span class="au-field__label">Temas prioritarios (separados por comas)</span><input class="au-input" name="topics" [(ngModel)]="form.topics" /></label>
                @if (form.profile === 'custom') { @for (key of factorKeys; track key) { <label class="au-field"><span class="au-field__label">{{ factors[key] }} (peso 0–3)</span><input class="au-input" [name]="key" type="number" min="0" max="3" step="0.1" [(ngModel)]="form.weights[key]" /></label> } }
              </div>
              <div class="actions"><button class="au-btn au-btn--primary au-btn--sm" type="submit">{{ busy() === 'optimization' ? 'Guardando…' : 'Guardar' }}</button></div>
            </fieldset></form>
            @if (!canEditPolicy()) { <p class="note">Solo quien administra el workspace puede cambiarlo.</p> }
          </section>
        }
      } @else if (!failed()) { <div class="au-skeleton-list" aria-label="Cargando ajustes SEO">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 52px"></div> }</div> }
    </section>
  `,
})
export class SeoSettingsPageComponent {
  private readonly api = inject(SeoIntelligenceApiService);
  private readonly app = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  readonly lists = LISTS;
  readonly modes = Object.entries(RESEARCH_MODES);
  readonly intensities = Object.entries(RESEARCH_INTENSITIES);
  readonly kinds = SEO_BUSINESS;
  readonly factors = SEO_FACTORS;
  readonly factorKeys = Object.keys(SEO_FACTORS);
  readonly tab = computed(() => sectionFor('/studio/settings/seo', this.query()?.get('tab')));
  readonly research = signal<ResearchOverview | null>(null);
  readonly profile = signal<SeoProfileView | null>(null);
  readonly busy = signal('');
  readonly failed = signal('');
  readonly canEditProfile = computed(() => this.app.can('projects.manage'));
  readonly canEditPolicy = computed(() => this.app.can('workspace.manage'));
  business: { businessModel: string; audience: string; lists: Record<string, string> } = { businessModel: '', audience: '', lists: {} };
  policy = { mode: 'automatic', intensity: 'balanced', targetDays: 75, minScore: 40 };
  form: { profile: string; topics: string; holdout: number; weights: Record<string, number> } = { profile: 'publisher', topics: '', holdout: 0, weights: {} };

  constructor() {
    effect(() => {
      if (this.app.activeSite()?.id) void this.load();
    });
  }

  shown(field: ProfileField<string | string[]>): string {
    return Array.isArray(field.value) ? field.value.join(', ') : (SEO_BUSINESS[field.value ?? ''] ?? field.value ?? '');
  }
  origin(field: ProfileField<unknown>): string {
    return field.value === null ? 'Sin definir.' : `En uso: ${(PROFILE_SOURCES[field.source] ?? field.source).toLowerCase()}.`;
  }

  async load(): Promise<void> {
    const siteId = this.app.activeSite()?.id;
    if (!siteId) return;
    try {
      const [research, profile] = await Promise.all([firstValueFrom(this.api.research(siteId)), firstValueFrom(this.api.profile(siteId))]);
      if (siteId !== this.app.activeSite()?.id) return;
      const { corrections, policy } = research.profile;
      this.business = { businessModel: (corrections['businessModel'] as string) ?? '', audience: (corrections['audience'] as string) ?? '', lists: Object.fromEntries(LISTS.map(({ key }) => [key, ((corrections[key] as string[] | undefined) ?? []).join(', ')])) };
      this.policy = { mode: policy.mode, intensity: research.intensity ?? '', targetDays: policy.targetDays, minScore: policy.minScore };
      this.form = { profile: profile.profile, topics: profile.priorityTopics.join(', '), holdout: profile.holdoutPercent, weights: { ...profile.weights } };
      this.research.set(research);
      this.profile.set(profile);
      this.failed.set('');
    } catch (error) {
      this.failed.set(seoError(error, 'No se han podido cargar los ajustes SEO.'));
    }
  }

  private async work(name: string, run: (siteId: string) => Promise<void>): Promise<void> {
    const siteId = this.app.activeSite()?.id;
    if (this.busy() || !siteId) return;
    this.busy.set(name);
    try {
      await run(siteId);
      this.toast.success('Guardado.');
      await this.load();
    } catch (error) {
      // What was typed stays: nothing was saved.
      this.toast.error(seoError(error));
    } finally {
      this.busy.set('');
    }
  }

  private split(text: string): string[] {
    return text.split(',').map((item) => item.trim()).filter(Boolean);
  }

  saveBusiness(): Promise<void> {
    return this.work('business', async (siteId) => {
      // An emptied field goes back to what was detected.
      const corrections: Record<string, unknown> = { businessModel: this.business.businessModel.trim() || null, audience: this.business.audience.trim() || null };
      for (const { key } of LISTS) {
        const values = this.split(this.business.lists[key] ?? '');
        corrections[key] = values.length ? values : null;
      }
      await firstValueFrom(this.api.saveResearchProfile(siteId, { corrections, reviewed: true }));
    });
  }
  review(): Promise<void> {
    return this.work('business', async (siteId) => void (await firstValueFrom(this.api.saveResearchProfile(siteId, { reviewed: true }))));
  }
  savePolicy(): Promise<void> {
    return this.work('policy', async (siteId) => {
      const { mode, intensity, targetDays, minScore } = this.policy;
      await firstValueFrom(this.api.saveResearchPolicy(siteId, { mode, targetDays: Number(targetDays), minScore: Number(minScore), ...(intensity ? { intensity } : {}) }));
    });
  }
  saveOptimization(): Promise<void> {
    return this.work('optimization', async (siteId) => {
      const { profile, topics, holdout, weights } = this.form;
      // Only a custom profile carries its own weights; the others follow the product's.
      await firstValueFrom(this.api.saveProfile(siteId, { profile, priorityTopics: this.split(topics), holdoutPercent: Number(holdout) || 0, weights: profile === 'custom' ? Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Number(value)])) : {} }));
      if (this.canEditProfile()) await firstValueFrom(this.api.analyze(siteId));
    });
  }
}
