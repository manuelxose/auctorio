import { CommonModule, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { OnboardingTimelineComponent } from '../components/intelligence/onboarding-timeline.component';
import { IntelligenceApiService } from '../services/intelligence-api.service';
import { EditorialContextService } from '../services/editorial-context.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { sectionFor } from '../layout/studio-nav';
import type { ClusterCoverage, Provenance, StrategyConfig, StrategyField, StrategyLayers, StrategyPillar, StrategyVersion } from '../models/intelligence.models';
import type { SiteIndexedPageRow, SiteIntelligenceOverview, StudioSite } from '../models/studio.models';

registerLocaleData(localeEs);

const PROFILE_FIELDS: StrategyField[] = ['description', 'primaryAudience', 'markets', 'languages', 'writingStyle', 'preferredFormats', 'searchIntents', 'sourcePolicy'];

const FIELDS: Array<{ key: StrategyField; label: string; kind: 'text' | 'list' }> = [
  { key: 'description', label: 'Descripción del proyecto', kind: 'text' },
  { key: 'primaryAudience', label: 'Audiencia principal', kind: 'text' },
  { key: 'languages', label: 'Idiomas', kind: 'list' },
  { key: 'markets', label: 'Mercados', kind: 'list' },
  { key: 'priorityCategories', label: 'Categorías prioritarias', kind: 'list' },
  { key: 'excludedTopics', label: 'Temas excluidos', kind: 'list' },
  { key: 'writingStyle', label: 'Estilo y tono', kind: 'text' },
  { key: 'preferredFormats', label: 'Formatos preferidos', kind: 'list' },
  { key: 'searchIntents', label: 'Objetivos de búsqueda', kind: 'list' },
  { key: 'seoObjectives', label: 'Objetivos SEO', kind: 'list' },
  { key: 'sourcePolicy', label: 'Política de fuentes', kind: 'text' },
  { key: 'cadenceNotes', label: 'Notas sobre la frecuencia', kind: 'text' },
  { key: 'editorialRestrictions', label: 'Restricciones', kind: 'list' },
  { key: 'internalLinkingRules', label: 'Reglas de enlaces internos', kind: 'list' },
];

const SEO_LABELS: Record<string, { name: string; type: string; action: string }> = {
  missing_meta_description: { name: 'Falta la metadescripción', type: 'Metadatos', action: 'Revisa la descripción de cada página afectada.' },
  missing_h1: { name: 'Falta el encabezado H1', type: 'Estructura', action: 'Comprueba si la plantilla de la página muestra su título principal.' },
  thin_content: { name: 'Contenido de menos de 300 palabras', type: 'Contenido', action: 'Comprueba si cada página cubre su propósito editorial.' },
  no_structured_data: { name: 'Sin datos estructurados JSON-LD', type: 'Marcado', action: 'Revisa si la página necesita datos estructurados.' },
  canonical_differs: { name: 'La canónica apunta a otra URL', type: 'Canonicalización', action: 'Comprueba que la URL de destino es la que quieres consolidar.' },
};

@Component({
  selector: 'app-site-intelligence-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, OnboardingTimelineComponent],
  styleUrls: ['./site-intelligence-profile.css', './site-intelligence-sections.css'],
  template: `
    <section class="au-page">
      <header class="profile-reference">
        <div class="page-head">
          <div>
            <p class="overline">Auctorio / Herramientas avanzadas</p>
            <h1>Conocimiento del sitio</h1>
            <p>Qué sabe Auctorio del sitio, con qué evidencia y cómo influye en sus contenidos.</p>
          </div>
          <div class="head-actions">
            <button class="btn small" type="button" [disabled]="loading" (click)="load()"><app-icon name="refresh"></app-icon> Actualizar datos</button>
            <button class="btn small primary" type="button" [disabled]="busy" (click)="indexSite()"><app-icon name="scan"></app-icon> {{ busy ? 'Leyendo el sitio…' : 'Leer el sitio' }}</button>
          </div>
        </div>
      </header>
      <div class="au-banner au-banner--error" *ngIf="loadError" role="alert">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <div class="au-banner au-banner--warning au-mb-3" *ngIf="overview?.profile?.warnings?.length">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ overview?.profile?.warnings?.join(' · ') }}</span>
      </div>

      <div class="profile-reference" *ngIf="tab === 'seo'">
        <div class="section-note"><app-icon name="info"></app-icon><span><strong>Señales del inventario propio.</strong> Las cifras corresponden a páginas analizadas por Auctorio. La indexación y las posiciones se consultan en Search Console.</span></div>
        <dl class="kpis" aria-label="Métricas SEO">
          <div class="kpi"><dt class="top"><app-icon name="warning"></app-icon>Señales abiertas</dt><dd class="number">{{ seoOpenCount }}</dd><dd class="foot">Agrupadas por causa</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="content"></app-icon>Páginas inventariadas</dt><dd class="number">{{ (overview?.totalPages ?? 0) | number }}</dd><dd class="foot">Inventario del sitio</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="activity"></app-icon>Señales de alcance alto</dt><dd class="number">{{ seoHighCount }}</dd><dd class="foot">Al menos la mitad de la muestra</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="globe"></app-icon>Search Console</dt><dd class="number">—</dd><dd class="foot">Datos fuera de este informe</dd></div>
        </dl>
        <div class="stack">
          <section class="card">
            <div class="card-header"><div><h2>Salud SEO y mejoras</h2><p>Consulta la muestra de páginas afectadas por cada señal</p></div>
              <button class="btn small primary" type="button" [disabled]="loading" (click)="load()"><app-icon name="refresh"></app-icon>Comprobar señales</button>
            </div>
            <form class="filter-bar" (ngSubmit)="seoQuery = seoSearch">
              <label class="search"><app-icon name="search"></app-icon><input class="input" type="search" name="seoSearch" aria-label="Buscar señal SEO" placeholder="Buscar señal SEO…" [(ngModel)]="seoSearch" /></label>
              <select class="input filter-select" name="seoImpact" aria-label="Alcance en la muestra" [(ngModel)]="seoImpact">
                <option value="">Todos los alcances</option><option value="Alto">Alto</option><option value="Medio">Medio</option><option value="Bajo">Bajo</option>
              </select>
              <button class="btn small" type="submit">Filtrar</button>
            </form>
            <div class="table-wrap" role="region" aria-label="Señales SEO del sitio" tabindex="0" *ngIf="filteredSeoSignals.length; else noSeo">
              <table class="table">
                <thead><tr><th>Señal</th><th>Tipo</th><th>Páginas afectadas</th><th>Alcance</th><th><span class="au-visually-hidden">Acción</span></th></tr></thead>
                <tbody>
                  <ng-container *ngFor="let signal of filteredSeoSignals; trackBy: seoSignalKey">
                    <tr>
                      <td><strong>{{ signal.name }}</strong></td><td>{{ signal.type }}</td><td>{{ signal.count }} / {{ signal.of }}</td>
                      <td><span class="badge" [class.danger]="signal.reach === 'Alto'" [class.warning]="signal.reach === 'Medio'">{{ signal.reach }}</span></td>
                      <td class="actions"><button class="btn small" type="button" [attr.aria-expanded]="openSeoSignal === signal.id" (click)="openSeoSignal = openSeoSignal === signal.id ? null : signal.id">Inspeccionar</button></td>
                    </tr>
                    <tr *ngIf="openSeoSignal === signal.id"><td colspan="5"><p>{{ signal.action }}</p><ul *ngIf="signal.samples.length"><li *ngFor="let url of signal.samples"><a [href]="url" target="_blank" rel="noopener">{{ url }}</a></li></ul></td></tr>
                  </ng-container>
                </tbody>
              </table>
            </div>
            <ng-template #noSeo><p class="profile-muted">{{ overview?.seoSignals?.[0]?.of ? 'Ninguna señal coincide con los filtros.' : 'Lee el sitio para obtener señales SEO.' }}</p></ng-template>
          </section>
          <section class="card">
            <div class="card-header"><div><h2>Qué no debe duplicarse</h2><p>SEO para el contenido frente a SEO técnico</p></div></div>
            <div class="grid2">
              <div class="callout"><h3>Señales de sitio</h3><p>Consulta aquí el inventario, las causas y las páginas afectadas.</p></div>
              <div class="callout"><h3>SEO de un artículo</h3><p>El slug, los metadatos y los enlaces se corrigen en el editor del artículo.</p></div>
            </div>
          </section>
        </div>
      </div>

      <div class="profile-reference" *ngIf="tab === 'profile' && (overview || draft)">
        <div class="split">
          <div class="stack">
            <section class="card" *ngIf="overview as data" aria-labelledby="site-profile-identity">
              <div class="card-header">
                <div><h2 id="site-profile-identity">Identidad detectada</h2><p>Conclusiones del último análisis · solo lectura</p></div>
                <span class="badge ok" *ngIf="data.profile"><app-icon name="check"></app-icon> Información del sitio</span>
              </div>
              <ng-container *ngIf="data.profile as p; else missingIdentity">
                <div class="callout success"><h3>{{ data.site.name }}</h3><p>{{ p.brandSummary || 'Aún no hay un resumen del sitio.' }}</p></div>
                <div class="split-stats">
                  <div class="split-stat"><b>{{ data.totalPages | number }}</b><small>Páginas inventariadas</small></div>
                  <div class="split-stat"><b>{{ p.confidence !== null ? (p.confidence * 100 | number:'1.0-0') + '%' : '—' }}</b><small>Confianza de perfil</small></div>
                  <div class="split-stat"><b>{{ (p.indexedAt || data.lastRun | date:'d MMM':undefined:'es') || '—' }}</b><small>Última lectura</small></div>
                </div>
                <dl class="metrics">
                  <div class="metric-line"><dt class="metric-label">Público detectado</dt><dd>{{ p.detectedAudience || '—' }}</dd></div>
                  <div class="metric-line"><dt class="metric-label">Idioma principal</dt><dd>{{ p.detectedLanguage || '—' }}</dd></div>
                  <div class="metric-line"><dt class="metric-label">Temas principales</dt><dd>{{ p.mainTopics.join(', ') || '—' }}</dd></div>
                </dl>
                <details class="profile-extra">
                  <summary>Más datos detectados</summary>
                  <dl class="metrics">
                    <div class="metric-line"><dt class="metric-label">Tono</dt><dd>{{ p.editorialTone || '—' }}</dd></div>
                    <div class="metric-line"><dt class="metric-label">Tipo de sitio</dt><dd>{{ p.detectedSiteType || '—' }}</dd></div>
                    <div class="metric-line"><dt class="metric-label">Longitud habitual</dt><dd>{{ p.commonArticleLength ? p.commonArticleLength + ' palabras' : '—' }}</dd></div>
                    <div class="metric-line" *ngFor="let group of topicGroups"><dt class="metric-label">{{ group.label }}</dt><dd>{{ group.items.join(', ') }}</dd></div>
                  </dl>
                  <button class="btn small" type="button" [disabled]="busy" (click)="crawlChanged()">Leer cambios</button>
                </details>
              </ng-container>
              <ng-template #missingIdentity>
                <p>Lee el sitio para obtener un perfil a partir de sus páginas.</p>
                <button class="btn small" type="button" [disabled]="busy" (click)="crawlChanged()">Leer cambios</button>
              </ng-template>
            </section>

            <section class="card" *ngIf="draft" aria-labelledby="site-profile-strategy">
              <div class="card-header">
                <div><h2 id="site-profile-strategy">{{ layers?.approved ? 'Estrategia editorial aprobada' : 'Estrategia editorial' }}</h2><p>Campos que guían la planificación y la redacción</p></div>
                <span class="badge purple">Configurable</span>
              </div>
              <form class="stack" (ngSubmit)="save()">
                <div class="fields">
                  <label class="profile-field" *ngFor="let field of profileFields">
                    <span>{{ field.label }}</span>
                    <input class="input" type="text" [name]="field.key" [ngModel]="field.kind === 'list' ? csv(draft[field.key]) : draft[field.key] ?? ''" (ngModelChange)="field.kind === 'list' ? setList(field.key, $event) : setText(field.key, $event)" />
                  </label>
                </div>
                <label class="profile-field">
                  <span>Restricciones editoriales</span>
                  <textarea class="textarea" rows="2" name="editorialRestrictions" [ngModel]="csv(draft.editorialRestrictions)" (ngModelChange)="setList('editorialRestrictions', $event)"></textarea>
                </label>
                <div class="form-footer">
                  <span class="badge" [class.ok]="layers?.approved" [class.warning]="!layers?.approved">{{ layers?.approved ? 'Versión ' + layers?.approved?.version : 'Pendiente de aprobación' }}</span>
                  <button class="btn primary" type="submit" [disabled]="saving"><app-icon name="check"></app-icon>{{ saving ? 'Guardando…' : 'Guardar nueva versión' }}</button>
                  <button class="btn ghost" type="button" [disabled]="saving" (click)="resetDraft()">Deshacer cambios</button>
                </div>
                <details class="profile-extra">
                  <summary>Más ajustes de estrategia</summary>
                  <div class="fields">
                    <label class="profile-field" *ngFor="let field of additionalFields">
                      <span>{{ field.label }} <small>{{ sourceLabel(field.key) }}</small></span>
                      <textarea class="textarea" [name]="field.key" rows="2" [ngModel]="field.kind === 'list' ? csv(draft[field.key]) : draft[field.key] ?? ''" (ngModelChange)="field.kind === 'list' ? setList(field.key, $event) : setText(field.key, $event)"></textarea>
                    </label>
                    <label class="profile-field"><span>Nota de versión</span><input class="input" type="text" name="note" [(ngModel)]="note" /></label>
                  </div>
                  <button class="btn small" type="button" [disabled]="saving" (click)="regenerate()">Actualizar sugerencias</button>
                </details>
                <p class="au-error" role="alert" *ngIf="strategyError">{{ strategyError }}</p>
              </form>
            </section>
          </div>

          <aside class="stack" aria-label="Historial y evidencia del sitio">
            <section class="card" aria-labelledby="site-profile-related">
              <div class="card-header"><div><h2 id="site-profile-related">Qué conservar aquí</h2><p>Configuración con un único responsable</p></div></div>
              <dl class="metrics">
                <div class="metric-line"><dt class="metric-label">Voz y longitud de los artículos</dt><dd><a routerLink="/studio/settings/writing">Ajustes de escritura <app-icon name="external"></app-icon></a></dd></div>
                <div class="metric-line"><dt class="metric-label">Frecuencia y modos</dt><dd><a routerLink="/studio/automation">Modo y ritmo <app-icon name="external"></app-icon></a></dd></div>
                <div class="metric-line"><dt class="metric-label">Fuentes individuales</dt><dd><a class="btn small ghost" routerLink="/studio/sources">Fuentes</a></dd></div>
                <div class="metric-line"><dt class="metric-label">Mercados y audiencia</dt><dd>Esta estrategia</dd></div>
              </dl>
              <p class="section-note"><app-icon name="info"></app-icon><span>Los valores detectados no se sobrescriben al guardar. Las ediciones crean una versión aprobada separada.</span></p>
            </section>

            <section class="card" *ngIf="selectedSiteId" aria-labelledby="site-profile-history">
              <div class="card-header"><div><h2 id="site-profile-history">Historial de estrategia</h2><p>Control de cambios y restauración</p></div></div>
              <p class="profile-muted" *ngIf="versionsLoading">Cargando versiones…</p>
              <p class="profile-muted" *ngIf="!versionsLoading && !versionsError && !versions.length">Aún no hay versiones guardadas.</p>
              <p class="au-error" role="alert" *ngIf="versionsError">{{ versionsError }}</p>
              <ul class="timeline">
                <li *ngFor="let version of versions">
                  <strong>Versión {{ version.version }}</strong><small>{{ version.createdAt | date:'d MMM y':undefined:'es' }}</small>
                  {{ version.note }}<span *ngIf="version.restoredFromVersion"> · Restaurada desde v{{ version.restoredFromVersion }}</span>
                  <details>
                    <summary class="btn small ghost">Ver o restaurar</summary>
                    <p *ngIf="version.config.description">{{ version.config.description }}</p>
                    <button class="btn small" type="button" [disabled]="saving" (click)="restore(version.version)">Restaurar</button>
                  </details>
                </li>
              </ul>
            </section>

            <section class="card" *ngIf="overview as data" aria-labelledby="site-profile-evidence">
              <div class="card-header">
                <div><h2 id="site-profile-evidence">Origen de las conclusiones</h2><p>No ocultar incertidumbre</p></div>
                <a class="btn small" routerLink="." [queryParams]="{ tab: 'crawl' }">Abrir páginas rastreadas</a>
              </div>
              <dl class="metrics">
                <div class="metric-line"><dt class="metric-label">Evidencia</dt><dd>{{ data.extractedPages }} / {{ data.totalPages }} páginas analizadas</dd></div>
                <div class="metric-line"><dt class="metric-label">Prueba de indexación Google</dt><dd>Sin datos verificados</dd></div>
                <div class="metric-line"><dt class="metric-label">Última confirmación humana</dt><dd>{{ layers?.approved ? 'Confirmada' : 'Pendiente' }}</dd></div>
              </dl>
              <details class="profile-extra">
                <summary>Más datos del rastreo</summary>
                <dl class="metrics">
                  <div class="metric-line"><dt class="metric-label">Grupos temáticos detectados</dt><dd>{{ data.profile?.topicClusters?.length ?? 0 }}</dd></div>
                  <div class="metric-line"><dt class="metric-label">Sitemaps leídos</dt><dd>{{ healthySitemaps }} / {{ data.sitemaps.length }}</dd></div>
                  <div class="metric-line"><dt class="metric-label">Último análisis</dt><dd>{{ (data.lastRun | date:'short') || '—' }}</dd></div>
                </dl>
                <a class="btn small ghost" routerLink="." [queryParams]="{ tab: 'pillars' }">Ver brechas</a>
              </details>
            </section>
          </aside>
        </div>
      </div>

      <div class="profile-reference stack" *ngIf="tab === 'pillars'">
        <dl class="kpis" aria-label="Métricas de pilares">
          <div class="kpi"><dt class="top"><app-icon name="layers"></app-icon>Pilares activos</dt><dd class="number">{{ activePillarCount }}</dd><dd class="foot">Guían el plan editorial</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="content"></app-icon>Páginas asignadas</dt><dd class="number">{{ pillarPageTotal | number }}</dd><dd class="foot">Suma por pilares</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="search"></app-icon>Brechas detectadas</dt><dd class="number">{{ overview?.opportunities?.length ?? 0 }}</dd><dd class="foot">Requieren validación humana</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="check"></app-icon>Última estrategia</dt><dd class="number">{{ layers?.approved ? 'v' + layers?.approved?.version : '—' }}</dd><dd class="foot">Versionada y editable</dd></div>
        </dl>
        <section class="card" *ngIf="draft as strategy">
          <div class="card-header">
            <div><h2>Pilares de contenido</h2><p>Temas e intención editorial que guían el plan</p></div>
            <button class="btn small primary" type="button" (click)="addPillar()"><app-icon name="plus"></app-icon>Añadir pilar</button>
          </div>
          <div class="pillars">
            <article class="pillar" *ngFor="let p of strategy.pillars; let i = index">
              <div class="pillar-h">
                <div><h3>{{ p.name || 'Nuevo pilar' }}</h3><p *ngIf="p.description">{{ p.description }}</p></div>
                <span class="badge" [class.ok]="p.included" [class.warning]="!p.included">{{ p.included ? 'En el plan' : 'Excluido' }}</span>
              </div>
              <div class="meter" role="meter" aria-label="Cuota del plan" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="p.included ? share(p) : 0"><span [style.width.%]="p.included ? share(p) : 0"></span></div>
              <div class="pillar-foot"><span>{{ pillarPages(p) }} páginas · {{ p.included ? share(p) : 0 }} % del plan</span><strong>{{ pillarGaps(p) }} brechas</strong></div>
              <div class="tag-list" *ngIf="p.subtopics.length || p.keywords.length"><span *ngFor="let topic of p.subtopics.length ? p.subtopics : p.keywords">{{ topic }}</span></div>
              <div class="form-footer">
                <button class="btn small" type="button" [attr.aria-expanded]="editingPillar === p" (click)="editingPillar = editingPillar === p ? null : p">Editar pilar</button>
                <button class="btn small ghost" type="button" (click)="p.included = !p.included">{{ p.included ? 'Excluir' : 'Incluir' }}</button>
                <button class="btn small ghost" type="button" (click)="investigate(p)" [disabled]="!p.clusterSlug">Ver brechas</button>
              </div>
              <div class="profile-extra" *ngIf="editingPillar === p">
                <div class="fields">
                  <label class="profile-field"><span>Nombre</span><input class="input" type="text" [(ngModel)]="p.name" /></label>
                  <label class="profile-field"><span>Peso en el plan</span><input class="input" type="number" min="0" max="10" step="0.1" [(ngModel)]="p.weight" [disabled]="!p.included" /></label>
                  <label class="profile-field"><span>Descripción</span><textarea class="textarea" rows="2" [(ngModel)]="p.description"></textarea></label>
                  <label class="profile-field"><span>Subtemas separados por comas</span><textarea class="textarea" rows="2" [ngModel]="csv(p.subtopics)" (ngModelChange)="p.subtopics = split($event)"></textarea></label>
                </div>
                <div class="form-footer">
                  <span class="badge">{{ pillarLabel(i) }}</span>
                  <a class="btn small" routerLink="/studio/plan" [queryParams]="{ pillar: p.name }">Generar propuestas</a>
                  <button class="btn small ghost" type="button" (click)="removePillar(i)">Eliminar pilar</button>
                </div>
              </div>
              <div class="profile-extra" *ngIf="coverage && coverageFor === p.clusterSlug">
                <strong>{{ coverage.cluster.pagesCount }} páginas del sitio</strong>
                <ul><li *ngFor="let c of coverage.coverage">{{ c.subtopic }}: {{ c.pagesCovering }} páginas</li></ul>
                <p *ngIf="coverage.gaps.length">Brechas: {{ coverage.gaps.join(', ') }}</p>
                <p *ngIf="!coverage.gaps.length && coverage.coverage.length">No se encontraron brechas en los subtemas.</p>
                <ul><li *ngFor="let pg of coverage.pages.slice(0, 8)"><a [href]="pg.url" target="_blank" rel="noopener">{{ pg.title || pg.url }}</a></li></ul>
              </div>
            </article>
          </div>
          <p class="profile-muted" *ngIf="!strategy.pillars.length">Lee el sitio para detectar temas o añade un pilar.</p>
          <details class="profile-extra" *ngIf="unlinkedClusters.length">
            <summary>Otros temas detectados</summary>
            <button class="btn small ghost" type="button" *ngFor="let c of unlinkedClusters" (click)="addPillar(c.name, c.slug, c.keywords)">+ {{ c.name }}</button>
          </details>
          <div class="form-footer">
            <button class="btn primary" type="button" [disabled]="saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar nueva versión' }}</button>
            <button class="btn ghost" type="button" [disabled]="saving" (click)="resetDraft()">Deshacer cambios</button>
          </div>
          <p class="au-error" *ngIf="strategyError" role="alert">{{ strategyError }}</p>
        </section>
        <section class="card">
          <div class="card-header"><div><h2>Brechas que merecen investigación</h2><p>Oportunidades inferidas del inventario propio</p></div></div>
          <ul class="row-list" *ngIf="overview?.opportunities?.length; else noGaps">
            <li *ngFor="let gap of overview?.opportunities">
              <div class="row-main"><span class="row-icon"><app-icon name="sparkles"></app-icon></span><div><strong class="row-title">{{ gap.subtopic }}</strong><p class="row-desc">{{ gap.pillar }} · {{ gap.pagesRead }} páginas analizadas · Confianza {{ confidenceLabels[gap.confidence] }}</p></div></div>
              <a class="btn primary small" routerLink="/studio/plan" [queryParams]="{ pillar: gap.pillar }">Enviar al plan</a>
            </li>
          </ul>
          <ng-template #noGaps><p class="profile-muted">{{ overview?.opportunitiesBasis === 'detected-keywords' ? 'Añade subtemas a los pilares para poder detectar brechas.' : 'No se encontraron brechas en las páginas analizadas.' }}</p></ng-template>
        </section>
      </div>

      <div class="profile-reference" *ngIf="tab === 'crawl' && overview as data">
        <div class="section-note"><app-icon name="info"></app-icon><span>El rastreo descubre y analiza páginas. <strong>La indexación en Google se consulta en Search Console.</strong></span></div>
        <dl class="kpis" aria-label="Métricas de rastreo">
          <div class="kpi"><dt class="top"><app-icon name="globe"></app-icon>Sitemaps</dt><dd class="number">{{ data.sitemaps.length }}</dd><dd class="foot">{{ healthySitemaps }} leídos</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="content"></app-icon>Páginas descubiertas</dt><dd class="number">{{ data.totalPages | number }}</dd><dd class="foot">Inventario del sitio</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="check"></app-icon>Páginas analizadas</dt><dd class="number">{{ data.extractedPages | number }}</dd><dd class="foot">Extracción propia</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="warning"></app-icon>Fallos de lectura</dt><dd class="number">{{ data.evidence?.failed ?? data.pageStates['failed'] ?? 0 }}</dd><dd class="foot">Revisar antes del próximo ciclo</dd></div>
        </dl>
        <div class="split">
          <div class="stack">
            <section class="card">
              <div class="card-header">
                <div><h2>Sitemaps encontrados</h2><p>Estado de lectura e inventario</p></div>
                <button class="btn small primary" type="button" [disabled]="busy" (click)="indexSite()"><app-icon name="refresh"></app-icon>Nueva lectura</button>
              </div>
              <div class="table-wrap" role="region" aria-label="Sitemaps encontrados" tabindex="0" *ngIf="data.sitemaps.length; else noSitemaps">
                <table class="table sitemap-table">
                  <thead><tr><th>Sitemap</th><th>Tipo</th><th>URLs</th><th>Estado</th></tr></thead>
                  <tbody><tr *ngFor="let sitemap of data.sitemaps">
                    <td><strong>{{ sitemap.url }}</strong><div class="smtext" *ngIf="sitemap.lastFetchedAt">{{ sitemap.lastFetchedAt | date:'d MMM, HH:mm':undefined:'es' }}</div></td>
                    <td>{{ sitemap.kind === 'index' ? 'Índice' : sitemap.kind }}</td><td>{{ sitemap.urlCount ?? '—' }}</td>
                    <td><span class="badge" [class.ok]="sitemap.status === 'fetched'" [class.warning]="sitemap.status !== 'fetched'">{{ sitemap.status === 'fetched' ? 'Correcto' : sitemap.status === 'failed' || sitemap.status === 'blocked' ? 'Revisión' : sitemap.status }}</span><div class="smtext" *ngIf="sitemap.error">{{ sitemap.error }}</div></td>
                  </tr></tbody>
                </table>
              </div>
              <ng-template #noSitemaps><p class="profile-muted">Aún no se han encontrado sitemaps.</p></ng-template>
            </section>

            <section class="card">
              <div class="card-header"><div><h2>Inventario de páginas</h2><p>Búsqueda y filtros por estado de extracción</p></div></div>
              <form class="filter-bar" (ngSubmit)="applyPageFilters()">
                <label class="search"><app-icon name="search"></app-icon><input class="input" type="search" name="pageQuery" placeholder="Buscar URL o título…" aria-label="Buscar URL o título" [(ngModel)]="pageQuery" /></label>
                <select class="input filter-select" name="pageCrawlState" aria-label="Estado de extracción" [(ngModel)]="pageCrawlState" (ngModelChange)="applyPageFilters()">
                  <option value="">Todos los estados</option><option value="extracted">Analizada</option><option value="failed">Fallida</option><option value="stale">Desactualizada</option>
                  <option value="discovered">Descubierta</option><option value="skipped">Omitida</option>
                </select>
                <button class="btn small" type="submit">Filtrar</button>
              </form>
              <div class="table-wrap" role="region" aria-label="Páginas del inventario" tabindex="0" *ngIf="pages.length; else noPages">
                <table class="table">
                  <thead><tr><th>URL / título</th><th>Tipo</th><th>Palabras</th><th>Estado</th><th><span class="au-visually-hidden">Acción</span></th></tr></thead>
                  <tbody>
                    <ng-container *ngFor="let item of pages">
                      <tr>
                        <td><strong>{{ item.title || 'Sin título' }}</strong><div class="smtext">{{ item.url }}</div></td>
                        <td>{{ item.contentType || '—' }}</td><td>{{ item.wordCount ?? '—' }}</td>
                        <td><span class="badge" [class.ok]="item.crawlState === 'extracted'" [class.danger]="item.crawlState === 'failed'" [class.warning]="item.crawlState === 'stale'">{{ crawlStateLabels[item.crawlState] || item.crawlState }}</span></td>
                        <td class="actions"><button class="btn small" type="button" [attr.aria-expanded]="openPageId === item.id" (click)="openPageId = openPageId === item.id ? null : item.id">Ver</button></td>
                      </tr>
                      <tr *ngIf="openPageId === item.id"><td colspan="5">
                        <p>Último intento de rastreo · {{ (item.lastIndexedAt | date:'d MMM y, HH:mm':undefined:'es') || 'Sin registro' }}</p>
                        <p *ngIf="item.modifiedAt">Última modificación · {{ item.modifiedAt | date:'d MMM y, HH:mm':undefined:'es' }}</p>
                        <a [href]="item.url" target="_blank" rel="noopener">{{ item.url }}</a>
                      </td></tr>
                    </ng-container>
                  </tbody>
                </table>
              </div>
              <ng-template #noPages><p class="profile-muted">{{ pagesLoading ? 'Cargando inventario…' : 'Ninguna página coincide con los filtros.' }}</p></ng-template>
              <p class="au-error" role="alert" *ngIf="pagesError">{{ pagesError }}</p>
              <div class="form-footer" *ngIf="pagesTotal > 25">
                <button class="btn small" type="button" [disabled]="page <= 1 || pagesLoading" (click)="goPage(page - 1)">Anterior</button>
                <span class="profile-muted">Página {{ page }}</span>
                <button class="btn small" type="button" [disabled]="page * 25 >= pagesTotal || pagesLoading" (click)="goPage(page + 1)">Siguiente</button>
              </div>
            </section>
          </div>
          <aside class="stack" aria-label="Ejecución y errores de rastreo">
            <section class="card">
              <div class="card-header"><div><h2>Última ejecución de setup</h2><p>El proceso inicial configura la evidencia editorial</p></div>
                <a class="btn small" routerLink="/studio/activity">Ver trabajos</a>
              </div>
              <app-onboarding-timeline *ngIf="selectedSiteId" [siteId]="selectedSiteId" [allowStart]="true" [embedded]="true"></app-onboarding-timeline>
            </section>
            <section class="card">
              <div class="card-header"><div><h2>Tratamiento de errores</h2><p>Estado de lectura y siguientes pasos</p></div></div>
              <div class="callout" [class.warn]="(data.evidence?.failed ?? data.pageStates['failed'] ?? 0) > 0">
                <h3>{{ (data.evidence?.failed ?? data.pageStates['failed'] ?? 0) }} URLs con fallos de extracción</h3><p>Consulta las operaciones del sitio para revisar su causa.</p>
              </div>
              <div class="form-footer">
                <a class="btn small" routerLink="/studio/activity" [queryParams]="{ tab: 'failed' }">Inspeccionar operaciones</a>
                <button class="btn small ghost" type="button" [disabled]="busy" (click)="crawlChanged()">Leer cambios</button>
              </div>
              <details class="profile-extra" *ngIf="data.evidence as evidence">
                <summary>Cobertura por sección</summary>
                <p>{{ evidence.fetched }} consultadas · {{ evidence.skipped }} omitidas</p>
                <div class="table-wrap" role="region" aria-label="Cobertura por sección" tabindex="0">
                  <table class="table sitemap-table">
                    <thead><tr><th>Sección</th><th>Analizadas</th><th>Descubiertas</th></tr></thead>
                    <tbody><tr *ngFor="let section of evidence.sections"><td>/{{ section.family === '/' ? '' : section.family }}</td><td>{{ section.extracted }}</td><td>{{ section.discovered }}</td></tr></tbody>
                  </table>
                </div>
              </details>
            </section>
          </aside>
        </div>
      </div>

      <app-empty-state
        *ngIf="!loading && !overview && !loadError"
        icon="scan"
        title="No site intelligence yet"
        text="Leer el sitio completo to crawl its sitemaps, understand its content and build the site profile."
      ></app-empty-state>
    </section>
  `,
})
export class SiteIntelligencePageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly intel = inject(IntelligenceApiService);
  private readonly editorialContext = inject(EditorialContextService);
  readonly profileFields = PROFILE_FIELDS.map((key) => FIELDS.find((field) => field.key === key)!);
  readonly additionalFields = FIELDS.filter((field) => !PROFILE_FIELDS.includes(field.key) && field.key !== 'editorialRestrictions');
  // ?tab= picks the section (sidebar sub-items); old tab ids still deep-link to the section that absorbed them.
  tab = 'profile';
  private readonly router = inject(Router);
  private readonly tabSub = inject(ActivatedRoute, { optional: true })?.queryParamMap.subscribe((query) => {
    const legacy: Record<string, string> = { onboarding: 'crawl', health: 'crawl', inventory: 'crawl', coverage: 'crawl', opportunities: 'pillars' };
    const renamed = legacy[query.get('tab') ?? ''];
    // Rewrite the URL so the sidebar highlights the same section.
    if (renamed) void this.router.navigate([], { queryParams: { tab: renamed }, queryParamsHandling: 'merge', replaceUrl: true });
    this.tab = sectionFor('/studio/site-intelligence', renamed ?? query.get('tab'));
  });
  layers: StrategyLayers | null = null;
  draft: StrategyConfig | null = null;
  versions: StrategyVersion[] = [];
  versionsLoading = false;
  versionsError = '';
  note = '';
  saving = false;
  strategyError = '';
  coverage: ClusterCoverage | null = null;
  coverageFor: string | null = null;
  editingPillar: StrategyPillar | null = null;
  readonly confidenceLabels = { low: 'baja', medium: 'media', high: 'alta' };

  get activePillarCount(): number {
    return this.draft?.pillars.filter((pillar) => pillar.included).length ?? 0;
  }

  get pillarPageTotal(): number {
    return this.draft?.pillars.reduce((total, pillar) => total + this.pillarPages(pillar), 0) ?? 0;
  }

  pillarPages(pillar: StrategyPillar): number {
    return this.layers?.detected?.clusters.find((cluster) => cluster.slug === pillar.clusterSlug)?.pagesCount ?? 0;
  }

  pillarGaps(pillar: StrategyPillar): number {
    return this.overview?.opportunities?.filter((gap) => gap.pillar === pillar.name).length ?? 0;
  }

  csv(value: unknown): string {
    return Array.isArray(value) ? value.join(', ') : '';
  }
  split(text: string): string[] {
    return text.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
  }
  setText(key: StrategyField, value: string): void {
    (this.draft as unknown as Record<string, unknown>)[key] = value.trim() ? value : null;
  }
  setList(key: StrategyField, value: string): void {
    (this.draft as unknown as Record<string, unknown>)[key] = this.split(value);
  }
  source(key: StrategyField): string {
    const p = this.layers?.provenance[key];
    return !p || p === 'none' ? 'none' : p;
  }
  sourceLabel(key: StrategyField): string {
    const s = this.source(key);
    return s === 'approved' ? 'Aprobado' : s === 'suggested' ? 'Del sitio' : 'Vacío';
  }
  pillarLabel(i: number): string {
    const p: Provenance | undefined = this.layers?.pillarProvenance?.[i];
    return p === 'approved' ? 'Aprobado' : p === 'suggested' ? 'Del sitio' : 'Sin guardar';
  }
  /** Plans split articles by weight among included pillars (editorial-plan-context). */
  share(p: StrategyPillar): number {
    const total = (this.draft?.pillars ?? []).filter((x) => x.included).reduce((sum, x) => sum + (x.weight || 0), 0);
    return total ? Math.round(((p.weight || 0) / total) * 100) : 0;
  }
  get unlinkedClusters() {
    const linked = new Set((this.draft?.pillars ?? []).map((p) => p.clusterSlug));
    return (this.layers?.detected?.clusters ?? []).filter((c) => !linked.has(c.slug)).slice(0, 12);
  }

  loadStrategy(): void {
    this.layers = null;
    this.draft = null;
    this.coverage = null;
    if (!this.selectedSiteId) return;
    this.intel.getStrategy(this.selectedSiteId).subscribe({
      next: (layers) => this.applyLayers(layers),
      error: () => (this.strategyError = 'The editorial strategy could not be loaded.'),
    });
  }
  private applyLayers(layers: StrategyLayers): void {
    this.layers = layers;
    this.resetDraft();
  }
  resetDraft(): void {
    this.editingPillar = null;
    this.draft = this.layers ? structuredClone(this.layers.effective) : null;
    this.strategyError = '';
  }
  save(): void {
    if (!this.draft || this.saving) return;
    this.saving = true;
    this.strategyError = '';
    this.intel.saveStrategy(this.selectedSiteId, this.draft, this.note || undefined).subscribe({
      next: (res) => {
        this.saving = false;
        this.note = '';
        this.loadVersions();
        this.applyLayers(res.layers);
        if (this.tab === 'pillars') this.loadOverview();
        this.toast.success('Strategy saved as version ' + res.version + '.');
      },
      error: (err) => {
        this.saving = false;
        this.strategyError = err?.error?.error?.message || 'The strategy could not be saved.';
      },
    });
  }
  regenerate(): void {
    this.saving = true;
    this.intel.regenerateSuggestion(this.selectedSiteId).subscribe({
      next: (res) => {
        this.saving = false;
        this.applyLayers(res.layers);
        this.toast.success(res.generated ? 'Suggestions refreshed (' + res.source + '). Approved values were kept.' : 'No site profile yet; index the website first.');
      },
      error: () => {
        this.saving = false;
        this.strategyError = 'Suggestions could not be refreshed.';
      },
    });
  }
  loadVersions(): void {
    if (!this.selectedSiteId) return;
    this.versionsLoading = true;
    this.versionsError = '';
    this.intel.listVersions(this.selectedSiteId).subscribe({
      next: (response) => {
        this.versions = response.items;
        this.versionsLoading = false;
      },
      error: () => {
        this.versionsError = 'No se pudo cargar el historial.';
        this.versionsLoading = false;
      },
    });
  }
  restore(version: number): void {
    this.saving = true;
    this.intel.restoreVersion(this.selectedSiteId, version).subscribe({
      next: (res) => {
        this.saving = false;
        this.loadVersions();
        this.applyLayers(res.layers);
        this.toast.success('Restored version ' + version + ' as version ' + res.version + '.');
      },
      error: () => {
        this.saving = false;
        this.strategyError = 'That version could not be restored.';
      },
    });
  }
  addPillar(name = '', clusterSlug: string | null = null, keywords: string[] = []): void {
    const pillar: StrategyPillar = { name, description: null, subtopics: [], keywords, weight: 1, included: true, clusterSlug };
    this.draft?.pillars.push(pillar);
    this.editingPillar = pillar;
  }
  removePillar(i: number): void {
    if (this.editingPillar === this.draft?.pillars[i]) this.editingPillar = null;
    this.draft?.pillars.splice(i, 1);
  }
  investigate(p: StrategyPillar): void {
    if (!p.clusterSlug) return;
    const slug = p.clusterSlug;
    this.intel.getClusterCoverage(this.selectedSiteId, slug).subscribe({
      next: (c) => {
        this.coverage = c;
        this.coverageFor = slug;
      },
      error: () => this.toast.error('Coverage could not be loaded.'),
    });
  }
  /** Always the top bar active site; the shell re-creates the page when it changes. */
  selectedSiteId = '';
  overview: SiteIntelligenceOverview | null = null;
  loading = true;
  indexing = false;
  loadError = '';
  pages: SiteIndexedPageRow[] = [];
  seoSearch = '';
  seoQuery = '';
  seoImpact = '';
  openSeoSignal: string | null = null;

  get seoSignals() {
    return (this.overview?.seoSignals ?? []).filter((signal) => signal.of > 0).map((signal) => ({
      ...signal,
      ...(SEO_LABELS[signal.id] ?? { name: signal.label, type: 'Inventario', action: 'Revisa las páginas de la muestra.' }),
      reach: signal.count === 0 ? '—' : signal.count / signal.of >= .5 ? 'Alto' : signal.count / signal.of >= .1 ? 'Medio' : 'Bajo',
    }));
  }

  seoSignalKey(_index: number, signal: { id: string }): string { return signal.id; }

  get seoOpenCount(): number {
    return this.seoSignals.filter((signal) => signal.count > 0).length;
  }

  get seoHighCount(): number {
    return this.seoSignals.filter((signal) => signal.reach === 'Alto').length;
  }

  get filteredSeoSignals() {
    const search = this.seoQuery.trim().toLowerCase();
    return this.seoSignals.filter((signal) =>
      (!this.seoImpact || signal.reach === this.seoImpact) &&
      (!search || `${signal.name} ${signal.type}`.toLowerCase().includes(search)),
    );
  }
  pagesTotal = 0;
  page = 1;
  pageQuery = '';
  pageCrawlState = '';
  openPageId: string | null = null;
  pagesLoading = false;
  pagesError = '';
  private pagesRequest = 0;
  readonly crawlStateLabels: Record<string, string> = { extracted: 'Analizada', failed: 'Fallida', stale: 'Desactualizada', discovered: 'Descubierta', skipped: 'Omitida' };

  applyPageFilters(): void {
    this.page = 1;
    this.loadPages();
  }

  /** A crawl started here, or one already running server-side (e.g. from onboarding). */
  get busy(): boolean {
    return this.indexing || Boolean(this.overview?.indexing);
  }

  /** Only the topic groups the crawl actually filled; a TV guide has no "commercial" group to show. */
  get topicGroups(): Array<{ label: string; items: string[] }> {
    const p = this.overview?.profile;
    if (!p) return [];
    return [
      { label: 'Evergreen', items: p.evergreenTopics },
      { label: 'News', items: p.newsTopics },
      { label: 'Commercial', items: p.commercialTopics },
      { label: 'Sports', items: p.sportsTopics },
    ].filter((g) => g.items?.length);
  }

  get healthySitemaps(): number {
    return this.overview?.sitemaps.filter((sitemap) => sitemap.status === 'fetched').length ?? 0;
  }

  ngOnInit(): void {
    this.selectedSiteId = this.appContext.activeSite()?.id ?? '';
    this.load();
  }

  load(): void {
    if (!this.selectedSiteId) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.loadError = '';
    this.editorialContext.update({ area: 'intelligence', siteId: this.selectedSiteId });
    this.loadStrategy();
    this.loadVersions();
    this.loadOverview();
  }

  private loadOverview(): void {
    this.api.getSiteIntelligence(this.selectedSiteId).subscribe({
      next: (overview) => {
        this.overview = overview;
        this.indexing = false; // from here the server's overview.indexing tells whether the crawl still runs
        this.loading = false;
        this.loadPages();
      },
      error: () => {
        this.loadError = 'Site intelligence could not be loaded. Try again.';
        this.loading = false;
      },
    });
  }

  loadPages(): void {
    if (!this.selectedSiteId) return;
    const request = ++this.pagesRequest;
    this.pagesLoading = true;
    this.pagesError = '';
    this.openPageId = null;
    this.api.listSiteIntelligencePages(this.selectedSiteId, { q: this.pageQuery || undefined, crawlState: this.pageCrawlState || undefined, page: this.page, pageSize: 25 }).subscribe({
      next: (response) => {
        if (request !== this.pagesRequest) return;
        this.pagesLoading = false;
        this.pages = response.items;
        this.pagesTotal = response.total;
      },
      error: () => {
        if (request !== this.pagesRequest) return;
        this.pagesLoading = false;
        this.pagesError = 'No se pudo cargar el inventario.';
      },
    });
  }

  goPage(target: number): void {
    this.page = target;
    this.loadPages();
  }

  indexSite(): void {
    if (!this.selectedSiteId || this.indexing) return;
    this.indexing = true;
    this.api.indexSite(this.selectedSiteId, {}).subscribe({
      next: () => {
        this.toast.success('Site indexing started. The workspace stays responsive while it runs.');
        setTimeout(() => this.load(), 2500);
      },
      error: (err) => {
        this.indexing = false;
        this.loadError = err?.error?.error?.message || 'Indexing could not be started.';
      },
    });
  }

  crawlChanged(): void {
    if (!this.selectedSiteId || this.indexing) return;
    this.indexing = true;
    this.api.indexSite(this.selectedSiteId, { crawl: true, changedOnly: true }).subscribe({
      next: () => {
        this.toast.success('Changed-page crawl started.');
        setTimeout(() => this.load(), 2500);
      },
      error: (err) => {
        this.indexing = false;
        this.loadError = err?.error?.error?.message || 'Crawl could not be started.';
      },
    });
  }
}
