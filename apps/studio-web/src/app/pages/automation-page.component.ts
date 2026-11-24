import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { ArticleSettingsCardComponent } from '../components/planning/article-settings-card.component';
import { MonthPlanComponent } from '../components/planning/month-plan.component';
import { MODE_FLAGS, type AutomationMode } from '../utils/automation-mode';
import type { AutomationHealth, AutomationPolicy, AutomationRecoveryReport, AutomationStatus, PublishingAccount, PublishingWindow, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-automation-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, ArticleSettingsCardComponent, MonthPlanComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Configuración · Automatización</p>
          <h1 class="au-page__title">Automatización editorial</h1>
          <p class="au-page__subtitle">Configura quién toma cada decisión, el ritmo de producción y los límites de seguridad.</p>
        </div>
        <div class="au-page__actions" *ngIf="isAdmin">
          <button
            class="au-btn"
            [class.au-btn--danger]="policy?.state === 'active'"
            [class.au-btn--primary]="policy?.state !== 'active'"
            type="button"
            (click)="togglePause()"
            [disabled]="!policy || siteChanged || saving || pausing"
          >
            <app-icon [name]="policy && policy.state !== 'active' ? 'play' : 'pause'"></app-icon>
            {{ policy && policy.state !== 'active' ? 'Reanudar automatización' : 'Pausar automatización' }}
          </button>
        </div>
      </header>

      <div class="au-banner au-banner--warning" *ngIf="siteChanged" role="alert">
        <span class="au-banner__text">El sitio activo ha cambiado. Este formulario aún contiene la configuración de {{ siteName }}. Vuelve a ese sitio para seguir editando, o carga el sitio activo y descarta estos cambios.</span>
        <button class="au-btn" type="button" [disabled]="saving || recovering || pausing" (click)="loadActiveSite()">Cargar sitio activo</button>
      </div>
      <div class="au-banner au-banner--warning" *ngIf="feedback" role="alert"><span class="au-banner__text">{{ feedback }}</span><button class="au-btn" *ngIf="!policy" type="button" (click)="load()">Reintentar</button></div>
      <div class="au-status workspace-banner" *ngIf="status && !siteChanged">
        <span class="au-badge au-badge--neutral" *ngIf="savedMode" aria-label="Modo de automatización actual">{{ { manual: 'Manual', assisted: 'Asistido', autopilot: 'Autopilot' }[savedMode] }}</span>
        <span class="au-badge" [class.au-badge--success]="status.enabled" [class.au-badge--neutral]="!status.enabled">
          {{ status.enabled ? 'Habilitada' : 'Deshabilitada' }}
        </span>
        <span class="au-badge" [class.au-badge--danger]="status.state === 'paused'" [class.au-badge--success]="status.state === 'active'" [class.au-badge--warning]="status.state !== 'paused' && status.state !== 'active'">
          {{ { active: 'Activa', paused: 'En pausa' }[status.state] ?? status.state }}
        </span>
        <span class="au-status__reason" *ngIf="status.pausedReason">{{ status.pausedReason }}</span>
        <span class="au-status__counts">
          Hoy: {{ status.today.articlesPlanned }}/{{ status.limits.articlesPerDay }} artículos
        </span>
      </div>

      <div class="auto-kpis" *ngIf="status && !siteChanged">
        <div class="auto-kpi"><span>Modo actual</span><strong>{{ { manual: 'Manual', assisted: 'Asistido', autopilot: 'Autopilot' }[savedMode ?? 'manual'] }}</strong><small>{{ status.enabled ? 'Habilitada' : 'Deshabilitada' }}</small></div>
        <div class="auto-kpi"><span>Estado</span><strong>{{ { active: 'Activa', paused: 'En pausa' }[status.state] ?? status.state }}</strong><small>Sitio actual</small></div>
        <div class="auto-kpi"><span>Hoy</span><strong>{{ status.today.articlesPlanned }}/{{ status.limits.articlesPerDay }}</strong><small>Artículos planificados</small></div>
        <div class="auto-kpi"><span>Próximo artículo</span><strong>{{ nextPlanned?.scheduledFor ? dateLabel(nextPlanned!.scheduledFor!) : '—' }}</strong><small>{{ nextPlanned?.keyword ?? 'Nada planificado' }}</small></div>
      </div>

      <div class="au-banner au-banner--info" *ngIf="!isAdmin">
        <app-icon name="lock"></app-icon>
        <span class="au-banner__text">Necesitas el permiso workspace.manage para cambiar la automatización. Puedes revisar la configuración actual.</span>
      </div>

      <div class="au-banner au-banner--warning" *ngIf="isAdmin && health && (health.degraded || !health.redisConfigured)">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">El procesamiento en segundo plano está degradado, así que el trabajo programado puede retrasarse.</span>
        <a class="au-banner__action" routerLink="/studio/operations">Abrir Salud del sistema</a>
      </div>

      <div class="au-banner au-banner--warning" *ngFor="let warning of status?.warnings ?? []">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ warning }}</span>
      </div>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="policy" [hidden]="!showTab('mode')">
        <h2 class="au-panel__title">General</h2>
        <p class="au-panel__subtitle au-mb-3">Dónde se aplica la política y sus ajustes básicos.</p>
        <fieldset [disabled]="!isAdmin || saving || siteChanged" style="border:0;padding:0;margin:0"><div class="au-field-grid">
          <label class="au-field">
            <span class="au-field__label">Sitio</span>
            <input class="au-input" type="text" [value]="siteName" readonly aria-readonly="true" />
            <span class="au-field__hint">La política del sitio activo. Cámbialo en la barra superior.</span>
          </label>
          <label class="au-field">
            <span class="au-field__label">Zona horaria</span>
            <input class="au-input" type="text" [(ngModel)]="policy.timezone" placeholder="Europe/Madrid" />
          </label>
          <label class="au-checkbox au-mt-4">
            <input type="checkbox" [(ngModel)]="policy.enabled" />
            Automatización habilitada
          </label>
        </div></fieldset>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="policy" [hidden]="!showTab('mode')">
        <h2 class="au-panel__title">Modo de producción</h2>
        <p class="au-panel__subtitle au-mb-3">Un único modo decide todo el flujo. Los modos son atómicos: nunca se guardan combinaciones contradictorias de ajustes.</p>
        <p class="au-hint" *ngIf="policy.mode !== savedMode">El modo seleccionado aún no se ha guardado. El estado actual de arriba es el vigente.</p>
        <div class="au-automation-modes" role="radiogroup" aria-label="Modo de producción">
          <button class="au-mode" [class.is-active]="policy.mode === 'manual' || !policy.mode" [disabled]="!isAdmin || saving || siteChanged" role="radio" [attr.aria-checked]="policy.mode === 'manual' || !policy.mode" type="button" (click)="setMode('manual')">
            <strong>Manual</strong>
            <span>Sin generación, aprobación ni publicación autónomas. Tú lo haces todo.</span>
          </button>
          <button class="au-mode" [class.is-active]="policy.mode === 'assisted'" [disabled]="!isAdmin || saving || siteChanged" role="radio" [attr.aria-checked]="policy.mode === 'assisted'" type="button" (click)="setMode('assisted')">
            <strong>Asistido</strong>
            <span>Redacta y repara borradores; tú apruebas antes de que se publique nada.</span>
          </button>
          <button class="au-mode au-mode--warning" [class.is-active]="policy.mode === 'autopilot'" [disabled]="!isAdmin || saving || siteChanged" role="radio" [attr.aria-checked]="policy.mode === 'autopilot'" type="button" (click)="setMode('autopilot')">
            <strong>Autopilot</strong>
            <span>Redacta, aprueba, programa y publica solo los artículos que superan la puerta de calidad; el resto va a revisión.</span>
          </button>
        </div>

        <div class="au-banner au-banner--info mode-detail" *ngIf="policy.mode === 'autopilot'">
          <div class="au-banner__text">
            <strong>Qué hará Autopilot en {{ siteName }}</strong>
            <ol class="mode-steps">
              <li>Revisa de forma periódica el plan editorial y las fuentes del sitio web.</li>
              <li>{{ status?.pipeline?.leadMinutes ?? 60 }} minutos antes de la hora de cada elemento del plan, lo aprueba y redacta el artículo con su imagen de portada (hasta {{ policy.articlesPerDay }} al día).</li>
              <li>Plan por palabras clave (flujo principal): mantiene planificados los próximos 30 días. Investiga palabras clave con datos reales, elige las mejores para tu sitio y las reparte en los huecos libres. En <a routerLink="/studio/automation" [queryParams]="{ tab: 'plan' }">Plan del mes</a> ves por qué eligió cada una y puedes cambiarla hasta que empieza la redacción.</li>
              <li>Fuentes de noticias (flujo complementario): si el sitio tiene fuentes activas, elige noticias candidatas (puntuación mínima {{ policy.minimumStoryScore }}, últimas 72 h, aún no cubiertas) y redacta un artículo por cada una, respetando la cola máxima de {{ policy.maximumQueueSize }}.</li>
              <li>Pasa el control de calidad estricto y repara los fallos automáticamente (hasta {{ policy.maxRepairAttempts }} intentos).</li>
              <li>Solo si supera la puerta de calidad autónoma (QA mínimo {{ status?.pipeline?.minQaScore ?? 90 }}, portada lista, sin avisos de prioridad alta): lo aprueba, lo programa en el hueco de su hora (nunca antes) y lo publica en el sitio.</li>
              <li>Si no la supera, <strong>no publica</strong>: lo deja en la Cola de revisión para que lo revise una persona.</li>
              <li>Se detiene y te avisa si fallan publicaciones seguidas (cortacircuitos).</li>
            </ol>
            <p class="mode-note">No publica en X ni en Instagram (aún sin conectar) y no modifica artículos ya publicados.</p>
          </div>
        </div>
        <div class="au-banner au-banner--warning mode-detail" *ngIf="policy.mode === 'assisted'">
          <div class="au-banner__text">
            <strong>Qué hará el modo asistido</strong>
            <ol class="mode-steps">
              <li>Redacta los artículos del plan por palabras clave (y las noticias de fuentes activas) {{ status?.pipeline?.leadMinutes ?? 60 }} minutos antes de su hora, con imagen de portada, y repara los fallos de calidad.</li>
              <li>Deja cada artículo listo para que tú lo apruebes.</li>
              <li>Nunca aprueba, programa ni publica por su cuenta.</li>
            </ol>
          </div>
        </div>
        <div class="au-banner au-banner--info mode-detail" *ngIf="policy.mode === 'manual'">
          <span class="au-banner__text">En modo manual no se redacta, aprueba ni publica nada de forma autónoma: lo haces todo tú.</span>
        </div>
        <div class="au-banner au-banner--warning mode-detail" *ngIf="policy.mode !== 'manual' && savedMode !== 'manual' && status?.pipeline as p">
          <div class="au-banner__text">
            <strong>Qué está pasando ahora</strong>
            <ul class="mode-steps">
              <li>Elementos del plan por redactar: {{ p.planDueNow }} ahora y {{ p.planUpcoming }} con hora futura.</li>
              <li>Artículos esperando tu revisión (no superaron la puerta de calidad): {{ p.awaitingReview }}. <a routerLink="/studio/review-queue">Abrir Cola de revisión</a></li>
              <li>Fuentes activas: {{ p.activeSources }} · noticias candidatas: {{ p.candidateStories }}. <a routerLink="/studio/sources">Abrir Fuentes</a></li>
            </ul>
            <strong class="mode-sub">Plan por palabras clave</strong>
            <ul class="mode-steps">
              <li *ngFor="let item of p.keywordPlan.upcoming">{{ item.keyword }} · {{ item.scheduledFor ? dateLabel(item.scheduledFor) : 'sin fecha' }} · {{ item.searchVolume !== null ? item.searchVolume + ' búsquedas/mes' : 'sin volumen' }}</li>
              <li *ngIf="!p.keywordPlan.upcoming.length">No hay palabras clave planificadas con fecha futura.</li>
              <li>Volumen medido en {{ p.keywordPlan.withVolume }} de los elementos próximos{{ p.keywordPlan.metricsProvider ? '' : ' (el proveedor de palabras clave no está configurado: el volumen no se actualiza)' }}. <a routerLink="/studio/automation" [queryParams]="{ tab: 'plan' }">Ver el plan del mes</a> · <a routerLink="/studio/calendar">Añadir palabras clave</a></li>
            </ul>
            <p class="mode-note" *ngIf="p.planDueNow === 0 && p.candidateStories === 0">Ahora no toca redactar nada. El siguiente artículo empieza {{ p.leadMinutes }} minutos antes de su hora; si el mes está vacío, complétalo en <a routerLink="/studio/automation" [queryParams]="{ tab: 'plan' }">Plan del mes</a>.</p>
          </div>
        </div>

        <button *ngIf="!selectedTab" class="au-btn au-btn--ghost au-btn--sm au-mt-2" type="button" (click)="advancedOpen = !advancedOpen" [attr.aria-expanded]="advancedOpen">
          <app-icon [name]="advancedOpen ? 'chevron-up' : 'chevron-down'"></app-icon>
          {{ advancedOpen ? 'Ocultar controles avanzados' : 'Controles avanzados' }}
        </button>
      </section>

      <app-month-plan *ngIf="selectedSiteId && !siteChanged && showTab('plan')" [siteId]="selectedSiteId"></app-month-plan>

      <app-article-settings-card *ngIf="selectedSiteId && !siteChanged" [hidden]="!showTab('schedule')" [siteId]="selectedSiteId"></app-article-settings-card>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="policy" [hidden]="!showTab('schedule')">
        <h2 class="au-panel__title">Ritmo de publicación</h2>
        <fieldset [disabled]="!isAdmin || saving || siteChanged" style="border:0;padding:0;margin:0">
        <h3 class="au-panel__title au-mt-4 au-mb-2">Volumen diario</h3>
        <div class="au-field-grid">
          <label class="au-field"><span class="au-field__label">Artículos / día</span><input class="au-input" type="number" min="0" max="20" [(ngModel)]="policy.articlesPerDay" /></label>
          <label class="au-field"><span class="au-field__label">Máx. artículos / día (seguridad)</span><input class="au-input" type="number" min="0" max="20" [(ngModel)]="policy.maxArticlesPerDay" /></label>
          <label class="au-field"><span class="au-field__label">Mín. minutos entre artículos</span><input class="au-input" type="number" min="15" [(ngModel)]="policy.minimumMinutesBetweenArticles" /></label>
        </div>

        <h3 class="au-panel__title au-mt-4 au-mb-1">Días activos</h3>
        <p class="au-hint au-mb-2">Límite de la automatización: no publica en los días sin marcar, aunque el calendario tenga huecos.</p>
        <div class="auto-days">
          <label class="auto-day" *ngFor="let i of weekOrder"><input type="checkbox" [checked]="!policy.activeDaysOfWeek || policy.activeDaysOfWeek.includes(i)" (change)="toggleActiveDay(i)"><span>{{ weekdays[i] }}</span></label>
        </div>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Ventanas de publicación</h3>
        <p class="au-hint au-mb-2">Los artículos solo se publican dentro de estas ventanas y en los días marcados de cada una.</p>
        <ng-container *ngFor="let window of policy.publishingWindows ?? []; let i = index"><div class="au-window-row" *ngIf="window.channel === 'website'">
          <strong class="auto-window-channel">Sitio web</strong>
          <input class="au-input" style="max-width: 90px" type="text" [(ngModel)]="window.from" placeholder="08:00" aria-label="Desde" />
          <span class="au-muted">→</span>
          <input class="au-input" style="max-width: 90px" type="text" [(ngModel)]="window.to" placeholder="20:00" aria-label="Hasta" />
          <span class="auto-days" role="group" aria-label="Días de la ventana">
              <label class="auto-day" *ngFor="let day of weekOrder"><input type="checkbox" [checked]="window.days.includes(day)" (change)="toggleDay(window, day)"><span>{{ weekdays[day] }}</span></label>
            </span>
          <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="removeWindow(i)">Quitar</button>
        </div></ng-container>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="addWindow()">
          <app-icon name="plus"></app-icon>
          Añadir ventana
        </button>

        </fieldset>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="policy && (advancedOpen || selectedTab === 'safety')" [hidden]="!showTab('safety')">
        <h2 class="au-panel__title">Controles avanzados</h2>
        <p class="au-panel__subtitle au-mb-3">Límites de seguridad, calidad y recuperación.</p>
        <fieldset [disabled]="!isAdmin || saving || siteChanged" style="border:0;padding:0;margin:0">
        <h3 class="au-panel__title au-mt-4 au-mb-1">Indicadores del flujo</h3>
        <p class="au-hint au-mb-2">Los cuatro primeros los decide el modo de trabajo (solo lectura); cámbialos eligiendo otro modo.</p>
        <div class="au-field-grid">
          <label class="au-checkbox"><input type="checkbox" disabled [(ngModel)]="policy.autoGenerate" /> Generar artículos automáticamente</label>
          <label class="au-checkbox"><input type="checkbox" disabled [(ngModel)]="policy.autoApprove" /> Aprobar automáticamente si pasa el control de calidad</label>
          <label class="au-checkbox"><input type="checkbox" disabled [(ngModel)]="policy.autoSchedule" /> Programar automáticamente</label>
          <label class="au-checkbox"><input type="checkbox" disabled [(ngModel)]="policy.autoPublish" /> Publicar automáticamente al llegar la hora</label>
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.imageRequired" /> Exigir imagen</label>
        </div>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Calidad y autorreparación</h3>
        <div class="au-field-grid">
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.autoRepair" /> Reparar automáticamente los fallos de calidad (reparación dirigida)</label>
          <label class="au-field"><span class="au-field__label">Máx. intentos de reparación</span><input class="au-input" type="number" min="0" max="10" [(ngModel)]="policy.maxRepairAttempts" /></label>
          <label class="au-field"><span class="au-field__label">Fallos de publicación consecutivos (actual)</span><input class="au-input" type="number" readonly [ngModel]="policy.consecutivePublishFailures" /></label>
        </div>
        <label class="au-field au-mt-2">
          <span class="au-field__label">Umbrales de calidad autónoma (JSON)</span>
          <textarea class="au-input" rows="7" [(ngModel)]="qaThresholdsText" placeholder='{ "overallQualityScore": 90, "evidenceScore": 85 }'></textarea>
        </label>
        <p class="au-hint">Por defecto: global, estructura, edición y SEO ≥ 90, evidencia ≥ 85, cero errores bloqueantes y cero avisos de prioridad alta sin resolver. El contenido comercial de alto valor puede subirlos.</p>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Selección de candidatos</h3>
        <div class="au-field-grid">
          <label class="au-field"><span class="au-field__label">Puntuación mínima de la historia</span><input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="policy.minimumStoryScore" /></label>
          <label class="au-field"><span class="au-field__label">Categorías (incluir, separadas por comas)</span><input class="au-input" type="text" [ngModel]="categoriesText" (ngModelChange)="categoriesText = $event" /></label>
          <label class="au-field"><span class="au-field__label">Categorías excluidas</span><input class="au-input" type="text" [ngModel]="excludedCategoriesText" (ngModelChange)="excludedCategoriesText = $event" /></label>
          <label class="au-field"><span class="au-field__label">Temas prioritarios (separados por comas)</span><input class="au-input" type="text" [ngModel]="priorityTopicsText" (ngModelChange)="priorityTopicsText = $event" /></label>
        </div>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Límites de seguridad</h3>
        <div class="au-field-grid">
          <label class="au-field"><span class="au-field__label">Máx. cola pendiente</span><input class="au-input" type="number" min="1" [(ngModel)]="policy.maximumQueueSize" /></label>
          <label class="au-field"><span class="au-field__label">Artículos / hora</span><input class="au-input" type="number" min="1" [(ngModel)]="policy.articlesPerHour" /></label>
        </div>
        </fieldset>
      </section>

      <!-- Outside the advanced panel so a mode change can be saved without opening it. -->
      <div class="au-form__actions au-mb-3" *ngIf="policy && isAdmin && selectedTab !== 'plan'">
        <button class="au-btn au-btn--primary" type="button" (click)="save()" [disabled]="saving || siteChanged">{{ saving ? 'Guardando…' : 'Guardar política de automatización' }}</button>
      </div>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="!siteChanged && nextSlots.length > 0" [hidden]="!showTab('schedule')">
        <h2 class="au-panel__title">Próximos huecos planificados</h2>
        <p class="au-panel__subtitle au-mb-2">Vista previa de la política en {{ status?.timezone }}. Las publicaciones programadas aparecen en Calendario.</p>
        <div class="au-slots">
          <span class="au-badge au-badge--neutral" *ngFor="let slot of nextSlots">{{ dateLabel(slot.at) }}</span>
        </div>
      </section>

      <section class="au-panel au-panel--padded" *ngIf="isAdmin" [hidden]="!showTab('safety')">
        <h2 class="au-panel__title">Recuperar contenido automático atascado</h2>
        <p class="au-panel__subtitle au-mb-2">Repara, aprueba y reprograma automáticamente los proyectos AUTOPILOT atascados en calidad bloqueada, listos para revisión o con publicación fallida. Los proyectos manuales nunca se tocan.</p>
        <div class="au-form__actions">
          <button class="au-btn au-btn--secondary" type="button" (click)="runRecovery(true)" [disabled]="recovering || siteChanged">
            <app-icon name="eye"></app-icon>
            Simulacro
          </button>
          <button class="au-btn au-btn--primary" type="button" (click)="runRecovery(false)" [disabled]="recovering || siteChanged">
            <app-icon name="refresh"></app-icon>
            {{ recovering ? 'Recuperando…' : 'Recuperar ahora' }}
          </button>
        </div>
        <div class="au-banner au-banner--info" *ngIf="recoveryReport">
          <span class="au-banner__text">
            {{ recoveryReport.dryRun ? 'Simulacro:' : 'Recuperación:' }}
            analizados {{ recoveryReport.scanned }} · elegibles {{ recoveryReport.eligible }} · actuados {{ recoveryReport.acted }}
            <span *ngIf="recoveryReport.items.length > 0">· último: {{ recoveryReport.items[0].projectId.slice(0, 8) }} → {{ recoveryReport.items[0].action }} ({{ recoveryReport.items[0].result }})</span>
          </span>
        </div>
      </section>

      <section class="au-panel au-panel--padded" [hidden]="!showTab('schedule')">
        <h2 class="au-panel__title">Redes sociales</h2>
        <p class="au-panel__subtitle">La automatización publica ahora artículos en tu sitio web. La cadencia de X e Instagram se configurará cuando conectes esas cuentas.</p>
        <a class="au-btn au-btn--secondary au-mt-2" routerLink="/studio/connections">Ir a Conexiones</a>
      </section>
    </section>
  `,
  styles: [`
    .auto-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .auto-kpi { display: grid; gap: 2px; padding: 14px 16px; border: 1px solid var(--au-border); border-radius: 14px; background: var(--au-surface-solid); }
    .auto-kpi span, .auto-kpi small { color: var(--au-muted); font-size: 12px; }
    .auto-kpi strong { font-size: 22px; line-height: 1.3; }
    .auto-window-channel { min-width: 90px; }
    .mode-steps { margin: 6px 0 0; padding-left: 20px; display: grid; gap: 4px; }
    .mode-note { margin: 8px 0 0; }
    .mode-sub { display: block; margin-top: 12px; }
    .mode-detail { margin-top: 12px; }
    h3.au-panel__title { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--au-border); font-size: 15px; }
    h3.au-panel__title:first-of-type { margin-top: 12px; }
    .auto-days { display: flex; flex-wrap: wrap; gap: 6px; }
    .auto-day { position: relative; display: inline-flex; }
    .auto-day input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
    .auto-day span { min-width: 46px; padding: 7px 10px; border: 1px solid var(--au-border); border-radius: 999px; background: var(--au-surface-solid); color: var(--au-muted); font-size: 12px; font-weight: 600; text-align: center; }
    .auto-day input:checked + span { border-color: var(--au-brand); background: var(--au-surface-selected); color: var(--au-brand); }
    .auto-day input:focus-visible + span { outline: 2px solid var(--au-brand); outline-offset: 2px; }
    .au-window-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; padding: 10px 12px; border: 1px solid var(--au-border); border-radius: 12px; background: var(--au-table-head); }
  `],
})
export class AutomationPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  get selectedTab(): string | null {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    return tab && ['mode', 'plan', 'schedule', 'safety'].includes(tab) ? tab : null;
  }
  showTab(tab: string): boolean { return !this.selectedTab || this.selectedTab === tab; }
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  policy: AutomationPolicy | null = null;
  status: AutomationStatus | null = null;
  accounts: PublishingAccount[] = [];
  sites: StudioSite[] = [];
  /** The active site policy; the shell re-creates the page when the site changes. */
  selectedSiteId: string | null = this.appContext.activeSite()?.id ?? null;
  siteName = this.appContext.activeSite()?.name ?? '';
  categoriesText = '';
  excludedCategoriesText = '';
  priorityTopicsText = '';
  qaThresholdsText = '';
  advancedOpen = false;
  /** Mirrors the API rule: changing automation needs workspace.manage (owner/admin). */
  get isAdmin(): boolean { return this.appContext.permissions().includes('workspace.manage'); }
  savedMode: AutomationMode | null = null;
  readonly weekOrder = [1, 2, 3, 4, 5, 6, 0];
  readonly weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  health: AutomationHealth | null = null;
  recovering = false;
  pausing = false;
  recoveryReport: AutomationRecoveryReport | null = null;
  saving = false;
  feedback = '';
  private refreshSubscription: Subscription | null = null;

  get siteChanged(): boolean { return (this.appContext.activeSite()?.id ?? null) !== this.selectedSiteId; }

  loadActiveSite(): void {
    if (this.saving || this.recovering || this.pausing) return;
    this.selectedSiteId = this.appContext.activeSite()?.id ?? null;
    this.siteName = this.appContext.activeSite()?.name ?? '';
    this.policy = null; this.status = null; this.feedback = '';
    this.load();
  }

  get nextPlanned() { return this.status?.pipeline?.keywordPlan?.upcoming?.[0]; }

  get nextSlots(): Array<{ channel: string; at: string }> {
    return (this.status?.nextSlots ?? []).filter((slot) => slot.channel === 'website');
  }

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.load();
    this.refreshSubscription = timer(45_000, 45_000).subscribe(() => {
      if (!document.hidden) {
        this.loadStatus();
      }
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  load(): void {
    const siteId = this.selectedSiteId;
    this.api.getAutomationPolicy(siteId ?? undefined).subscribe({
      next: (policy) => {
        if (siteId !== this.selectedSiteId) return;
        this.policy = policy;
        this.savedMode = policy.mode;
        this.feedback = '';
        this.categoriesText = (policy.categories ?? []).join(', ');
        this.excludedCategoriesText = (policy.excludedCategories ?? []).join(', ');
        this.priorityTopicsText = (policy.priorityTopics ?? []).join(', ');
        this.qaThresholdsText = policy.autonomousQaThresholds
          ? JSON.stringify(policy.autonomousQaThresholds, null, 2)
          : '';
        this.loadStatus();
      },
      error: () => {
        if (siteId === this.selectedSiteId) this.feedback = 'No se pudo cargar la política de automatización.';
      },
    });
    this.api.listPublishingAccounts().subscribe({
      next: (response) => {
        this.accounts = response.items.filter((account) => account.platform !== 'website');
      },
    });
    if (this.isAdmin) this.loadHealth();
  }

  loadHealth(): void {
    this.api.getAutomationHealth().subscribe({
      next: (health) => {
        this.health = health;
      },
      error: () => undefined,
    });
  }

  loadStatus(): void {
    const siteId = this.selectedSiteId;
    this.api.getAutomationStatus(siteId ?? undefined).subscribe({
      next: (status) => {
        if (siteId !== this.selectedSiteId) return;
        this.status = status;
      },
      error: () => undefined,
    });
  }

  setMode(mode: AutomationMode): void {
    if (!this.policy || !this.isAdmin || this.saving || this.siteChanged) return;
    Object.assign(this.policy, MODE_FLAGS[mode], { mode });
  }

  save(): void {
    if (!this.policy || !this.isAdmin || this.saving || this.siteChanged) return;
    let thresholds: Record<string, unknown> | null;
    try { thresholds = parseJsonField(this.qaThresholdsText); }
    catch { this.feedback = 'Los umbrales de calidad deben ser un objeto JSON válido.'; return; }
    this.feedback = '';
    this.saving = true;
    this.api
      .updateAutomationPolicy({        siteId: this.selectedSiteId ?? null,
        enabled: this.policy.enabled,
        timezone: this.policy.timezone,
        articlesPerDay: this.policy.articlesPerDay,
        maxArticlesPerDay: this.policy.maxArticlesPerDay,
        xPostsPerDay: this.policy.xPostsPerDay,
        instagramPostsPerDay: this.policy.instagramPostsPerDay,
        minimumMinutesBetweenArticles: this.policy.minimumMinutesBetweenArticles,
        ...(this.policy.mode !== this.savedMode ? { mode: this.policy.mode } : {}),
        autoRepair: this.policy.autoRepair,
        maxRepairAttempts: this.policy.maxRepairAttempts,
        autonomousQaThresholds: thresholds,
        sourceRequirements: this.policy.sourceRequirements,
        minimumStoryScore: this.policy.minimumStoryScore,
        categories: this.categoriesText.split(',').map((item) => item.trim()).filter(Boolean),
        excludedCategories: this.excludedCategoriesText.split(',').map((item) => item.trim()).filter(Boolean),
        priorityTopics: this.priorityTopicsText.split(',').map((item) => item.trim()).filter(Boolean),
        imageRequired: this.policy.imageRequired,
        socialRequired: this.policy.socialRequired,
        maximumQueueSize: this.policy.maximumQueueSize,
        articlesPerHour: this.policy.articlesPerHour,
        socialPostsPerHour: this.policy.socialPostsPerHour,
        maximumDailySocial: this.policy.maximumDailySocial,
        socialTimingMinutesX: this.policy.socialTimingMinutesX,
        socialTimingMinutesInstagram: this.policy.socialTimingMinutesInstagram,
        publishingWindows: this.policy.publishingWindows ?? [],
        ...(this.policy.activeDaysOfWeek !== null ? { activeDaysOfWeek: this.policy.activeDaysOfWeek } : {}),
      })
      .subscribe({
        next: (policy) => {
          this.saving = false;
          this.policy = policy;
          this.savedMode = policy.mode;
          this.categoriesText = (policy.categories ?? []).join(', ');
          this.excludedCategoriesText = (policy.excludedCategories ?? []).join(', ');
          this.priorityTopicsText = (policy.priorityTopics ?? []).join(', ');
          this.qaThresholdsText = policy.autonomousQaThresholds ? JSON.stringify(policy.autonomousQaThresholds, null, 2) : '';
          this.toast.success('Política de automatización guardada.');
          this.loadStatus();
        },
        error: (error) => {
          this.saving = false;
          this.feedback = String(error?.error?.message ?? 'No se pudo guardar la política.');
        },
      });
  }

  togglePause(): void {
    void this.confirmTogglePause();
  }

  private async confirmTogglePause(): Promise<void> {
    if (!this.isAdmin || this.saving || this.siteChanged) return;
    const siteId = this.selectedSiteId;
    const target = this.policy && this.policy.state !== 'active' ? 'resume' : 'pause';
    if (target === 'pause') {
      const confirmed = await this.confirm.confirm({
        title: '¿Pausar la automatización?',
        message: 'No se crearán ni programarán nuevas publicaciones automáticas. Los trabajos en curso no se interrumpen.',
        confirmLabel: 'Pausar automatización',
        danger: true,
      });
      if (!confirmed) {
        return;
      }
    }
    if (this.siteChanged || siteId !== this.selectedSiteId || !this.isAdmin) return;
    this.pausing = true;
    const request = target === 'pause'
      ? this.api.pauseAutomation('paused_manually', this.selectedSiteId ?? undefined)
      : this.api.resumeAutomation(this.selectedSiteId ?? undefined);
    request.subscribe({
      next: (policy) => {
        this.pausing = false;
        if (this.policy) { this.policy.state = policy.state; this.policy.pausedReason = policy.pausedReason; }
        this.toast.success(target === 'pause' ? 'Automatización pausada.' : 'Automatización reanudada.');
        this.loadStatus();
      },
      error: (error) => {
        this.pausing = false;
        this.feedback = String(error?.error?.message ?? 'La operación ha fallado.');
      },
    });
  }

  toggleActiveDay(day: number): void {
    if (!this.policy) return;
    const days = this.policy.activeDaysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
    this.policy.activeDaysOfWeek = days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort();
  }

  addWindow(): void {
    this.policy?.publishingWindows?.push({ channel: 'website', days: [0, 1, 2, 3, 4, 5, 6], from: '08:00', to: '20:00' });
  }

  removeWindow(index: number): void {
    this.policy?.publishingWindows?.splice(index, 1);
  }

  toggleDay(window: PublishingWindow, day: number): void {
    if (window.days.includes(day)) {
      window.days = window.days.filter((entry) => entry !== day);
    } else {
      window.days = [...window.days, day].sort();
    }
  }

  verify(account: PublishingAccount): void {
    this.api.verifyPublishingAccount(account.id).subscribe({
      next: (result) => {
        if (result.ok) {
          this.toast.success(result.message || 'Cuenta verificada.');
        } else {
          this.toast.error(result.message || 'La verificación ha fallado.');
        }
        this.api.listPublishingAccounts().subscribe({ next: (response) => { this.accounts = response.items.filter((item) => item.platform !== 'website'); } });
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'La verificación ha fallado.');
      },
    });
  }

  dateLabel(value: string): string {
    return new Date(value).toLocaleString('es-ES', { timeZone: this.status?.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async runRecovery(dryRun: boolean): Promise<void> {
    if (!this.isAdmin || this.siteChanged || this.recovering) return;
    const siteId = this.selectedSiteId;
    if (!dryRun && !await this.confirm.confirm({
      title: '¿Recuperar contenido automático?',
      message: 'Los proyectos Autopilot elegibles de este sitio pueden repararse, aprobarse o reprogramarse.',
      confirmLabel: 'Ejecutar recuperación',
      danger: true,
    })) return;
    if (this.siteChanged || siteId !== this.selectedSiteId || this.recovering) return;
    this.recovering = true;
    this.api
      .recoverAutomation({ siteId: this.selectedSiteId, dryRun })
      .subscribe({
        next: (report) => {
          this.recovering = false;
          this.recoveryReport = report;
          if (dryRun) {
            this.toast.success(`Simulacro completado: ${report.scanned} analizados, ${report.eligible} elegibles.`);
          } else {
            this.toast.success(`Recuperación terminada: ${report.acted} acciones aplicadas.`);
          }
          this.loadStatus();
        },
        error: (error) => {
          this.recovering = false;
          this.feedback = String(error?.error?.message ?? 'La recuperación ha fallado.');
        },
      });
  }
}

function parseJsonField(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Se esperaba un objeto');
  return parsed as Record<string, unknown>;
}
