import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { PlanningApiService, apiMessage } from '../../services/planning-api.service';
import { ToastService } from '../../services/toast.service';
import type { KeywordRejectReason, MonthPlan, MonthPlanItem, PlanItemSelectionView, PlanResearch } from '../../models/planning.models';
import { AppIconComponent } from '../ui/app-icon.component';
import { KeywordWhyComponent } from './keyword-why.component';
import { statusTone } from './planning-utils';

const STATUS: Record<string, string> = {
  proposed: 'Propuesto', approved: 'Aprobado', content_pending: 'En cola', generating: 'Redactando', content_ready: 'Borrador listo',
  review_required: 'En revisión', scheduled: 'Programado', published: 'Publicado',
};
const REJECTED: Record<KeywordRejectReason, string> = {
  no_volume: 'sin búsquedas medidas', already_ranking: 'tu sitio ya posiciona', off_topic: 'fuera de tema', low_relevance: 'poco relevantes',
  cannibalization: 'compiten con otro contenido tuyo', no_score: 'sin puntuación suficiente',
};
const SEED: Record<string, string> = { opportunity: 'hueco frente a competidores', site_topic: 'tema principal', cluster: 'grupo de temas' };
const NOT_STARTED: Record<string, string> = {
  complete: 'El mes ya está completo: no hay huecos libres.',
  busy: 'Ya se está generando un plan. Espera a que termine.',
  budget: 'El presupuesto de IA está agotado: no se puede generar el plan.',
  no_intelligence: 'Falta analizar el sitio antes de planificar.',
};
const KEYWORD_ERRORS: Record<string, string> = {
  editorial_plan_keyword_already_planned: 'Esa palabra ya está cubierta por otro artículo o compite con contenido del plan.',
  editorial_plan_keyword_off_topic: 'Esa palabra queda fuera de los temas del sitio.',
  editorial_plan_keyword_unchanged: 'Es la palabra que ya tiene el artículo.',
  editorial_plan_item_keyword_locked: 'El artículo ya se está redactando: la palabra no se puede cambiar.',
};
const RUN_ERRORS: Record<string, string> = {
  site_intelligence_required: 'Falta analizar el sitio antes de planificar.',
  EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID: 'La IA no devolvió un plan válido. Revisa el proveedor de texto.',
  EDITORIAL_PLAN_NO_RELEVANT_ITEMS: 'Ninguna propuesta encajaba con los temas del sitio.',
  plan_run_interrupted: 'La generación se interrumpió antes de terminar.',
};

export function keywordError(err: unknown): string {
  const message = apiMessage(err, 'No se pudo cambiar la palabra clave.');
  return KEYWORD_ERRORS[message] ?? message;
}

/** Modo y ritmo › Plan del mes: the next 30 days, why each keyword is there, and changing it. */
@Component({
  selector: 'app-month-plan',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, KeywordWhyComponent],
  styles: [`
    .mp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 12px; }
    .mp-kpi { display: grid; gap: 2px; padding: 12px 14px; border: 1px solid var(--au-border); border-radius: 12px; background: var(--au-surface-solid); }
    .mp-kpi span, .mp-kpi small { color: var(--au-muted); font-size: 12px; }
    .mp-kpi strong { font-size: 20px; font-variant-numeric: tabular-nums; }
    .mp-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .mp-banner { margin-top: 12px; }
    .mp-how { display: grid; gap: 6px; margin: 8px 0 0; padding-left: 20px; overflow-wrap: anywhere; }
    .mp-run + .mp-run { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--au-border); }
    .mp-run h3 { margin: 0; font-size: 15px; }
    .mp-muted { color: var(--au-muted); font-size: 13px; }
    .mp-nowrap { white-space: nowrap; }
    .mp-num { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
    .mp-title { display: grid; gap: 2px; }
    .mp-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .mp-empty td { color: var(--au-muted); }
    .mp-dialog { width: min(680px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 0; border: 1px solid var(--au-border); border-radius: 16px; background: var(--au-surface-solid); color: var(--au-text); }
    .mp-dialog::backdrop { background: var(--au-overlay); }
    .mp-dialog__head { position: sticky; top: 0; display: flex; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--au-border); background: var(--au-surface-solid); z-index: 1; }
    .mp-dialog__head h2 { margin: 0; font-size: 17px; overflow-wrap: anywhere; }
    .mp-dialog__body { display: grid; gap: 16px; padding: 16px 20px 20px; }
    .mp-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    .mp-form .au-field { flex: 1 1 260px; margin: 0; }
    .mp-alts { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .mp-alts li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid var(--au-border); border-radius: 10px; }
    .mp-alts div { min-width: 0; display: grid; gap: 2px; }
    .mp-error { margin: 0; color: var(--au-danger); }
    @media (max-width: 760px) {
      .mp-table thead { display: none; }
      .mp-table, .mp-table tbody, .mp-table tr, .mp-table td { display: block; width: 100%; min-width: 0; }
      .mp-table tr { padding: 10px 0; border-bottom: 1px solid var(--au-border); }
      .mp-table td { display: flex; justify-content: space-between; gap: 12px; padding: 4px 12px; border: 0; text-align: right; }
      .mp-table td::before { content: attr(data-label); color: var(--au-muted); font-size: 12px; text-align: left; }
      .mp-title { justify-items: end; }
    }
  `],
  template: `
    <section class="au-panel au-panel--padded au-mb-3" [attr.aria-busy]="loading">
      <div class="mp-head">
        <div>
          <h2 class="au-panel__title">Plan del mes</h2>
          <p class="au-panel__subtitle">
            @if (month; as m) {
              {{ m.mode === 'autopilot'
                ? (m.automationActive ? 'Autopilot mantiene planificados los próximos ' + m.horizonDays + ' días y rellena cada hueco libre con una palabra clave medida.' : 'La automatización está en pausa: el plan no se amplía hasta que la reanudes.')
                : 'En este modo el plan no se genera solo: genéralo con el botón.' }}
            }
          </p>
        </div>
        @if (canManage) {
          <button class="au-btn au-btn--primary" type="button" (click)="generate()" [disabled]="!month || starting || !!month.generating || !month.missing.length">
            <app-icon name="sparkles"></app-icon>{{ month?.generating ? 'Generando…' : 'Completar el mes ahora' }}
          </button>
        }
      </div>

      @if (error) { <div class="au-banner au-banner--error mp-banner" role="alert"><span class="au-banner__text">{{ error }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div> }
      @if (loading && !month) { <p class="mp-muted">Cargando el plan…</p> }

      @if (month; as m) {
        <div class="mp-kpis">
          <div class="mp-kpi"><span>Artículos planificados</span><strong>{{ m.items.length }}</strong><small>{{ m.dateFrom | date: 'd/MM' }} – {{ m.dateTo | date: 'd/MM' }}</small></div>
          <div class="mp-kpi"><span>Huecos libres</span><strong>{{ m.missing.length }}</strong><small>de {{ m.expectedSlots }} huecos del mes</small></div>
          <div class="mp-kpi"><span>Con volumen medido</span><strong>{{ measured() }}</strong><small>{{ !m.metricsProvider ? 'Proveedor sin configurar' : providerDown() ? 'DataForSEO no respondió' : 'DataForSEO configurado' }}</small></div>
          <div class="mp-kpi"><span>Ritmo</span><strong>{{ m.articlesPerDay }}/día</strong><small>{{ m.timezone }}</small></div>
        </div>
        @if (m.generating; as run) {
          <div class="au-banner au-banner--info mp-banner" role="status"><span class="au-banner__text">Generando "{{ run.planName }}"{{ run.total ? ': ' + run.completed + ' de ' + run.total + ' temas' : '…' }}</span></div>
        } @else if (m.lastRun && (m.lastRun.status === 'failed' || m.lastRun.status === 'partial') && m.missing.length) {
          <div class="au-banner au-banner--warning mp-banner" role="alert"><span class="au-banner__text">La última generación ({{ m.lastRun.at | date: 'd/MM, HH:mm' }}) {{ m.lastRun.status === 'failed' ? 'falló' : 'quedó incompleta' }}. {{ runError(m.lastRun.error) }}{{ m.mode === 'autopilot' ? ' Autopilot lo reintenta como máximo tres veces al día.' : '' }}</span></div>
        }
        @if (!m.siteIntelligence) { <div class="au-banner au-banner--warning mp-banner"><span class="au-banner__text">Falta analizar el sitio: sin su perfil no se puede planificar. <a routerLink="/studio/settings/sites">Abrir Sitios</a></span></div> }
        @if (m.budgetBlocked) { <div class="au-banner au-banner--warning mp-banner"><span class="au-banner__text">El presupuesto de IA está agotado; el plan no se amplía hasta que haya saldo.</span></div> }
        @if (m.outsideWindows) { <div class="au-banner au-banner--warning mp-banner"><span class="au-banner__text">{{ m.outsideWindows }} huecos quedan fuera de las ventanas de publicación y no se planifican. <a routerLink="/studio/automation" [queryParams]="{ tab: 'schedule' }">Revisar Calendario y volumen</a></span></div> }
        @if (providerDown(); as run) { <div class="au-banner au-banner--warning mp-banner" role="alert"><span class="au-banner__text"><strong>Las palabras de este plan no están medidas.</strong> {{ providerError(run) }} La IA propuso las palabras a partir de los temas del sitio. Puedes cambiarlas una a una.</span></div> }
        @if (!m.metricsProvider) { <div class="au-banner au-banner--warning mp-banner"><span class="au-banner__text">El proveedor de palabras clave no está configurado: las palabras las propone la IA, sin volumen medido.</span></div> }
      }
    </section>

    @if (month; as m) {
      @if (m.plans.length) {
        <section class="au-panel au-panel--padded au-mb-3">
          <h2 class="au-panel__title">Cómo se decidió este plan</h2>
          @for (plan of m.plans; track plan.id) {
            <div class="mp-run au-mt-2">
              <h3><a routerLink="/studio/plan" [queryParams]="{ plan: plan.id }">{{ plan.name }}</a></h3>
              @if (plan.research; as run) {
                <ul class="mp-how">
                  <li>Estrategia: {{ strategy(run) }}</li>
                  @if (run.provider) {
                    <li>Investigación del {{ run.at | date: 'd/MM/y, HH:mm' }} con DataForSEO (mercado {{ run.market }}): {{ run.rows | number }} palabras analizadas.</li>
                    <li>Puntos de partida: {{ seeds(run) }}.</li>
                    <li>Competidores consultados: {{ run.competitors.join(', ') || 'ninguno aceptado' }}.</li>
                    <li>Tu sitio ya posiciona para {{ run.ownRankingKeywords }} palabras conocidas; dificultad alcanzable: {{ run.reachableDifficulty }}.</li>
                    <li>Candidatas válidas guardadas: {{ run.candidates.length }}. Descartadas: {{ rejected(run) }}.</li>
                    @if (run.failedCalls) { <li>{{ run.failedCalls }} consultas al proveedor fallaron.</li> }
                  } @else {
                    <li>Sin palabras medidas ({{ skipped(run) }}): las propuso la IA a partir de los temas del sitio.</li>
                  }
                </ul>
                @if (run.rejectedSample.length) {
                  <details class="au-mt-2"><summary>Ver palabras descartadas con más búsquedas</summary>
                    <ul class="mp-how">@for (entry of run.rejectedSample; track entry.keyword) { <li>{{ entry.keyword }} · {{ entry.volume !== null ? (entry.volume | number) + ' búsquedas/mes' : 'sin volumen' }} · {{ rejectLabel(entry.reason) }}</li> }</ul>
                  </details>
                }
              } @else { <p class="mp-muted">Este plan es anterior al registro de la investigación o se creó a mano.</p> }
            </div>
          }
        </section>
      }

      <section class="au-panel au-panel--padded au-mb-3">
        <h2 class="au-panel__title">Artículos de los próximos {{ m.horizonDays }} días</h2>
        <p class="au-panel__subtitle au-mb-2">La palabra se puede cambiar hasta {{ m.leadMinutes }} minutos antes de su hora, cuando empieza la redacción.</p>
        @if (!m.items.length) {
          <p class="mp-muted">Todavía no hay artículos planificados.</p>
        } @else {
          <div class="au-table-wrap">
            <table class="au-table mp-table">
              <thead><tr><th>Fecha</th><th>Artículo</th><th>Palabra clave</th><th class="mp-num">Búsq./mes</th><th class="mp-num">KD</th><th class="mp-num">Punt.</th><th>Estado</th><th><span class="au-visually-hidden">Acciones</span></th></tr></thead>
              <tbody>
                @for (item of m.items; track item.id) {
                  <tr>
                    <td data-label="Fecha" class="mp-nowrap">{{ when(item, m.timezone) }}</td>
                    <td data-label="Artículo"><span class="mp-title"><span>{{ item.title }}</span><small class="mp-muted">{{ item.planName }}</small></span></td>
                    <td data-label="Palabra clave">{{ item.primaryKeyword ?? '—' }}</td>
                    <td data-label="Búsq./mes" class="mp-num">{{ item.searchVolume !== null ? (item.searchVolume | number) : '—' }}</td>
                    <td data-label="KD" class="mp-num">{{ item.keywordDifficulty ?? '—' }}</td>
                    <td data-label="Punt." class="mp-num">{{ (item.source === 'dataforseo' || item.source === 'user') && item.opportunityScore !== null ? (item.opportunityScore | number: '1.0-0') : 'Sin medir' }}</td>
                    <td data-label="Estado"><span class="au-badge au-badge--{{ tone(item.status) }}">{{ status(item.status) }}</span></td>
                    <td data-label="">
                      <span class="mp-actions">
                        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="open(item, 'why')" [attr.aria-label]="'Por qué se eligió ' + (item.primaryKeyword ?? item.title)">Por qué</button>
                        @if (canManage && changeable(item)) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="open(item, 'change')" [attr.aria-label]="'Cambiar la palabra clave de ' + item.title">Cambiar palabra</button> }
                        @if (item.projectId) { <a class="au-btn au-btn--ghost au-btn--sm" [routerLink]="['/studio/content', item.projectId]">Abrir</a> }
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (m.missing.length) { <p class="mp-muted au-mt-2">Días con hueco libre: {{ freeDays(m) }}.</p> }
      </section>
    }

    <dialog #dialog class="mp-dialog" aria-labelledby="mp-dialog-title" (close)="onClosed()" (click)="onBackdrop($event)">
      <header class="mp-dialog__head">
        <h2 id="mp-dialog-title">{{ panel === 'change' ? 'Cambiar palabra clave' : 'Por qué se eligió esta palabra' }}</h2>
        <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="close()" aria-label="Cerrar"><app-icon name="close"></app-icon></button>
      </header>
      <div class="mp-dialog__body">
        @if (selected; as item) { <p><strong>{{ item.title }}</strong><br><span class="mp-muted">{{ when(item, month?.timezone ?? 'Europe/Madrid') }} · {{ item.primaryKeyword ?? 'sin palabra' }}</span></p> }
        @if (detailError) { <p class="mp-error" role="alert">{{ detailError }}</p> }
        @if (!detail && !detailError) { <p class="mp-muted">Cargando…</p> }
        @if (detail; as view) {
          @if (panel === 'why') {
            <app-keyword-why [view]="view"></app-keyword-why>
            @if (canManage && !view.lockedReason) { <div><button class="au-btn au-btn--secondary" type="button" (click)="panel = 'change'">Cambiar palabra</button></div> }
          } @else if (view.lockedReason) {
            <p>El artículo ya se está redactando o está escrito: la palabra no se puede cambiar.</p>
          } @else {
            <p class="mp-muted">Al cambiarla se descarta el esquema de la palabra anterior; el artículo se prepara de nuevo cuando llegue su hora{{ view.changeableUntil ? ' (puedes cambiarla hasta el ' + (view.changeableUntil | date: 'd/MM, HH:mm') + ')' : '' }}.</p>
            <form class="mp-form" (ngSubmit)="change(custom)">
              <label class="au-field"><span class="au-field__label">Escribir otra palabra clave</span><input class="au-input" name="custom" maxlength="160" [(ngModel)]="custom" /></label>
              <button class="au-btn au-btn--primary" type="submit" [disabled]="saving || !custom.trim()">{{ saving ? 'Cambiando…' : 'Cambiar' }}</button>
            </form>
            <section>
              <h3 class="au-mb-2">Alternativas medidas sin usar</h3>
              @if (!view.alternatives.length) { <p class="mp-muted">No quedan candidatas medidas libres en las investigaciones guardadas.</p> }
              <ul class="mp-alts">
                @for (option of view.alternatives; track option.keyword) {
                  <li><div><strong>{{ option.keyword }}</strong><span class="mp-muted">{{ option.volume | number }} búsquedas/mes · KD {{ option.difficulty ?? '—' }} · puntuación {{ option.score }}</span></div>
                    <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="saving" (click)="change(option.keyword)" [attr.aria-label]="'Usar ' + option.keyword">Usar</button></li>
                }
              </ul>
            </section>
          }
        }
      </div>
    </dialog>
  `,
})
export class MonthPlanComponent implements OnChanges, OnDestroy {
  private readonly api = inject(PlanningApiService);
  private readonly toast = inject(ToastService);
  private readonly appContext = inject(AppContextService);
  @Input({ required: true }) siteId!: string;
  @ViewChild('dialog') dialog?: ElementRef<HTMLDialogElement>;

  month: MonthPlan | null = null;
  loading = false;
  error = '';
  starting = false;
  panel: 'why' | 'change' = 'why';
  selected: MonthPlanItem | null = null;
  detail: PlanItemSelectionView | null = null;
  detailError = '';
  custom = '';
  saving = false;
  readonly tone = statusTone;
  private poll: Subscription | null = null;

  get canManage(): boolean { return this.appContext.permissions().includes('projects.manage'); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId']) {
      this.month = null;
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
  }

  load(): void {
    const siteId = this.siteId;
    this.loading = true;
    this.poll?.unsubscribe();
    this.api.getMonthPlan(siteId).subscribe({
      next: (month) => {
        if (siteId !== this.siteId) return;
        this.month = month;
        this.loading = false;
        this.error = '';
        // Faster while a run is filling the month; otherwise Autopilot may start one at any tick.
        this.poll = timer(month.generating ? 4_000 : 45_000).subscribe(() => this.load());
      },
      error: (err) => {
        if (siteId !== this.siteId) return;
        this.loading = false;
        this.error = apiMessage(err, 'No se pudo cargar el plan del mes.');
      },
    });
  }

  generate(): void {
    this.starting = true;
    this.api.generateMonthPlan(this.siteId).subscribe({
      next: (result) => {
        this.starting = false;
        if (result.started) this.toast.success(`Generando ${result.slots} artículos del plan.`);
        else this.toast.error(NOT_STARTED[result.reason] ?? 'No se pudo generar el plan ahora.');
        this.load();
      },
      error: (err) => {
        this.starting = false;
        this.toast.error(apiMessage(err, 'No se pudo generar el plan.'));
      },
    });
  }

  open(item: MonthPlanItem, panel: 'why' | 'change'): void {
    this.selected = item;
    this.panel = panel;
    this.detail = null;
    this.detailError = '';
    this.custom = '';
    this.dialog?.nativeElement.showModal();
    this.api.getItemSelection(item.id).subscribe({
      next: (view) => { if (this.selected?.id === item.id) this.detail = view; },
      error: (err) => { if (this.selected?.id === item.id) this.detailError = apiMessage(err, 'No se pudo cargar el motivo.'); },
    });
  }

  close(): void {
    this.dialog?.nativeElement.close();
  }

  onClosed(): void {
    this.selected = null;
    this.detail = null;
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog?.nativeElement) this.close();
  }

  change(keyword: string): void {
    const item = this.selected;
    if (!item || !keyword.trim() || this.saving) return;
    this.saving = true;
    this.detailError = '';
    this.api.changeItemKeyword(item.id, keyword.trim()).subscribe({
      next: () => {
        this.saving = false;
        this.close();
        this.toast.success('Palabra clave cambiada.');
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.detailError = keywordError(err);
      },
    });
  }

  /** The newest research, when the provider is configured but none of its answers could be used. */
  providerDown(): PlanResearch | null {
    const runs = (this.month?.plans ?? []).map((plan) => plan.research).filter((run): run is PlanResearch => Boolean(run));
    const last = runs.sort((a, b) => b.at.localeCompare(a.at))[0];
    return last && !last.provider && last.failedCalls && !last.rows ? last : null;
  }
  providerError(run: PlanResearch): string {
    return run.lastError?.includes('402') ? 'DataForSEO rechazó las consultas por falta de saldo (402).' : `DataForSEO falló en ${run.failedCalls} consultas.`;
  }
  measured(): number {
    return this.month?.items.filter((item) => item.searchVolume !== null).length ?? 0;
  }
  changeable(item: MonthPlanItem): boolean {
    return !item.projectId && (item.status === 'proposed' || item.status === 'approved');
  }
  when(item: MonthPlanItem, timeZone: string): string {
    return item.scheduledFor ? new Date(item.scheduledFor).toLocaleString('es-ES', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha';
  }
  status(value: string): string {
    return STATUS[value] ?? value;
  }
  freeDays(month: MonthPlan): string {
    const days = [...new Set(month.missing.map((slot) => `${Number(slot.localDate.slice(8))}/${slot.localDate.slice(5, 7)}`))];
    return days.length > 12 ? `${days.slice(0, 12).join(', ')} y ${days.length - 12} más` : days.join(', ');
  }
  strategy(run: PlanResearch): string {
    const s = run.strategy;
    const parts = [s.approvedVersion ? `estrategia aprobada v${s.approvedVersion}` : 'sin estrategia aprobada, se usan los temas detectados en el sitio'];
    if (s.pillars.length) parts.push(`pilares: ${s.pillars.join(', ')}`);
    if (s.priorityTopics.length) parts.push(`temas prioritarios: ${s.priorityTopics.join(', ')}`);
    if (s.excludedTopics.length) parts.push(`excluidos: ${s.excludedTopics.join(', ')}`);
    return parts.join('; ') + '.';
  }
  seeds(run: PlanResearch): string {
    return run.seeds.map((seed) => `"${seed.keyword}" (${SEED[seed.origin]})`).join(', ') || 'ninguno';
  }
  rejected(run: PlanResearch): string {
    const entries = Object.entries(run.rejected) as Array<[KeywordRejectReason, number]>;
    return entries.map(([reason, count]) => `${count} ${REJECTED[reason]}`).join(', ') || 'ninguna';
  }
  rejectLabel(reason: KeywordRejectReason): string {
    return REJECTED[reason];
  }
  skipped(run: PlanResearch): string {
    return run.skipped === 'not_configured' ? 'proveedor sin configurar' : run.skipped === 'unsupported_market' ? 'mercado no disponible en el proveedor' : run.skipped === 'provider_error' || (run.failedCalls && !run.rows) ? this.providerError(run).replace(/\.$/, '') : 'el proveedor no devolvió candidatas válidas';
  }
  runError(error: string | null): string {
    if (!error) return '';
    return RUN_ERRORS[error] ?? error;
  }
}
