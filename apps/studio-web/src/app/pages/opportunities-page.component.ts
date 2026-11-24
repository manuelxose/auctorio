import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { exhaustMap, filter, forkJoin, switchMap, take, timeout, timer, type Subscription } from 'rxjs';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { OPPORTUNITY_SECTIONS } from '../layout/studio-nav';
import { AppContextService } from '../services/app-context.service';
import { EngagementApiService, type Opportunity, type OpportunityPlatform, type OpportunitySettings, type OpportunityState, type ReplyTone } from '../services/engagement-api.service';
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
  imports: [AppIconComponent, DatePipe, FormsModule, NgTemplateOutlet, RouterLink],
  templateUrl: './opportunities-page.component.html',
  styleUrls: ['./opportunities-page.component.css', './opportunities-config.css', './opportunities-detail.css'],
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
  readonly replyTones = [
    { id: 'helpful', label: 'Útil' }, { id: 'casual', label: 'Cercano' }, { id: 'expert', label: 'Experto' },
  ] as const;
  replyTone: ReplyTone = 'helpful';
  replyLanguage: '' | 'es' | 'en' = '';
  private settings?: OpportunitySettings;
  readonly platform = signal<OpportunityPlatform>('reddit');
  readonly channel = computed(() => this.channels.find(({ id }) => id === this.platform())!.label);
  readonly state = signal<'all' | OpportunityState>('to_reply');
  readonly items = signal<Opportunity[]>([]);
  readonly query = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly visibleItems = computed(() => {
    const state = this.state();
    const query = this.query().trim().toLocaleLowerCase();
    return this.items().filter((item) =>
      (state === 'all' || item.status === state) &&
      (!query || [item.title, item.snippet, item.community, item.keyword].some((value) => value?.toLocaleLowerCase().includes(query))),
    );
  });
  readonly selected = computed<Opportunity | undefined>(() => this.visibleItems().find(({ id }) => id === this.selectedId()) ?? this.visibleItems()[0]);
  readonly detectedCount = computed(() => this.items().length);
  readonly pendingCount = computed(() => this.items().filter((item) => item.status === 'to_reply').length);
  readonly repliedCount = computed(() => this.items().filter((item) => item.status === 'replied').length);
  readonly dismissedCount = computed(() => this.items().filter((item) => item.status === 'dismissed').length);
  readonly averageScore = computed(() => {
    const scores = this.items().filter((item) => item.status !== 'dismissed' && item.score > 0);
    return scores.length ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length) : null;
  });
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
      this.query.set('');
      this.selectedId.set(null);
      this.items.set([]);
      this.load();
    });
  }

  select(item: Opportunity, detail: HTMLElement): void {
    this.selectedId.set(item.id);
    if (detail.getBoundingClientRect().top > detail.ownerDocument.documentElement.clientHeight * 0.75) {
      detail.scrollIntoView({ block: 'start' });
    }
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
    const platform = this.platform();
    this.request = forkJoin({
      inbox: this.api.list(siteId, platform),
      dismissed: this.api.list(siteId, platform, 'dismissed'),
    }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: ({ inbox: { items, settings, searchConfigured }, dismissed }) => {
        this.items.set([...items, ...dismissed.items]);
        this.settings = settings;
        this.resetSettings();
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

  get keywordSummary(): string {
    return this.settings?.keywords.slice(0, 3).join(' · ') ?? '';
  }

  resetSettings(): void {
    this.keywords = this.settings?.keywords.join('\n') ?? '';
    this.subreddits = this.settings?.subreddits.join('\n') ?? '';
    this.replyStyle = this.settings?.replyStyle ?? '';
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
          if (this.platform() === platform && this.context.activeSite()?.id === siteId) {
            this.settings = settings;
            this.savedKeywords.set(settings.keywords.length > 0);
          }
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
    this.api.draft(siteId, this.platform(), item.id, { tone: this.replyTone, language: this.replyLanguage || undefined }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: ({ draft }) => {
        this.items.update((items) => items.map((entry) => entry.id === item.id ? { ...entry, draft } : entry));
        this.busyId.set(null);
      },
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
