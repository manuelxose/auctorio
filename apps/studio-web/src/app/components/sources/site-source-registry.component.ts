import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { ConfirmService } from '../../services/confirm.service';
import { StudioApiService } from '../../services/studio-api.service';
import { EditorialContextService } from '../../services/editorial-context.service';
import { ToastService } from '../../services/toast.service';
import { AppEmptyStateComponent } from '../ui/app-empty-state.component';
import { AppIconComponent } from '../ui/app-icon.component';
import { SiteSource, SiteSourceRecommendation, SourceConfigPatchBody, SourceDiagnostics, SourceItemRow, SourceEvidenceRow, SourceTestResult, SourcesApiService } from '../../services/sources-api.service';

const list = (value: string): string[] => value.split(',').map((entry) => entry.trim()).filter(Boolean);

@Component({
  selector: 'app-site-source-registry',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent, RouterLink],
  styles: [
    `
      .reg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 12px; }
      .reg-recommendations .reg-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      @media (max-width: 1080px) { .reg-recommendations .reg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 760px) { .reg-recommendations .reg-grid { grid-template-columns: 1fr; } }
      .reg-card { border: 1px solid var(--au-border); border-radius: 12px; padding: var(--au-s3); background: var(--au-surface-solid); display: flex; flex-direction: column; gap: 8px; }
      .reg-card h3, .reg-table h3 { margin: 0; font-size: var(--au-fs-body); overflow-wrap: anywhere; }
      .reg-table { border: 1px solid var(--au-border); border-radius: 10px; }
      .reg-table table { min-width: 610px; }
      .reg-table .reg-actions { justify-content: flex-end; }
      .reg-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .reg-muted { color: var(--au-muted); font-size: var(--au-fs-body-sm); overflow-wrap: anywhere; }
      .reg-detail { border-top: 1px solid var(--au-border); padding-top: 8px; display: grid; gap: 8px; }
      .reg-detail ul { margin: 0; padding-left: 18px; }
      .reg-err { color: var(--au-danger); }
      .reg-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
    `,
  ],
  template: `
    <dl class="advanced-kpis" aria-label="Resumen de fuentes" *ngIf="section === 'sources' && sourcesLoaded()">
        <div class="au-stat">
          <dt class="au-stat__label">Fuentes configuradas</dt>
          <dd class="au-stat__value">{{ sources().length }}</dd>
          <dd class="au-stat__note">Por sitio y compartidas</dd>
        </div>
        <div class="au-stat advanced-stat--good">
          <dt class="au-stat__label">Activas</dt>
          <dd class="au-stat__value">{{ activeCount() }}</dd>
          <dd class="au-stat__note">Habilitadas para ingesta</dd>
        </div>
        <div class="au-stat advanced-stat--warning">
          <dt class="au-stat__label">Con errores</dt>
          <dd class="au-stat__value">{{ errorCount() }}</dd>
          <dd class="au-stat__note">Último resultado registrado</dd>
        </div>
        <div class="au-stat">
          <dt class="au-stat__label">Referencias recogidas</dt>
          <dd class="au-stat__value">{{ referenceCount() }}</dd>
          <dd class="au-stat__note">Elementos de las fuentes</dd>
        </div>
      </dl>

    <p class="workspace-banner" role="note"><app-icon name="info"></app-icon><span>
      <strong>Uso de las fuentes.</strong> Al aceptar una fuente, Auctorio puede leer sus títulos y enlaces como evidencia. La republicación requiere permiso.</span>
    </p>

    <ng-template #filters>
      <div class="au-toolbar advanced-filter-bar">
      <button *ngIf="section === 'recommendations'" class="au-btn au-btn--primary" type="button" [disabled]="busy()" (click)="discover()"><app-icon name="sparkles"></app-icon>{{ busy() ? 'Discovering...' : 'Discover sources' }}</button>
        <label class="au-search">
          <app-icon name="search"></app-icon>
          <input class="au-input au-input--search" type="search" placeholder="Nombre, URL o categoría…" aria-label="Filter sources" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        </label>
        <select *ngIf="section === 'sources'" class="au-select" aria-label="State" [ngModel]="state()" (ngModelChange)="state.set($event)">
          <option value="">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="paused">Pausadas</option>
          <option value="failed">Con error</option>
          <option value="archived">Archivadas</option>
        </select>
      <select *ngIf="section === 'recommendations'" class="au-select" aria-label="Relationship" [ngModel]="relationship()" (ngModelChange)="relationship.set($event)">
        <option value="">All relationships</option>
        <option value="first_party">First-party</option>
        <option value="external">External</option>
      </select>
      <select class="au-select" aria-label="Layout" [ngModel]="layout()" (ngModelChange)="layout.set($event)">
        <option value="cards">Tarjetas</option>
        <option value="list">{{ section === 'sources' ? 'Tabla' : 'Lista' }}</option>
      </select>
      </div>
    </ng-template>

    <!-- Recommendations: the site's own discovery plus workspace-wide web discovery, in one list. -->
    <section class="au-panel au-panel--padded au-mb-3 reg-recommendations" aria-labelledby="reg-rec" *ngIf="section === 'recommendations'">
      <div class="reg-row au-mb-2">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="reg-rec">Sugerencias para este sitio</h2><p>Revisa cada sugerencia antes de incorporarla.</p></div>
        <span class="au-toolbar__spacer"></span>
        <ng-container *ngIf="selected().size > 0">
          <span class="reg-muted">{{ selected().size }} selected</span>
          <button class="au-btn au-btn--sm au-btn--primary" type="button" (click)="bulk('accept')">Accept selected</button>
          <button class="au-btn au-btn--sm au-btn--secondary" type="button" (click)="bulk('reject')">Reject selected</button>
        </ng-container>
      </div>
      <ng-container *ngTemplateOutlet="filters"></ng-container>
      <app-empty-state *ngIf="openRecommendations().length === 0" icon="sources" title="No open recommendations" text="Run Discover sources to find first-party feeds and external sources for this site's topics."></app-empty-state>
      <div [class.reg-grid]="layout() === 'cards'" [style.display]="layout() === 'list' ? 'grid' : null" [style.gap]="layout() === 'list' ? '8px' : null">
        <article class="reg-card" *ngFor="let rec of openRecommendations(); trackBy: trackId">
          <div class="reg-row">
            <input type="checkbox" [attr.aria-label]="'Select ' + (rec.name || rec.domain)" [checked]="selected().has(rec.id)" (change)="toggle(rec.id)" />
            <h3>{{ rec.name || rec.domain }}</h3>
            <span class="au-badge" [ngClass]="rec.relationship === 'first_party' ? 'au-badge--brand' : 'au-badge--neutral'">{{ rec.relationship === 'first_party' ? 'First-party' : 'External' }}</span>
            <span class="au-badge au-badge--outline">{{ rec.type || 'feed' }}</span>
            <span class="au-badge au-badge--info" *ngIf="rec.shared" title="Found by workspace web discovery; accepting it creates a source shared by all sites">Shared</span>
          </div>
          <a class="reg-muted" [href]="rec.url" target="_blank" rel="noopener noreferrer">{{ rec.url }}</a>
          <div class="reg-row">
            <span class="au-badge" [ngClass]="rec.verificationStatus === 'verified' ? 'au-badge--success' : 'au-badge--warning'">{{ rec.verificationStatus || 'unverified' }}</span>
            <span class="au-badge au-badge--info" *ngIf="rec.trustLevel">Trust: {{ rec.trustLevel }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="rec.relevance">Relevance: {{ rec.relevance }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="rec.language">{{ rec.language }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="rec.geography">{{ rec.geography }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="rec.category">{{ rec.category }}</span>
          </div>
          <p class="reg-muted" *ngIf="rec.assessmentReason">{{ rec.assessmentReason }}</p>
          <div class="reg-row" *ngIf="rec.topics?.length"><span class="au-badge au-badge--outline" *ngFor="let t of rec.topics">{{ t }}</span></div>
          <p class="reg-muted" *ngIf="rec.expectedFreshness || rec.lastCheckedAt">
            Freshness: {{ rec.expectedFreshness || 'unknown' }} <span *ngIf="rec.lastCheckedAt"> - checked {{ rec.lastCheckedAt | date: 'medium' }}</span>
          </p>
          <ul class="reg-muted" *ngIf="rec.limitations?.length"><li *ngFor="let l of rec.limitations">{{ l }}</li></ul>
          <div class="reg-row">
            <button class="au-btn au-btn--sm au-btn--primary" type="button" (click)="decide(rec, 'accept')">Accept</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="decide(rec, 'reject')">Reject</button>
          </div>
        </article>
      </div>
    </section>

    <section class="au-panel au-panel--padded au-mb-3" *ngIf="section === 'recommendations'" aria-labelledby="reg-criteria">
      <div class="advanced-card-header"><h2 class="au-panel__title" id="reg-criteria">Criterios de recomendación</h2><p>Comprueba la relación con el sitio, la cobertura temática y el estado de verificación.</p></div>
      <div class="advanced-grid-2">
        <div class="advanced-callout"><strong>Relevancia editorial</strong><p>Revisa los temas, la categoría y la procedencia indicados en cada sugerencia.</p></div>
        <div class="advanced-callout"><strong>Prueba y alcance</strong><p>Confirma la URL y si su ingesta se compartirá con el workspace.</p></div>
      </div>
    </section>

    <div *ngIf="section === 'evidence'">
      <dl class="advanced-kpis" aria-label="Resumen de evidencias" *ngIf="evidence() as rows">
        <div class="au-stat"><dt class="au-stat__label">Evidencias recientes</dt><dd class="au-stat__value">{{ rows.length }}</dd><dd class="au-stat__note">Resultados de este sitio</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Fuentes citadas</dt><dd class="au-stat__value">{{ evidenceSourceCount() }}</dd><dd class="au-stat__note">En este conjunto</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Temas relacionados</dt><dd class="au-stat__value">{{ evidenceTopicCount() }}</dd><dd class="au-stat__note">Temas únicos</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Con fecha</dt><dd class="au-stat__value">{{ datedEvidenceCount() }}</dd><dd class="au-stat__note">Fecha de publicación disponible</dd></div>
      </dl>
      <div class="advanced-source-split">
        <section class="au-panel au-panel--padded" aria-labelledby="reg-ev">
          <div class="advanced-card-header"><h2 class="au-panel__title" id="reg-ev">Rastro de procedencia</h2><p>Referencias individuales de fuentes activas y verificadas.</p></div>
          <p *ngIf="evidence() === null" role="status">Cargando evidencias…</p>
          <app-empty-state *ngIf="evidence()?.length === 0" icon="sources" title="Aún no hay evidencias recientes" text="Comprueba una fuente y recoge elementos relacionados con los temas del sitio."></app-empty-state>
          <ul class="advanced-row-list" *ngIf="evidence()?.length">
            <li *ngFor="let item of evidence()">
              <span class="advanced-row-icon"><app-icon name="shield"></app-icon></span>
              <div><strong>{{ item.title }}</strong><p>{{ item.sourceName }}<ng-container *ngIf="item.publishedAt"> · {{ item.publishedAt | date: 'mediumDate' }}</ng-container><ng-container *ngIf="item.topics.length"> · {{ item.topics.join(', ') }}</ng-container></p></div>
              <a class="au-btn au-btn--secondary au-btn--sm" [href]="item.url" target="_blank" rel="noopener noreferrer">Abrir evidencia</a>
            </li>
          </ul>
        </section>
        <aside class="advanced-source-stack">
          <section class="au-panel au-panel--padded"><div class="advanced-card-header"><h2 class="au-panel__title">Descubrimiento y bloqueos</h2><p>Consulta los dominios detectados y la lista de exclusión.</p></div><a class="au-btn au-btn--secondary au-btn--sm" routerLink="." [queryParams]="{ tab: 'settings' }">Abrir diagnósticos</a></section>
          <section class="au-panel au-panel--padded"><div class="advanced-card-header"><h2 class="au-panel__title">Dónde se usan</h2><p>Las propuestas editoriales pueden enlazar a las referencias de origen.</p></div><a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/plan">Abrir Plan editorial</a></section>
        </aside>
      </div>
    </div>

    <!-- Managed sources -->
    <section class="au-panel au-panel--padded" aria-labelledby="reg-src" *ngIf="section === 'sources'">
      <div class="reg-row au-mb-2">
        <div class="advanced-card-header">
          <h2 class="au-panel__title" id="reg-src">Registro de fuentes ({{ filteredSources().length }})</h2>
          <p>Consulta el alcance, el estado y las acciones de cada fuente.</p>
        </div>
        <span class="au-toolbar__spacer"></span>
        <ng-container *ngIf="selectedSources().size > 0">
          <span class="reg-muted">{{ selectedSources().size }} selected</span>
          <input class="au-input au-input--sm" style="width: 140px" type="text" placeholder="Category" aria-label="Category for selected sources" [ngModel]="bulkCategory()" (ngModelChange)="bulkCategory.set($event)" />
          <button class="au-btn au-btn--sm au-btn--secondary" type="button" [disabled]="!bulkCategory().trim()" (click)="bulkSources('assign_category')">Assign category</button>
          <button class="au-btn au-btn--sm au-btn--secondary" type="button" (click)="bulkSources('assign_site', true)">Share with all sites</button>
          <button class="au-btn au-btn--sm au-btn--secondary" type="button" (click)="bulkSources('assign_site', false)">This site only</button>
          <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="bulkSources('archive')">Archive</button>
          <button class="au-btn au-btn--sm au-btn--danger-ghost" type="button" (click)="bulkSources('delete')">Delete</button>
        </ng-container>
      </div>
      <ng-container *ngTemplateOutlet="filters"></ng-container>
      <app-empty-state *ngIf="filteredSources().length === 0" icon="sources" title="No hay fuentes para este sitio" text="Acepta una recomendación o añade una fuente."></app-empty-state>
      <div class="au-table-wrap reg-table" role="region" aria-label="Fuentes registradas" tabindex="0" *ngIf="layout() === 'list' && filteredSources().length > 0">
        <table class="au-table au-table--keep-columns">
          <thead>
            <tr>
              <th scope="col"><span class="au-visually-hidden">Selección</span></th>
              <th scope="col">Fuente</th>
              <th scope="col">Alcance</th>
              <th scope="col">Estado / prueba</th>
              <th scope="col">Referencias</th>
              <th scope="col"><span class="au-visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngFor="let src of filteredSources(); trackBy: trackId">
              <tr>
                <td><input type="checkbox" [attr.aria-label]="'Select ' + src.name" [checked]="selectedSources().has(src.id)" (change)="toggleSource(src.id)" /></td>
                <td>
                  <h3>{{ src.name }}</h3>
                  <a class="reg-muted" [href]="src.url" target="_blank" rel="noopener noreferrer">{{ src.url }}</a>
                </td>
                <td>{{ src.shared ? 'Compartida' : 'Este sitio' }}</td>
                <td>
                  <span class="au-badge" [ngClass]="src.state === 'active' ? 'au-badge--success' : src.state === 'paused' ? 'au-badge--warning' : 'au-badge--neutral'">{{ stateLabels[src.state] }}</span>
                  <span class="au-badge" [ngClass]="src.lastError ? 'au-badge--danger' : src.verificationStatus === 'verified' ? 'au-badge--success' : 'au-badge--neutral'">
                    {{ src.lastError ? 'Error' : src.verificationStatus === 'verified' ? 'Verificada' : 'Sin verificar' }}
                  </span>
                </td>
                <td>{{ src.itemsCount }}</td>
                <td>
                  <div class="reg-row reg-actions">
                    <button class="au-btn au-btn--sm au-btn--secondary" type="button" [attr.aria-expanded]="openId() === src.id" (click)="open(src)">{{ openId() === src.id ? 'Cerrar' : 'Detalle' }}</button>
                    <button class="au-btn au-btn--sm au-btn--ghost" type="button" [disabled]="testing() === src.id" (click)="test(src)">{{ testing() === src.id ? 'Probando…' : 'Probar' }}</button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="openId() === src.id">
                <td colspan="6">
                  <div class="reg-row">
                    <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'active'" (click)="setState(src, 'pause')">Pausar</button>
                    <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'paused'" (click)="setState(src, 'resume')">Reactivar</button>
                    <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state !== 'archived'" (click)="setState(src, 'archive')">Archivar</button>
                    <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'archived'" (click)="setState(src, 'restore')">Restaurar</button>
                  </div>
                  <p class="reg-muted reg-err" *ngIf="src.lastError">{{ src.lastError }}</p>
                  <ng-container *ngTemplateOutlet="sourceDetails; context: { $implicit: src }"></ng-container>
                </td>
              </tr>
            </ng-container>
          </tbody>
        </table>
      </div>
      <div class="reg-grid" *ngIf="layout() === 'cards'">
        <article class="reg-card" *ngFor="let src of filteredSources(); trackBy: trackId">
          <div class="reg-row">
            <input type="checkbox" [attr.aria-label]="'Select ' + src.name" [checked]="selectedSources().has(src.id)" (change)="toggleSource(src.id)" />
            <h3>{{ src.name }}</h3>
            <span class="au-badge" [ngClass]="src.state === 'active' ? 'au-badge--success' : src.state === 'paused' ? 'au-badge--warning' : 'au-badge--neutral'">{{ src.state }}</span>
            <span class="au-badge au-badge--outline">{{ src.type }}</span>
            <span class="au-badge au-badge--info" *ngIf="src.shared" title="Feeds every site">Shared</span>
          </div>
          <a class="reg-muted" [href]="src.url" target="_blank" rel="noopener noreferrer">{{ src.url }}</a>
          <p class="reg-muted">{{ src.itemsCount }} items - every {{ src.refreshIntervalMinutes }} min - priority {{ src.priority }}<span *ngIf="src.lastFetchedAt"> - last fetch {{ src.lastFetchedAt | date: 'short' }}</span></p>
          <p class="reg-muted reg-err" *ngIf="src.lastError">{{ src.lastError }}</p>
          <div class="reg-row">
            <button class="au-btn au-btn--sm au-btn--secondary" type="button" [disabled]="testing() === src.id" (click)="test(src)">{{ testing() === src.id ? 'Testing...' : 'Test source' }}</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'active'" (click)="setState(src, 'pause')">Pause</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'paused'" (click)="setState(src, 'resume')">Resume</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state !== 'archived'" (click)="setState(src, 'archive')">Archive</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" *ngIf="src.state === 'archived'" (click)="setState(src, 'restore')">Restore</button>
            <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="open(src)">{{ openId() === src.id ? 'Close' : 'Details' }}</button>
          </div>

          <ng-container *ngIf="openId() === src.id">
            <ng-container *ngTemplateOutlet="sourceDetails; context: { $implicit: src }"></ng-container>
          </ng-container>
        </article>
      </div>

      <ng-template #sourceDetails let-src>
          <div class="reg-detail">
            <div class="reg-row">
              <button class="au-btn au-btn--sm au-btn--secondary" type="button" (click)="verify(src)">Verify</button>
              <button class="au-btn au-btn--sm au-btn--secondary" type="button" (click)="fetchNow(src)">Fetch now</button>
              <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="setScope(src, !src.shared)">{{ src.shared ? 'This site only' : 'Share with all sites' }}</button>
              <button class="au-btn au-btn--sm au-btn--ghost" type="button" (click)="markUnsupported(src)">Mark unsupported</button>
              <button class="au-btn au-btn--sm au-btn--danger-ghost" type="button" (click)="remove(src)">Delete</button>
            </div>
            <p class="reg-muted" *ngIf="testResult() as r"><strong>{{ r.ok ? 'Extraction works' : 'Extraction failed' }}</strong> ({{ r.latencyMs }} ms)<span *ngIf="r.error" class="reg-err"> - {{ r.error }}</span></p>
            <ul *ngIf="testResult()?.items?.length"><li *ngFor="let i of testResult()!.items"><a [href]="i.url" target="_blank" rel="noopener noreferrer">{{ i.title }}</a></li></ul>

            <form class="reg-form" (ngSubmit)="save(src)">
              <label class="au-field"><span class="au-field__label">Feed URL</span><input class="au-input" name="url" [(ngModel)]="edit.url" /></label>
              <label class="au-field"><span class="au-field__label">Frequency (minutes)</span><input class="au-input" type="number" min="5" name="freq" [(ngModel)]="edit.refreshIntervalMinutes" /></label>
              <label class="au-field"><span class="au-field__label">Language</span><input class="au-input" name="lang" [(ngModel)]="edit.language" /></label>
              <label class="au-field"><span class="au-field__label">Priority</span><input class="au-input" type="number" name="prio" [(ngModel)]="edit.priority" /></label>
              <label class="au-field"><span class="au-field__label">Trust</span>
                <select class="au-select" name="trust" [(ngModel)]="edit.trustLevel"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
              </label>
              <label class="au-field"><span class="au-field__label">Topics</span><input class="au-input" name="topics" [(ngModel)]="edit.topics" /></label>
              <label class="au-field"><span class="au-field__label">Pillars</span><input class="au-input" name="pillars" [(ngModel)]="edit.pillars" /></label>
              <label class="au-field"><span class="au-field__label">Relevance keywords</span><input class="au-input" name="kw" [(ngModel)]="edit.keywords" /></label>
              <label class="au-field"><span class="au-field__label">Selectors (item=.card, title=h2)</span><input class="au-input" name="sel" [(ngModel)]="edit.selectors" /></label>
              <div class="reg-row"><button class="au-btn au-btn--primary au-btn--sm" type="submit">Save configuration</button></div>
            </form>

            <div *ngIf="diagnostics() as d">
              <p class="reg-muted">Health: {{ d.health?.healthStatus || 'unknown' }}<span *ngIf="d.health?.consecutiveFailures"> - {{ d.health?.consecutiveFailures }} consecutive failures</span></p>
              <ul class="reg-muted"><li *ngFor="let run of d.runs.slice(0, 5)">{{ run.startedAt | date: 'short' }} - {{ run.status }}<span class="reg-err" *ngIf="run.errorMessage"> - {{ run.errorMessage }}</span></li></ul>
            </div>
            <div>
              <strong class="reg-muted">Collected items</strong>
              <p class="reg-muted" *ngIf="items().length === 0">Nothing collected yet.</p>
              <ul><li *ngFor="let i of items()"><a [href]="i.canonicalUrl || i.sourceUrl" target="_blank" rel="noopener noreferrer">{{ i.title }}</a> <span class="reg-muted">{{ i.processingStatus }}</span></li></ul>
            </div>
          </div>
      </ng-template>
    </section>
  `,
})
export class SiteSourceRegistryComponent implements OnInit, OnDestroy {
  private readonly api = inject(SourcesApiService);
  private readonly studio = inject(StudioApiService);
  private readonly confirm = inject(ConfirmService);
  private readonly app = inject(AppContextService);
  private readonly editorial = inject(EditorialContextService);
  private readonly toast = inject(ToastService);

  /** Which subsection of the Sources page this instance renders. */
  @Input() section: 'sources' | 'recommendations' | 'evidence' = 'sources';
  readonly selectedSources = signal<Set<string>>(new Set());
  readonly bulkCategory = signal('');

  readonly recommendations = signal<SiteSourceRecommendation[]>([]);
  readonly sources = signal<SiteSource[]>([]);
  readonly sourcesLoaded = signal(false);
  readonly activeCount = computed(() => this.sources().filter((source) => source.state === 'active').length);
  readonly errorCount = computed(() => this.sources().filter((source) => source.lastError).length);
  readonly referenceCount = computed(() => this.sources().reduce((total, source) => total + source.itemsCount, 0));
  readonly evidence = signal<SourceEvidenceRow[] | null>(null);
  readonly evidenceSourceCount = computed(() => new Set(this.evidence()?.map((item) => item.sourceName)).size);
  readonly evidenceTopicCount = computed(() => new Set(this.evidence()?.flatMap((item) => item.topics)).size);
  readonly datedEvidenceCount = computed(() => this.evidence()?.filter((item) => item.publishedAt).length ?? 0);
  readonly search = signal('');
  readonly relationship = signal('');
  readonly state = signal('');
  readonly layout = signal<'cards' | 'list'>('cards');
  readonly stateLabels = { active: 'Activa', paused: 'Pausada', archived: 'Archivada' };
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  readonly openId = signal<string | null>(null);
  readonly testing = signal<string | null>(null);
  readonly testResult = signal<SourceTestResult | null>(null);
  readonly items = signal<SourceItemRow[]>([]);
  readonly diagnostics = signal<SourceDiagnostics | null>(null);
  edit ={ url: '', refreshIntervalMinutes: 60, language: '', priority: 0, trustLevel: 'medium', topics: '', pillars: '', keywords: '', selectors: '' };

  private destroyed = false;
  private siteId: string | null = null;

  readonly openRecommendations = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.recommendations().filter(
      (rec) =>
        rec.status === 'open' &&
        (!this.relationship() || rec.relationship === this.relationship()) &&
        (!term || [rec.name, rec.url, rec.domain, ...(rec.topics ?? [])].some((value) => (value ?? '').toLowerCase().includes(term))),
    );
  });
  readonly filteredSources = computed(() => {
    const term = this.search().trim().toLowerCase();
    const state = this.state();
    return this.sources().filter((source) => {
      const matchesState = state === 'failed' ? Boolean(source.lastError) : !state || source.state === state;
      const matchesSearch = !term || [source.name, source.url, ...(source.categories ?? [])].some((value) => value?.toLowerCase().includes(term));
      return matchesState && matchesSearch;
    });
  });

  constructor() {
    effect(() => {
      const id = this.app.activeSite()?.id ?? null;
      if (id && id !== this.siteId) {
        this.siteId = id;
        this.editorial.update({ area: 'sources', siteId: id });
        void this.reload();
      }
    });
  }

  ngOnInit(): void {
    if (this.section === 'sources') this.layout.set('list');
    this.editorial.update({ area: 'sources' });
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.editorial.clear(['area']);
  }

  trackId = (_: number, row: { id: string }) => row.id;

  async reload(): Promise<void> {
    if (!this.siteId) return;
    if (this.section === 'evidence') {
      this.evidence.set(null);
      this.evidence.set((await firstValueFrom(this.api.evidence(this.siteId, 30)).catch((error) => { this.toast.error(this.message(error)); return { items: [] }; })).items);
      return;
    }
    const [recs, srcs] = await Promise.all([firstValueFrom(this.api.recommendations(this.siteId)), firstValueFrom(this.api.sources(this.siteId))]).catch((error) => {
      this.toast.error(this.message(error));
      return [null, null] as const;
    });
    if (recs) this.recommendations.set(recs.items);
    if (srcs) {
      this.sources.set(srcs.items);
      this.sourcesLoaded.set(true);
    }
    this.selected.set(new Set());
    this.selectedSources.set(new Set());
  }

  private message(error: unknown): string {
    const e = error as { error?: { error?: string; message?: string }; message?: string };
    return e?.error?.message ?? e?.error?.error ?? e?.message ?? 'Request failed';
  }

  async discover(): Promise<void> {
    if (!this.siteId) return;
    this.busy.set(true);
    try {
      const { operationId } = await firstValueFrom(this.api.discover(this.siteId));
      for (let i = 0; i < 90 && !this.destroyed; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const op = await firstValueFrom(this.api.operationStatus(operationId));
        if (['completed', 'succeeded', 'done', 'failed', 'cancelled'].includes(op.status)) {
          if (op.status === 'failed') this.toast.error('Source discovery failed');
          break;
        }
      }
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }

  toggle(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async decide(rec: SiteSourceRecommendation, action: 'accept' | 'reject'): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.decide(this.siteId, rec.id, action));
      this.toast.success(action === 'accept' ? 'Source activated' : 'Recommendation rejected');
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async bulk(action: 'accept' | 'reject'): Promise<void> {
    if (!this.siteId) return;
    try {
      const result = await firstValueFrom(this.api.bulk(this.siteId, Array.from(this.selected()), action));
      this.toast.success(`${result.succeeded} done, ${result.failed} failed`);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  toggleSource(id: string): void {
    this.selectedSources.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Bulk actions on the selected sources; "assign_site" moves them between this site and shared. */
  async bulkSources(action: 'assign_category' | 'assign_site' | 'archive' | 'delete', shared = false): Promise<void> {
    const ids = Array.from(this.selectedSources());
    if (ids.length === 0) return;
    if (action === 'delete') {
      const confirmed = await this.confirm.confirm({
        title: `Delete ${ids.length} source(s)?`,
        message: 'Discovered stories stay in the inbox but these sources stop refreshing. This cannot be undone.',
        confirmLabel: `Delete ${ids.length} sources`,
        danger: true,
      });
      if (!confirmed) return;
    }
    try {
      const result = await firstValueFrom(
        this.studio.bulkSources({
          ids,
          action,
          category: action === 'assign_category' ? this.bulkCategory().trim() : undefined,
          siteId: action === 'assign_site' && !shared ? this.siteId ?? undefined : undefined,
        }),
      );
      if (result.failed > 0) this.toast.error(`${result.failed} failed, ${result.succeeded} done`);
      else this.toast.success(`${result.succeeded} done`);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async setScope(src: SiteSource, shared: boolean): Promise<void> {
    this.selectedSources.set(new Set([src.id]));
    await this.bulkSources('assign_site', shared);
  }

  async verify(src: SiteSource): Promise<void> {
    try {
      const result = await firstValueFrom(this.studio.verifySource(src.id));
      if (result.ok) this.toast.success(`${src.name} verified (HTTP ${result.status ?? '?'}, ${result.itemCount ?? 0} items).`);
      else this.toast.error(`Verification failed: ${result.error}`);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async fetchNow(src: SiteSource): Promise<void> {
    try {
      const result = await firstValueFrom(this.studio.fetchSource(src.id));
      if (result.failed) this.toast.error(result.error ?? 'Fetch failed');
      else this.toast.success(result.notModified ? 'No changes since the last fetch.' : `${result.created} new items, ${result.duplicates} duplicates.`);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async markUnsupported(src: SiteSource): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Mark "${src.name}" as unsupported?`,
      message: 'The source will be disabled and labelled unsupported with the configured restrictions note.',
      confirmLabel: 'Mark unsupported',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await firstValueFrom(this.studio.markSourceUnsupported(src.id, 'unsupported'));
      this.toast.success('Source marked as unsupported.');
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async remove(src: SiteSource): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Delete "${src.name}"?`,
      message: src.shared ? 'This source is shared: every site stops using it. Discovered stories stay in the inbox. This cannot be undone.' : 'Discovered stories stay in the inbox. This cannot be undone.',
      confirmLabel: 'Delete source',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await firstValueFrom(this.studio.deleteSource(src.id));
      this.toast.success('Source deleted.');
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async setState(src: SiteSource, action: 'pause' | 'resume' | 'archive' | 'restore'): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.setState(this.siteId, src.id, action));
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async test(src: SiteSource): Promise<void> {
    if (!this.siteId) return;
    this.testing.set(src.id);
    try {
      await this.open(src, true);
      this.testResult.set(await firstValueFrom(this.api.test(this.siteId, src.id)));
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    } finally {
      this.testing.set(null);
    }
  }

  async open(src: SiteSource, keepOpen = false): Promise<void> {
    if (!this.siteId) return;
    if (!keepOpen && this.openId() === src.id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(src.id);
    this.testResult.set(null);
    const config = (src.configuration ?? {}) as Record<string, unknown>;
    const strings = (key: string) => (Array.isArray(config[key]) ? (config[key] as unknown[]).join(', ') : '');
    this.edit = {
      url: src.url,
      refreshIntervalMinutes: src.refreshIntervalMinutes,
      language: src.language ?? '',
      priority: src.priority,
      trustLevel: (src.trustScore ?? 0.5) >= 0.75 ? 'high' : (src.trustScore ?? 0.5) >= 0.5 ? 'medium' : 'low',
      topics: (src.categories ?? []).join(', '),
      pillars: strings('pillars'),
      keywords: strings('relevanceKeywords'),
      selectors: Object.entries((config['selectors'] as Record<string, string> | undefined) ?? {}).map(([k, v]) => `${k}=${v}`).join(', '),
    };
    const [items, diagnostics] = await Promise.all([firstValueFrom(this.api.items(this.siteId, src.id)), firstValueFrom(this.api.diagnostics(this.siteId, src.id))]).catch(() => [null, null] as const);
    this.items.set(items?.items ?? []);
    this.diagnostics.set(diagnostics);
  }

  async save(src: SiteSource): Promise<void> {
    if (!this.siteId) return;
    const selectors: Record<string, string> = {};
    for (const pair of list(this.edit.selectors)) {
      const [key, ...rest] = pair.split('=');
      if (key && rest.length) selectors[key.trim()] = rest.join('=').trim();
    }
    const body: SourceConfigPatchBody = {
      url: this.edit.url.trim(),
      refreshIntervalMinutes: Number(this.edit.refreshIntervalMinutes),
      language: this.edit.language.trim() || undefined,
      priority: Number(this.edit.priority),
      trustLevel: this.edit.trustLevel as 'high' | 'medium' | 'low',
      topics: list(this.edit.topics),
      pillars: list(this.edit.pillars),
      relevanceKeywords: list(this.edit.keywords),
      selectors,
    };
    try {
      await firstValueFrom(this.api.patchConfig(this.siteId, src.id, body));
      this.toast.success('Configuration saved');
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }
}
