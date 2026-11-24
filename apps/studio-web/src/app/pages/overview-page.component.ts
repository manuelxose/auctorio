import { CommonModule, DOCUMENT, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { Component, DestroyRef, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, catchError, finalize, forkJoin, of, switchMap, tap, timer } from 'rxjs';
import { OverviewWeekComponent, type WeekDay, type WeekEntry } from '../components/overview-week.component';
import { addDays, localDate, localTime, zonedToUtc } from '../components/planning/planning-utils';
import { AppIconComponent, type StudioIconName } from '../components/ui/app-icon.component';
import type { StrategyLayers } from '../models/intelligence.models';
import type { AutomationPolicy, CalendarEvent, EditorialPlan, EditorialPlanItem, OperationItem, StudioOverview, StudioProjectSummary, SiteIntelligenceOverview } from '../models/studio.models';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { IntelligenceApiService } from '../services/intelligence-api.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { activityLabel, difficultyLabel, humanError, setupSteps, type SetupStepId } from '../utils/overview-model';

registerLocaleData(localeEs);

type Mode = 'manual' | 'assisted' | 'autopilot';
type Connection = StudioOverview['connections'][number];
type AttentionKind = 'approval' | 'error' | 'connection';
type Attention = { id: string; kind: AttentionKind; title: string; detail: string; action: string; link: string | string[]; params?: Record<string, string> };

const MODES: Record<Mode, { label: string; title: string; description: string }> = {
  manual: { label: 'Manual', title: 'Tú eliges cuándo empezar', description: 'Auctorio prepara artículos cuando se lo pides.' },
  assisted: { label: 'Asistido', title: 'Tú decides cuándo publicar', description: 'Auctorio prepara los artículos. Tú apruebas cada publicación.' },
  autopilot: { label: 'Autopilot', title: 'Publicación automática', description: 'Auctorio prepara y publica según la política editorial del sitio.' },
};
const CONNECTION_STAGES = { unconfigured: 'Sin configurar', stored: 'Sin verificación registrada', not_verified: 'Sin verificar', authenticated: 'Autenticado', read_only: 'Solo lectura', ready: 'Verificado', stale: 'Verificación caducada', error: 'Requiere atención' };
const SETUP_LABELS: Record<SetupStepId, string> = {
  website: 'Conectar tu sitio web', learn: 'Analizar tu sitio', plan: 'Preparar el plan editorial',
  autopilot: 'Elegir el modo de trabajo', instagram: 'Conectar Instagram', x: 'Conectar X', sources: 'Añadir fuentes de noticias',
};
const SETUP_LINKS: Record<SetupStepId, { url: string; params?: Record<string, string | number> }> = {
  website: { url: '/studio/connections/wizard' }, learn: { url: '/studio/site-intelligence', params: { tab: 'crawl' } },
  plan: { url: '/studio/plan', params: { new: 1 } }, autopilot: { url: '/studio/automation' },
  instagram: { url: '/studio/connections/wizard', params: { target: 'instagram.com' } },
  x: { url: '/studio/connections/wizard', params: { target: 'x.com' } }, sources: { url: '/studio/sources' },
};
const OPERATION_TITLES: Record<string, string> = {
  text_generation: 'Redacción de artículo', image_generation: 'Creación de imágenes', publish: 'Envío de publicación',
  site_index: 'Análisis del sitio', editorial_plan_generation: 'Planificación editorial',
  connection_verification: 'Verificación de destino', discovery: 'Búsqueda de noticias', quality_repair: 'Corrección de calidad',
  engagement_refresh_reddit: 'Actualización de Reddit', engagement_refresh_quora: 'Actualización de Quora', social_generation: 'Preparación para redes sociales',
};
const PUBLICATION_LABELS: Record<StudioOverview['recentPublications'][number]['status'], string> = {
  draft: 'Borrador', ready: 'Lista', scheduled: 'Programada', queued: 'En cola', publishing: 'Publicando',
  published: 'Publicada', failed: 'Fallida', canceled: 'Cancelada', deleted: 'Eliminada', unpublished: 'Retirada',
};
const MAX_WEEK_OFFSET = 28;
const LAST_DAY_OFFSET = MAX_WEEK_OFFSET + 6;

@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent, OverviewWeekComponent],
  templateUrl: './overview-page.component.html',
  styleUrls: ['./overview-page.component.css', './overview-setup.css'],
})
export class OverviewPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly intelligenceApi = inject(IntelligenceApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  readonly modes = (Object.keys(MODES) as Mode[]).map((id) => ({ id, ...MODES[id] }));
  readonly periods = [7, 14, 30];
  readonly attentionFilters: Array<{ id: 'all' | AttentionKind; label: string }> = [
    { id: 'all', label: 'Todas' }, { id: 'approval', label: 'Aprobaciones' },
    { id: 'error', label: 'Errores' }, { id: 'connection', label: 'Conexiones' },
  ];
  readonly publicationLabels = PUBLICATION_LABELS;
  readonly setupLabels = SETUP_LABELS;
  readonly setupLinks = SETUP_LINKS;
  readonly maxWeekOffset = MAX_WEEK_OFFSET;
  readonly lastDayOffset = LAST_DAY_OFFSET;

  readonly siteId = computed(() => this.appContext.activeSite()?.id ?? null);
  readonly siteName = computed(() => this.appContext.activeSite()?.name ?? 'Todos los sitios');
  readonly canManageAutomation = computed(() => this.appContext.permissions().includes('workspace.manage'));
  readonly canConfirmProfile = computed(() => this.appContext.role() !== 'viewer');

  readonly overview = signal<StudioOverview | null>(null);
  readonly policy = signal<AutomationPolicy | null>(null);
  readonly intelligence = signal<SiteIntelligenceOverview | null>(null);
  readonly strategy = signal<StrategyLayers | null>(null);
  readonly plans = signal<EditorialPlan[]>([]);
  readonly planItems = signal<EditorialPlanItem[]>([]);
  readonly operations = signal<OperationItem[] | null>(null);
  readonly calendar = signal<CalendarEvent[] | null>(null);
  readonly reviewProjects = signal<StudioProjectSummary[]>([]);
  readonly loading = signal(true);
  readonly loadIssues = signal<string[]>([]);
  readonly modeBusy = signal(false);
  readonly modeError = signal<string | null>(null);
  readonly confirming = signal(false);
  readonly dayOffset = signal(0);
  readonly weekOffset = signal(0);
  readonly agendaOffset = signal(0);
  readonly failedLogoUrl = signal<string | null>(null);
  readonly period = signal(7);
  readonly attentionFilter = signal<'all' | AttentionKind>('all');
  readonly showAllAttention = signal(false);
  readonly showAllOps = signal(false);
  readonly showAllPublications = signal(false);
  private readonly dismissed = signal(false);
  private readonly now = signal(new Date());
  private readonly timeZone = signal(Intl.DateTimeFormat().resolvedOptions().timeZone);
  private requests = new Subscription();
  private loadedSite: string | null | undefined;

  readonly profile = computed(() => this.intelligence()?.profile ?? null);
  readonly logoUrl = computed(() => {
    const logo = this.overview()?.siteLogoUrl ?? null;
    return logo === this.failedLogoUrl() ? null : logo;
  });
  readonly indexing = computed(() => Boolean(this.intelligence()?.indexing));
  readonly mode = computed(() => this.policy()?.mode ?? this.overview()?.automation.mode ?? null);
  readonly modeDetails = computed(() => this.mode() ? MODES[this.mode()!] : null);
  readonly automationStatus = computed(() => {
    const automation = this.policy() ?? this.overview()?.automation;
    if (!automation) return null;
    if (automation.state === 'paused') return { label: 'Automatización en pausa', tone: 'amber' };
    if (automation.state === 'degraded') return { label: 'Automatización con incidencias', tone: 'amber' };
    return automation.enabled ? { label: 'Automatización activa', tone: 'green' } : { label: 'Automatización desactivada', tone: 'neutral' };
  });

  readonly siteConnections = computed(() => (this.overview()?.connections ?? []).filter((c) => !this.siteId() || !c.siteId || c.siteId === this.siteId()));
  readonly steps = computed(() => {
    const connected = (platform: string) => this.siteConnections().some((c) => c.platform === platform && this.connectionTone(c) === 'green');
    return setupSteps({
      websiteConnected: connected('website') || this.siteConnections().some((c) => c.platform === 'website' && c.enabled && c.id.startsWith('legacy-site-') && c.readiness === 'ready'),
      siteAnalyzed: Boolean(this.profile()?.indexedAt),
      planReady: this.plans().some((plan) => plan.status === 'ready' && localDate(plan.dateTo, this.timeZone()) >= this.dateKey(0)),
      autopilotMode: this.mode(),
      automationEnabled: Boolean(this.policy()?.enabled),
      instagramConnected: connected('instagram'),
      xConnected: connected('x'),
      sourceCount: this.overview()?.sources.total ?? 0,
    });
  });
  readonly websiteReady = computed(() => this.steps().some((step) => step.id === 'website' && step.done));
  readonly setupRemaining = computed(() => this.steps().filter((step) => !step.done).length);
  readonly setupHidden = computed(() => !this.setupRemaining() || (this.websiteReady() && this.dismissed()));
  readonly reviewCount = computed(() => this.overview()?.pipeline.review ?? 0);
  readonly headline = computed(() => {
    if (!this.overview()) return { title: this.loading() ? 'Cargando tu espacio editorial…' : 'Resumen no disponible', detail: '' };
    if (!this.websiteReady()) return { title: 'Conecta tu sitio web para empezar', detail: 'La conexión habilita la publicación desde Auctorio.' };
    const verified = this.siteConnections().some((c) => c.platform === 'website' && this.connectionTone(c) === 'green');
    const detail = [verified ? 'Web verificada' : 'Web pendiente de verificar', this.profile() ? 'Perfil editorial disponible' : '', this.modeDetails()?.label].filter(Boolean).join(' · ');
    return { title: 'Tu espacio editorial está listo', detail };
  });

  private readonly upcomingEvents = computed(() => {
    const now = this.now().getTime();
    const end = zonedToUtc(this.dateKey(this.period()), '00:00', this.timeZone()).getTime();
    return (this.calendar() ?? []).filter((event) => {
      if (!event.scheduledFor) return false;
      const at = new Date(event.scheduledFor).getTime();
      return at >= now && at < end;
    }).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
  });
  readonly nextScheduled = computed(() => this.upcomingEvents().filter((event) => event.kind === 'publication' && ['scheduled', 'queued'].includes(event.status)));
  readonly upcoming = computed(() => this.nextScheduled()[0] ?? this.upcomingEvents().find((event) => event.channel === 'website' && event.kind !== 'social_draft' && ['planned', 'drafting', 'needs_review', 'ready'].includes(event.lifecycle ?? '')) ?? null);

  upcomingState(event: CalendarEvent): { label: string; tone: string; detail: string } {
    if (this.nextScheduled().includes(event)) return { ...this.eventState(event), tone: 'green', detail: 'Envío programado' };
    if (event.lifecycle === 'needs_review') return { label: 'Por revisar', tone: 'amber', detail: 'El artículo requiere revisión antes de publicarse.' };
    if (event.lifecycle === 'drafting') return { label: 'En producción', tone: 'blue', detail: 'La redacción está en curso.' };
    if (event.lifecycle === 'ready') return { label: 'Preparado', tone: 'violet', detail: 'El envío aún está pendiente de programación.' };
    const policy = this.policy();
    if (policy?.enabled && policy.state === 'active' && policy.mode === 'autopilot') {
      return { label: 'Plan de Autopilot', tone: 'violet', detail: 'Autopilot recoge el tema al acercarse su franja y aplica los controles editoriales.' };
    }
    if (policy?.enabled && policy.state === 'active' && policy.mode === 'assisted' && event.status === 'approved') {
      return { label: 'Plan asistido', tone: 'violet', detail: 'Auctorio prepara el artículo. La publicación requiere aprobación.' };
    }
    return { ...this.eventState(event), detail: event.status === 'proposed' ? 'La propuesta está pendiente de aprobación en el plan.' : 'Franja reservada en el plan editorial.' };
  }
  readonly attention = computed<Attention[]>(() => {
    const overview = this.overview();
    if (!overview) return [];
    const items: Attention[] = overview.recentPublications.filter((pub) => pub.status === 'failed').map((pub) => ({
      id: pub.id, kind: 'error', title: pub.title, detail: [pub.destination, humanError(pub.lastError)].filter(Boolean).join(' · '),
      action: 'Resolver', link: '/studio/results', params: { id: pub.id },
    }));
    const missingFailures = overview.pipeline.failed - items.length;
    if (missingFailures > 0) items.push({ id: 'failures', kind: 'error', title: missingFailures === 1 ? 'Una publicación fallida' : `${missingFailures} publicaciones fallidas`, detail: 'Consulta los intentos de envío en Resultados.', action: 'Resolver', link: '/studio/results', params: { status: 'failed' } });
    for (const project of this.reviewProjects()) {
      items.push({ id: project.id, kind: 'approval', title: project.title, detail: 'Artículo pendiente de revisión', action: 'Revisar', link: ['/studio/content', project.id] });
    }
    const remainingReviews = overview.pipeline.review - this.reviewProjects().length;
    if (remainingReviews > 0) items.push({ id: 'reviews', kind: 'approval', title: remainingReviews === 1 ? 'Un artículo pendiente de revisión' : `${remainingReviews} artículos pendientes de revisión`, detail: 'Abre el calendario filtrado por revisión.', action: 'Revisar', link: '/studio/calendar', params: { chip: 'review' } });
    for (const connection of this.siteConnections()) {
      if (this.connectionTone(connection) === 'red' || ['stale', 'not_verified', 'stored'].includes(connection.stage ?? '') || (connection.enabled && connection.platform === 'website' && this.connectionTone(connection) !== 'green')) {
        items.push({ id: connection.id, kind: 'connection', title: connection.displayName, detail: connection.reason || this.connectionLabel(connection), action: 'Gestionar', link: '/studio/connections' });
      }
    }
    if (overview.sources.failing) items.push({ id: 'sources', kind: 'error', title: overview.sources.failing === 1 ? 'Una fuente con errores' : `${overview.sources.failing} fuentes con errores`, detail: 'Revisa las fuentes que han dejado de actualizarse.', action: 'Revisar', link: '/studio/sources' });
    return items;
  });
  readonly filteredAttention = computed(() => this.attention().filter((item) => this.attentionFilter() === 'all' || item.kind === this.attentionFilter()));
  readonly recentPublications = computed(() => this.overview()?.recentPublications ?? []);

  private readonly eventsByDay = computed(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of this.calendar() ?? []) {
      if (!event.scheduledFor || event.channel !== 'website' || ['canceled', 'deleted', 'rejected'].includes(event.status)) continue;
      const key = localDate(event.scheduledFor, this.timeZone());
      const entries = byDay.get(key);
      if (entries) entries.push(event);
      else byDay.set(key, [event]);
    }
    return byDay;
  });
  readonly dayEvents = computed(() => this.eventsByDay().get(this.dateKey(this.dayOffset())) ?? []);
  readonly dayOperations = computed(() => this.operations()?.filter((op) => localDate(op.createdAt, this.timeZone()) === this.dateKey(this.dayOffset())) ?? []);
  readonly day = computed(() => this.dateAt(this.dayOffset()));
  readonly agendaDate = computed(() => this.dateAt(this.agendaOffset()));
  readonly selectedDateKey = computed(() => this.dateKey(this.agendaOffset()));
  readonly agendaEventCount = computed(() => this.eventsByDay().get(this.selectedDateKey())?.length ?? 0);
  readonly periodCoverage = computed(() => this.coverage(0, this.period()));
  readonly weekCoverage = computed(() => this.coverage(this.weekOffset(), 7));
  readonly week = computed<WeekDay[]>(() => Array.from({ length: 7 }, (_, index) => {
    const offset = this.weekOffset() + index;
    const items: WeekEntry[] = (this.eventsByDay().get(this.dateKey(offset)) ?? []).map((event) => ({
      id: event.id, title: event.title, ...this.eventState(event), detail: event.primaryKeyword || this.eventTime(event.scheduledFor),
    }));
    return { offset, date: this.dateAt(offset), isToday: offset === 0, items };
  }));
  readonly featured = computed(() => this.dayEvents()[0] ?? null);
  readonly featuredPlanItem = computed(() => this.planItems().find((item) => item.id === this.featured()?.planItemId) ?? null);
  readonly runningWork = computed(() => this.dayOffset() === 0
    ? this.operations()?.find((op) => op.status === 'running' || op.status === 'retrying' || op.status === 'queued') ?? null
    : null);

  private readonly reloadOnSite = effect(() => {
    const siteId = this.siteId();
    untracked(() => {
      if (this.loadedSite !== undefined && this.loadedSite !== siteId) this.load();
    });
  });

  ngOnInit(): void {
    this.load();
    timer(30_000, 30_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.document.hidden && !this.loading() && !this.modeBusy() && !this.confirming()) this.load();
    });
  }

  ngOnDestroy(): void {
    this.requests.unsubscribe();
  }

  load(): void {
    const siteId = this.siteId();
    if (this.loadedSite !== siteId) {
      this.resetSite();
      this.loadedSite = siteId;
    }
    // A later reload owns the signals, including after switching the active site.
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.loadIssues.set([]);
    this.loading.set(true);
    this.now.set(new Date());
    const scope = siteId ?? undefined;
    const from = zonedToUtc(this.dateKey(-MAX_WEEK_OFFSET - 1), '00:00', this.timeZone());
    const to = zonedToUtc(this.dateKey(LAST_DAY_OFFSET + 2), '00:00', this.timeZone());
    const requests: Observable<unknown>[] = [
      this.read('resumen', this.api.getOverview(scope), this.overview.set),
      this.read('automatización', this.api.getAutomationPolicy(scope), (value) => {
        if (!this.modeBusy()) this.policy.set(value);
      }),
      this.read('actividad', this.api.listOperations({ page: 1, pageSize: 100, siteId: scope }), (value) => this.operations.set(value.items)),
      this.read('calendario', this.api.listCalendar(from.toISOString(), to.toISOString(), undefined, scope), (response) => {
        if (response.timeZone) this.timeZone.set(response.timeZone);
        this.calendar.set(response.items);
      }),
      this.read('aprobaciones', forkJoin([
        this.api.listProjects({ siteId: scope, status: 'in_review', pageSize: 6 }),
        this.api.listProjects({ siteId: scope, status: 'qa_passed', pageSize: 6 }),
      ]), (pages) => this.reviewProjects.set(pages.flatMap((page) => page.items).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6))),
      this.read('plan editorial', this.api.listEditorialPlans(1, 10, scope).pipe(switchMap((page) => {
        const plans = page.items.filter((plan) => !siteId || !plan.siteId || plan.siteId === siteId);
        this.plans.set(plans);
        const current = plans.filter((plan) => plan.status === 'ready' && localDate(plan.dateTo, this.timeZone()) >= this.dateKey(0)).slice(0, 3);
        return current.length ? forkJoin(current.map((plan) => this.api.getEditorialPlan(plan.id))) : of([]);
      })), (plans) => this.planItems.set(plans.flatMap((plan) => plan.items ?? []))),
    ];
    if (siteId) {
      requests.push(
        this.read('perfil del sitio', this.api.getSiteIntelligence(siteId), this.intelligence.set),
        this.read('estrategia', this.intelligenceApi.getStrategy(siteId), (value) => { if (!this.confirming()) this.strategy.set(value); }),
      );
    }
    this.requests.add(forkJoin(requests).subscribe({ complete: () => this.loading.set(false) }));
  }

  private read<T>(label: string, source: Observable<T>, apply: (value: T) => void): Observable<T | null> {
    return source.pipe(tap(apply), catchError(() => {
      this.loadIssues.update((issues) => [...issues, label]);
      return of(null);
    }));
  }

  private resetSite(): void {
    this.overview.set(null);
    this.policy.set(null);
    this.intelligence.set(null);
    this.strategy.set(null);
    this.plans.set([]);
    this.planItems.set([]);
    this.operations.set(null);
    this.calendar.set(null);
    this.reviewProjects.set([]);
    this.dayOffset.set(0);
    this.weekOffset.set(0);
    this.agendaOffset.set(0);
    this.failedLogoUrl.set(null);
    this.setAttention('all');
    this.showAllOps.set(false);
    this.showAllPublications.set(false);
    this.modeError.set(null);
    this.timeZone.set(Intl.DateTimeFormat().resolvedOptions().timeZone);
    this.dismissed.set(typeof localStorage !== 'undefined' && localStorage.getItem(`au-setup-hidden:${this.siteId() ?? 'all'}`) === '1');
  }

  private dateAt(offset: number): Date {
    return new Date(`${this.dateKey(offset)}T12:00:00`);
  }

  private dateKey(offset: number): string {
    return addDays(localDate(this.now(), this.timeZone()), offset);
  }

  private coverage(start: number, length: number): number | null {
    if (!this.calendar()) return null;
    return Array.from({ length }, (_, i) => this.eventsByDay().has(this.dateKey(start + i))).filter(Boolean).length;
  }

  eventTime(value: string | null): string {
    return value ? localTime(value, this.timeZone()) : '';
  }

  eventDateKey(value: string | null): string | null {
    return value ? localDate(value, this.timeZone()) : null;
  }

  eventDate(value: string | null): Date | null {
    return value ? new Date(`${localDate(value, this.timeZone())}T12:00:00`) : null;
  }

  eventState(event: CalendarEvent): { label: string; tone: string } {
    if (event.kind === 'publication' && event.status in PUBLICATION_LABELS) {
      const status = event.status as keyof typeof PUBLICATION_LABELS;
      return { label: PUBLICATION_LABELS[status], tone: status === 'published' ? 'green' : status === 'failed' ? 'red' : 'violet' };
    }
    if (event.chip === 'failed') return { label: 'Fallido', tone: 'red' };
    if (event.chip === 'review') return { label: 'Por revisar', tone: 'amber' };
    if (event.chip === 'drafting') return { label: 'En redacción', tone: 'blue' };
    return { label: event.status === 'proposed' ? 'Propuesto' : 'Planificado', tone: 'violet' };
  }

  readonly humanError = humanError;
  readonly difficulty = difficultyLabel;

  operationInfo(op: OperationItem): { icon: StudioIconName; title: string; status: string; tone: string } {
    const info = activityLabel(op.type, op.status);
    const status = op.status === 'succeeded' ? 'Completado' : info.failed ? 'Con errores' : op.status === 'cancelled' ? 'Cancelado' : op.status === 'queued' ? 'En cola' : op.status === 'retrying' ? 'Reintentando' : 'En proceso';
    return { icon: info.icon, title: OPERATION_TITLES[op.type] ?? info.label, status, tone: info.failed ? 'red' : op.status === 'succeeded' ? 'green' : 'violet' };
  }

  operationProgress(op: OperationItem): number {
    return op.totalSteps > 0 ? Math.min(100, Math.max(0, Math.round(op.completedSteps / op.totalSteps * 100))) : 0;
  }

  connectionTone(c: Connection): 'green' | 'red' | 'amber' | 'neutral' {
    if (!c.enabled) return 'neutral';
    if (c.status === 'error' || c.stage === 'error' || ['expired', 'provider_error', 'permissions_required'].includes(c.connectionState ?? '')) return 'red';
    if (c.platform === 'website' && c.stage) return c.stage === 'ready' ? 'green' : 'amber';
    if (c.connectionState === 'connected' && c.lastVerifiedAt) return 'green';
    return 'amber';
  }

  connectionLabel(c: Connection): string {
    if (!c.enabled) return 'Desactivado';
    if (c.platform === 'website' && c.stage) {
      if (c.stage === 'stored' && c.readiness === 'ready') return 'Conectado · sin verificación registrada';
      return CONNECTION_STAGES[c.stage];
    }
    const tone = this.connectionTone(c);
    return tone === 'green' ? 'Verificado' : tone === 'red' ? 'Requiere atención' : 'Sin verificar';
  }


  setAttention(filter: 'all' | AttentionKind): void {
    this.attentionFilter.set(filter);
    this.showAllAttention.set(false);
  }

  focusAttention(filter: AttentionKind): void {
    this.setAttention(filter);
    this.document.getElementById('ov-attention')?.focus();
  }

  selectPeriod(event: Event): void {
    this.period.set(Number((event.target as HTMLSelectElement).value));
  }

  shiftWeek(delta: number): void {
    this.weekOffset.update((offset) => Math.max(-MAX_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, offset + delta)));
    this.agendaOffset.set(this.weekOffset());
  }

  shiftDay(delta: number): void {
    this.selectDay(Math.max(-MAX_WEEK_OFFSET, Math.min(LAST_DAY_OFFSET, this.dayOffset() + delta)));
  }

  selectDay(offset: number): void {
    this.dayOffset.set(offset);
    this.showAllOps.set(false);
  }

  dismissSetup(): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(`au-setup-hidden:${this.siteId() ?? 'all'}`, '1');
    this.dismissed.set(true);
  }

  async setMode(mode: Mode): Promise<void> {
    if (!this.canManageAutomation() || this.modeBusy() || !this.policy() || this.mode() === mode) return;
    const siteId = this.siteId();
    this.beginAutomationChange();
    if (mode === 'autopilot') {
      const accepted = await this.confirm.confirm({
        title: '¿Activar Autopilot?',
        message: 'Auctorio podrá publicar automáticamente según la política editorial del sitio.',
        confirmLabel: 'Activar Autopilot',
        cancelLabel: 'Cancelar',
      });
      if (!accepted || siteId !== this.siteId()) {
        this.modeBusy.set(false);
        return;
      }
    }
    this.saveAutomation(siteId, this.api.updateAutomationPolicy({ siteId, mode }), `Modo ${MODES[mode].label} guardado.`);
  }

  async togglePause(): Promise<void> {
    const policy = this.policy();
    if (!this.canManageAutomation() || this.modeBusy() || !policy) return;
    const siteId = this.siteId();
    this.beginAutomationChange();
    const paused = policy.state !== 'active';
    if (!paused) {
      const accepted = await this.confirm.confirm({
        title: '¿Pausar la automatización?',
        message: 'Se dejarán de crear y programar publicaciones automáticas. Los trabajos en curso continuarán.',
        confirmLabel: 'Pausar automatización',
        cancelLabel: 'Cancelar',
        danger: true,
      });
      if (!accepted || siteId !== this.siteId()) {
        this.modeBusy.set(false);
        return;
      }
    }
    const scope = siteId ?? undefined;
    this.saveAutomation(siteId, paused ? this.api.resumeAutomation(scope) : this.api.pauseAutomation('paused_manually', scope), paused ? 'Automatización reanudada.' : 'Automatización en pausa.');
  }

  private beginAutomationChange(): void {
    this.modeBusy.set(true);
    this.modeError.set(null);
  }

  private saveAutomation(siteId: string | null, request: Observable<AutomationPolicy>, message: string): void {
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.modeBusy.set(false))).subscribe({
      next: (policy) => {
        if (siteId === this.siteId()) {
          this.policy.set(policy);
          this.toast.success(message);
        }
        this.load();
      },
      error: (err) => {
        if (siteId === this.siteId()) this.modeError.set(err?.error?.error?.message || err?.error?.message || 'No se pudo guardar el cambio.');
        else this.load();
      },
    });
  }

  confirmProfile(): void {
    const siteId = this.siteId();
    const layers = this.strategy();
    if (!this.canConfirmProfile() || this.confirming() || !siteId || !layers || layers.approved) return;
    this.confirming.set(true);
    this.intelligenceApi.saveStrategy(siteId, layers.effective, 'Confirmado desde Overview')
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.confirming.set(false)))
      .subscribe({
        next: (saved) => {
          if (siteId !== this.siteId()) { this.load(); return; }
          this.strategy.set(saved.layers);
          this.toast.success('Perfil confirmado.');
        },
        error: (err) => {
          if (siteId !== this.siteId()) { this.load(); return; }
          this.toast.error(err?.error?.error?.message || err?.error?.message || 'No se pudo confirmar el perfil.');
        },
      });
  }
}
