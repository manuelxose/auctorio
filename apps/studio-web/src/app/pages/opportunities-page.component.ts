import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { exhaustMap, filter, switchMap, take, timeout, timer, type Subscription } from 'rxjs';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { OPPORTUNITY_SECTIONS } from '../layout/studio-nav';
import { AppContextService } from '../services/app-context.service';
import { EngagementApiService, type Opportunity, type OpportunityPlatform, type OpportunityState } from '../services/engagement-api.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';

const SEARCH_ERRORS: Record<string, string> = {
  web_intelligence_provider_not_configured: 'Configura un proveedor en Ajustes → Web discovery.',
  engagement_keywords_required: 'Añade una palabra clave para buscar.',
  daily_search_limit_reached: 'Has alcanzado el límite diario de búsquedas.',
  engagement_search_running: 'Ya hay una búsqueda en curso.',
  engagement_reddit_unavailable: 'Reddit no está disponible. Puedes configurar un proveedor en Ajustes de búsqueda web.',
  invalid_engagement_settings: 'Revisa las palabras clave, los subreddits y la longitud del tono.',
  engagement_text_provider_not_configured: 'Configura un proveedor de texto para generar borradores.',
  engagement_draft_changed: 'El borrador se modificó mientras se generaba. Actualiza la página.',
};

@Component({
  selector: 'app-opportunities-page',
  standalone: true,
  imports: [AppIconComponent, DatePipe, FormsModule, RouterLink],
  template: `
    <header class="au-page__header opp-header">
      <div>
        <h1 class="au-page__title">Oportunidades en {{ channel() }}</h1>
        <p class="au-page__subtitle">{{ platform() === 'reddit' ? 'Encuentra hilos relevantes y prepara una respuesta.' : 'Encuentra preguntas relevantes y prepara una respuesta.' }}</p>
      </div>
      <button class="au-btn au-btn--primary" type="button" (click)="search()" [disabled]="loading() || searching() || !searchConfigured() || !savedKeywords()">
        <app-icon name="search"></app-icon> {{ searching() ? 'Buscando…' : 'Buscar ahora' }}
      </button>
    </header>

    <nav class="opp-tabs" aria-label="Canales de oportunidades">
      @for (item of channels; track item.id) {
        <a routerLink="/studio/opportunities" [queryParams]="{ tab: item.id }" [attr.aria-current]="platform() === item.id ? 'page' : null">{{ item.label }}</a>
      }
    </nav>

    @if (!loading() && !loadError()) {
      @if (!searchConfigured()) {
        <p class="opp-notice" role="status">Para buscar, configura un proveedor en <a routerLink="/studio/settings/discovery">Ajustes de búsqueda web</a>.</p>
      }
      <details class="au-panel opp-settings" [open]="!savedKeywords()">
        <summary>Configurar búsqueda</summary>
        <form class="opp-form" (ngSubmit)="saveSettings()">
          <label class="au-field">
            <span>Palabras clave</span>
            <small>Una por línea.</small>
            <textarea class="au-input" name="keywords" rows="4" [(ngModel)]="keywords"></textarea>
          </label>
          @if (suggestedKeywords().length) {
            <div class="opp-tabs" role="group" aria-label="Palabras clave sugeridas">
              @for (suggestion of suggestedKeywords(); track suggestion) {
                <button type="button" (click)="addKeyword(suggestion)" [disabled]="hasKeyword(suggestion)">+ {{ suggestion }}</button>
              }
            </div>
          }
          @if (platform() === 'reddit') {
            <label class="au-field">
              <span>Subreddits (opcional)</span>
              <small>Hasta diez, uno por línea. Por ejemplo, r/television.</small>
              <textarea class="au-input" name="subreddits" rows="2" [(ngModel)]="subreddits"></textarea>
            </label>
          }
          <label class="au-field">
            <span>Tono de respuesta (opcional)</span>
            <input class="au-input" name="replyStyle" maxlength="1000" [(ngModel)]="replyStyle" />
          </label>
          <button class="au-btn au-btn--secondary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar configuración' }}</button>
        </form>
      </details>
    }

    <section aria-label="Bandeja de oportunidades" [attr.aria-busy]="loading() || searching()">
      <div class="opp-tabs opp-inbox-tabs" role="group" aria-label="Estado de la respuesta">
        <button type="button" [attr.aria-pressed]="state() === 'to_reply'" (click)="state.set('to_reply')">Por responder <span>{{ pendingCount() }}</span></button>
        <button type="button" [attr.aria-pressed]="state() === 'replied'" (click)="state.set('replied')">Respondidas <span>{{ repliedCount() }}</span></button>
      </div>
      @if (loadError()) {
        <div class="au-panel opp-empty"><p>No se pudo cargar la bandeja.</p><button class="au-btn au-btn--secondary" type="button" (click)="load()">Reintentar</button></div>
      } @else if (loading()) {
        <div class="au-panel opp-empty" role="status">Cargando oportunidades…</div>
      } @else {
        @for (item of visibleItems(); track item.id) {
          <article class="au-panel opp-card">
            <div class="opp-meta">
              @if (item.community) { <span>r/{{ item.community }}</span> }
              @if (item.votes !== null) { <span>{{ item.votes }} votos</span> }
              <span class="au-badge">{{ item.keyword }}</span>
              @if (item.publishedAt) { <time [attr.datetime]="item.publishedAt">{{ item.publishedAt | date:'d MMM yyyy' }}</time> }
            </div>
            <h2><a [href]="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a></h2>
            @if (item.snippet) { <p class="opp-snippet">{{ item.snippet }}</p> }
            @if (item.draft !== null) {
              @if (item.status === 'to_reply' && platform() === 'reddit') {
                <p class="opp-notice">Consulta las reglas del subreddit antes de responder. Algunas comunidades prohíben la autopromoción.</p>
              }
              <label class="au-field opp-draft">
                <span>Borrador de respuesta</span>
                <textarea class="au-input" rows="4" maxlength="6000" [(ngModel)]="item.draft" [readOnly]="item.status === 'replied'"></textarea>
              </label>
            }
            <div class="opp-actions">
              @if (item.status === 'to_reply') {
                @if (item.draft === null) {
                  <button class="au-btn au-btn--primary" type="button" [disabled]="!!busyId()" (click)="draft(item)">{{ busyId() === item.id ? 'Preparando…' : 'Redactar respuesta' }}</button>
                } @else {
                  <button class="au-btn au-btn--primary" type="button" (click)="copyDraft(item)" [disabled]="!item.draft.trim()">Copiar borrador</button>
                  <button class="au-btn au-btn--secondary" type="button" [disabled]="!!busyId()" (click)="update(item)">Guardar borrador</button>
                }
                <button class="au-btn au-btn--secondary" type="button" [disabled]="!!busyId()" (click)="update(item, 'replied')">Marcar como respondida</button>
                <button class="au-btn au-btn--ghost" type="button" [disabled]="!!busyId()" (click)="update(item, 'dismissed')">Descartar</button>
              } @else {
                <button class="au-btn au-btn--ghost" type="button" [disabled]="!!busyId()" (click)="update(item, 'to_reply')">Volver a pendientes</button>
              }
            </div>
          </article>
        } @empty {
          <div class="au-panel opp-empty">
            <app-icon name="message"></app-icon>
            <h2>{{ state() === 'to_reply' ? 'No hay oportunidades por responder' : 'Todavía no hay respuestas registradas' }}</h2>
            @if (state() === 'to_reply' && searchConfigured()) {
              <p>{{ savedKeywords() ? 'Busca hilos o preguntas con las palabras clave del sitio.' : 'Añade palabras clave en Configurar búsqueda.' }}</p>
            }
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .opp-header, .opp-actions, .opp-meta, .opp-tabs { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
    .opp-header { justify-content: space-between; align-items: start; }
    .opp-tabs { border-bottom: 1px solid var(--au-border); margin-bottom: 16px; }
    .opp-tabs a, .opp-tabs button { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font: inherit; font-weight: 600; color: var(--au-text-2); background: transparent; border: 0; border-bottom: 2px solid transparent; padding: 8px; text-decoration: none; cursor: pointer; }
    .opp-tabs [aria-current="page"], .opp-tabs [aria-pressed="true"] { color: var(--au-text); border-bottom-color: currentColor; }
    .opp-tabs span, .opp-meta { color: var(--au-muted); font-size: 13px; }
    .opp-header .au-btn, .opp-form .au-btn, .opp-actions .au-btn { min-height: 44px; }
    .opp-notice { margin-block: 12px; }
    .opp-settings, .opp-card { padding: 16px; margin-block: 12px; }
    .opp-settings summary { min-height: 44px; display: list-item; align-content: center; cursor: pointer; font-weight: 600; }
    .opp-form, .opp-card { display: grid; gap: 12px; }
    .opp-form { max-width: 640px; justify-items: stretch; }
    .opp-form > button { justify-self: start; }
    .opp-card h2 { margin: 0; font-size: 17px; overflow-wrap: anywhere; }
    .opp-card h2 a { color: inherit; text-underline-offset: 3px; }
    .opp-snippet { margin: 0; max-width: 78ch; overflow-wrap: anywhere; }
    .opp-draft { margin: 0; }
    .opp-form small { color: var(--au-muted); }
    .opp-empty { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 32px 16px; }
    .opp-empty h2 { font-size: 17px; }
    .opp-empty h2, .opp-empty p { margin: 0; }
  `],
})
export class OpportunitiesPageComponent {
  private readonly api = inject(EngagementApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly studioApi = inject(StudioApiService);
  private readonly destroy = inject(DestroyRef);
  private request?: Subscription;

  readonly channels = OPPORTUNITY_SECTIONS;
  readonly platform = signal<OpportunityPlatform>('reddit');
  readonly channel = computed(() => this.channels.find(({ id }) => id === this.platform())!.label);
  readonly state = signal<'to_reply' | 'replied'>('to_reply');
  readonly items = signal<Opportunity[]>([]);
  readonly visibleItems = computed(() => this.items().filter((item) => item.status === this.state()));
  readonly pendingCount = computed(() => this.items().filter((item) => item.status === 'to_reply').length);
  readonly repliedCount = computed(() => this.items().filter((item) => item.status === 'replied').length);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly searchConfigured = signal(false);
  readonly savedKeywords = signal(false);
  readonly suggestedKeywords = signal<string[]>([]);
  readonly saving = signal(false);
  readonly searching = signal(false);
  readonly busyId = signal<string | null>(null);
  keywords = '';
  subreddits = '';
  replyStyle = '';

  constructor() {
    const params = toSignal(this.route.queryParamMap);
    effect(() => {
      this.platform.set(params()?.get('tab') === 'quora' ? 'quora' : 'reddit');
      this.state.set('to_reply');
      this.items.set([]);
      this.load();
    });
  }

  load(): void {
    const siteId = this.context.activeSite()?.id;
    this.request?.unsubscribe();
    this.loadError.set(false);
    this.loading.set(Boolean(siteId));
    if (!siteId) {
      this.searchConfigured.set(false);
      this.savedKeywords.set(false);
      return;
    }
    this.request = this.api.list(siteId, this.platform()).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: ({ items, settings, searchConfigured }) => {
        this.items.set(items);
        this.keywords = settings.keywords.join('\n');
        this.subreddits = settings.subreddits.join('\n');
        this.replyStyle = settings.replyStyle;
        this.savedKeywords.set(settings.keywords.length > 0);
        this.suggestedKeywords.set(settings.suggestedKeywords ?? []);
        this.searchConfigured.set(searchConfigured);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  addKeyword(suggestion: string): void {
    this.keywords = [this.keywords.trim(), suggestion].filter(Boolean).join('\n');
  }

  hasKeyword(suggestion: string): boolean {
    return this.keywords.split(/\r?\n/).some((word) => word.trim().toLowerCase() === suggestion.toLowerCase());
  }

  saveSettings(): void {
    const siteId = this.context.activeSite()?.id;
    if (!siteId) return;
    const platform = this.platform();
    const lines = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    this.saving.set(true);
    this.api.saveSettings(siteId, platform, { keywords: lines(this.keywords), subreddits: lines(this.subreddits), replyStyle: this.replyStyle })
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: (settings) => {
          this.saving.set(false);
          if (this.platform() === platform && this.context.activeSite()?.id === siteId) this.savedKeywords.set(settings.keywords.length > 0);
          this.toast.success('Configuración guardada.');
        },
        error: (error) => { this.saving.set(false); this.showError(error, 'No se pudo guardar la configuración.'); },
      });
  }

  search(): void {
    const siteId = this.context.activeSite()?.id;
    if (!siteId) return;
    const platform = this.platform();
    this.searching.set(true);
    this.api.search(siteId, platform).pipe(
      switchMap(({ operationId }) => timer(0, 1500).pipe(
        exhaustMap(() => this.studioApi.getOperation(operationId)),
        filter(({ status }) => !['queued', 'running', 'retrying'].includes(status)),
        take(1),
        timeout(25 * 60_000 + 5000),
      )),
      takeUntilDestroyed(this.destroy),
    ).subscribe({
      next: ({ status, errorSummary }) => {
        this.searching.set(false);
        if (status !== 'succeeded') {
          this.toast.error(SEARCH_ERRORS[errorSummary ?? ''] ?? 'No se pudo completar la búsqueda.');
          return;
        }
        this.toast.success('Búsqueda completada.');
        if (this.platform() === platform && this.context.activeSite()?.id === siteId) this.load();
      },
      error: (error) => { this.searching.set(false); this.showError(error, 'No se pudo completar la búsqueda.'); },
    });
  }

  draft(item: Opportunity): void {
    const siteId = this.context.activeSite()?.id;
    if (!siteId) return;
    this.busyId.set(item.id);
    this.api.draft(siteId, this.platform(), item.id).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: ({ draft }) => { item.draft = draft; this.busyId.set(null); },
      error: (error) => { this.busyId.set(null); this.showError(error, 'No se pudo redactar la respuesta.'); },
    });
  }

  update(item: Opportunity, status?: OpportunityState): void {
    const siteId = this.context.activeSite()?.id;
    if (!siteId) return;
    this.busyId.set(item.id);
    this.api.update(siteId, this.platform(), item.id, { status, draft: item.draft ?? undefined }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.busyId.set(null);
        if (status) this.items.update((items) => items.map((entry) => entry.id === item.id ? { ...entry, status } : entry));
        else this.toast.success('Borrador guardado.');
      },
      error: (error) => { this.busyId.set(null); this.showError(error, 'No se pudo actualizar la oportunidad.'); },
    });
  }

  async copyDraft(item: Opportunity): Promise<void> {
    if (!item.draft) return;
    try {
      await navigator.clipboard.writeText(item.draft);
      this.toast.success('Borrador copiado.');
    } catch {
      this.toast.error('Selecciona el texto del borrador y cópialo.');
    }
  }

  private showError(error: { error?: { message?: string } }, fallback: string): void {
    this.toast.error(SEARCH_ERRORS[error?.error?.message ?? ''] ?? fallback);
  }
}
