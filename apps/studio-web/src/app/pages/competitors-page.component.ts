import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppContextService } from '../services/app-context.service';
import { Competitor, CompetitorsApiService, ContentOpportunity, CoverageComparison } from '../services/competitors-api.service';
import { EditorialContextService } from '../services/editorial-context.service';
import { ToastService } from '../services/toast.service';

const KIND_LABEL: Record<string, string> = {
  missing_topic: 'Tema sin cubrir',
  improve_existing: 'Mejorar artículo',
  underdeveloped_cluster: 'Tema con poca cobertura',
  differentiated_angle: 'Enfoque diferenciado',
  cannibalization_risk: 'Riesgo de canibalización',
};

@Component({
  selector: 'app-competitors-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent, RouterLink],
  styleUrls: ['./site-intelligence-profile.css', './site-intelligence-sections.css', './competitors-page.component.css'],
  template: `
    <section class="au-page profile-reference cp-page">
      <header class="page-head">
        <div>
          <p class="overline">Auctorio / Herramientas avanzadas</p>
          <h1>Investigación de competidores</h1>
          <p>Comparación documentada: qué cubren, qué falta en tu sitio y qué merece producir.</p>
        </div>
        <div class="head-actions">
          <button class="btn small" type="button" [disabled]="busy()" (click)="run('coverage')"><app-icon name="refresh"></app-icon>{{ busy() === 'coverage' ? 'Comparando…' : 'Comparar cobertura' }}</button>
          <button class="btn small primary" type="button" [disabled]="busy()" (click)="run('discover')"><app-icon name="search"></app-icon>{{ busy() === 'discover' ? 'Buscando…' : 'Descubrir' }}</button>
        </div>
      </header>

      <ng-container *ngIf="tab() === 'shortlist'">
        <dl class="kpis" aria-label="Métricas de competidores" *ngIf="loaded()">
          <div class="kpi"><dt class="top"><app-icon name="globe"></app-icon>Competidores</dt><dd class="number">{{ competitors().length }}</dd><dd class="foot">Lista de trabajo</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="circle-check"></app-icon>Aceptados</dt><dd class="number">{{ acceptedCount() }}</dd><dd class="foot">Aportan cobertura</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="sparkles"></app-icon>Por valorar</dt><dd class="number">{{ suggestedCount() }}</dd><dd class="foot">Pendientes de revisión</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="activity"></app-icon>Oportunidades</dt><dd class="number">{{ openOpportunities().length }}</dd><dd class="foot">Validación pendiente</dd></div>
        </dl>

        <section class="card">
          <div class="card-header">
            <div><h2>Competidores observados</h2><p>Descubiertos o añadidos por el usuario, con aceptación explícita</p></div>
            <button class="btn small" type="button" [attr.aria-expanded]="showAdd()" (click)="showAdd.set(!showAdd())"><app-icon name="plus"></app-icon>Añadir manualmente</button>
          </div>
          <form class="fields cp-form" *ngIf="showAdd()" (ngSubmit)="add()">
            <label class="profile-field"><span>URL o dominio del competidor</span><input class="input" name="url" required [(ngModel)]="draft.url" /></label>
            <label class="profile-field"><span>Nombre (opcional)</span><input class="input" name="name" [(ngModel)]="draft.name" /></label>
            <label class="profile-field"><span>Notas</span><input class="input" name="notes" [(ngModel)]="draft.notes" /></label>
            <div class="cp-actions"><button class="btn small primary" type="submit" [disabled]="!draft.url.trim()">Añadir competidor</button></div>
          </form>
          <form class="filter-bar" (ngSubmit)="search.set(searchText)">
            <label class="search"><app-icon name="search"></app-icon><input class="input" type="search" name="search" aria-label="Buscar competidor" placeholder="Buscar competidor…" [(ngModel)]="searchText" /></label>
            <select class="input filter-select" name="status" aria-label="Estado del competidor" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
              <option value="">Todos</option><option value="accepted">Aceptados</option><option value="suggested">Sugeridos</option><option value="paused">Pausados</option><option value="rejected">Rechazados</option>
            </select>
            <button class="btn small" type="submit">Filtrar</button>
          </form>
          <app-empty-state *ngIf="loaded() && !shown().length" icon="competency" [title]="competitors().length ? 'Ningún competidor coincide' : 'Aún no hay competidores'" [text]="competitors().length ? 'Cambia la búsqueda o el estado.' : 'Descubre competidores a partir de la evidencia del sitio o añade uno manualmente.'"></app-empty-state>
          <div class="grid2">
            <article class="mini-card" *ngFor="let c of shown(); trackBy: trackId">
              <div class="row-main cp-card-title">
                <span class="row-icon"><app-icon name="globe"></app-icon></span>
                <div><h3>{{ c.name }}</h3><a class="muted-sm" [href]="'https://' + c.domain" target="_blank" rel="noopener noreferrer">{{ c.domain }}</a></div>
              </div>
              <p class="cp-summary">{{ c.notes || c.evidence?.[0]?.note || originLabel(c.origin) }}</p>
              <div class="cp-actions">
                <span class="badge" [class.ok]="c.status === 'accepted'" [class.warning]="c.status === 'suggested' || c.status === 'paused'">{{ competitorLabels[c.status] }}</span>
                <span class="badge">{{ c.snapshotsCount }} páginas</span>
              </div>
              <div class="form-footer">
                <button class="btn small" type="button" [attr.aria-expanded]="detailId() === c.id" (click)="detailId.set(detailId() === c.id ? null : c.id)">Detalles</button>
                <button class="btn small primary" type="button" *ngIf="c.status === 'suggested' || c.status === 'paused'" (click)="setStatus(c, 'accepted')">{{ c.status === 'paused' ? 'Reanudar' : 'Aceptar' }}</button>
                <button class="btn small ghost" type="button" *ngIf="c.status === 'suggested'" (click)="setStatus(c, 'rejected')">Rechazar</button>
                <button class="btn small ghost" type="button" *ngIf="c.status === 'accepted'" (click)="setStatus(c, 'paused')">Pausar</button>
                <button class="btn small ghost" type="button" [attr.aria-expanded]="editId() === c.id" (click)="startEdit(c)">Editar</button>
              </div>
              <div class="profile-extra" *ngIf="detailId() === c.id">
                <div class="cp-actions"><span class="badge" [class.ok]="c.verification === 'verified'">{{ c.verification === 'verified' ? 'Verificado' : 'Por verificar' }}</span><span class="badge">{{ c.opportunitiesCount }} oportunidades</span></div>
                <p>{{ originLabel(c.origin) }}<span *ngIf="c.overlapScore !== null"> · Coincidencia {{ c.overlapScore | percent }}</span></p>
                <div class="cp-actions" *ngIf="c.overlapTopics?.length"><span class="badge" *ngFor="let topic of c.overlapTopics">{{ overlapLabel(topic) }}</span></div>
                <ul class="cp-ev" *ngIf="c.evidence?.length"><li *ngFor="let e of c.evidence!.slice(0, 4)">{{ e.note }} <a *ngIf="e.url" [href]="e.url" target="_blank" rel="noopener noreferrer">Fuente</a></li></ul>
                <p class="au-error" *ngIf="c.lastError">{{ c.lastError }}</p>
                <button class="btn small ghost cp-danger" type="button" (click)="setStatus(c, 'removed')">Retirar</button>
              </div>
              <form class="fields profile-extra cp-form" *ngIf="editId() === c.id" (ngSubmit)="saveEdit(c)">
                <label class="profile-field"><span>Nombre</span><input class="input" name="name" [(ngModel)]="edit.name" /></label>
                <label class="profile-field"><span>URL del feed</span><input class="input" name="feed" [(ngModel)]="edit.feedUrl" /></label>
                <label class="profile-field"><span>URL del sitemap</span><input class="input" name="sitemap" [(ngModel)]="edit.sitemapUrl" /></label>
                <label class="profile-field"><span>Notas</span><input class="input" name="notes" [(ngModel)]="edit.notes" /></label>
                <div class="cp-actions"><button class="btn small primary" type="submit">Guardar</button></div>
              </form>
            </article>
          </div>
        </section>
      </ng-container>

      <div class="stack" *ngIf="tab() === 'coverage'">
        <div class="section-note cp-note"><app-icon name="info"></app-icon><span>La matriz compara las páginas del inventario del sitio con las muestras de competidores. El alcance depende de la muestra disponible.</span></div>
        <section class="card">
          <div class="card-header">
            <div><h2>Matriz de cobertura temática</h2><p>Agrupación por tópico para localizar vacíos y oportunidades</p></div>
            <button class="btn small" type="button" [disabled]="busy()" (click)="run('coverage')"><app-icon name="refresh"></app-icon>Actualizar muestra</button>
          </div>
          <ng-container *ngIf="coverage() as matrix">
            <div class="table-wrap" tabindex="0" role="region" aria-label="Comparación de cobertura" *ngIf="matrix.topics.length && matrix.competitors.length">
              <table class="table">
                <caption>{{ matrix.sampledCompetitorPages }} páginas de competidores en la muestra · {{ matrix.sitePages }} páginas propias</caption>
                <thead><tr><th scope="col">Pilar</th><th scope="col">Tu sitio</th><th scope="col" *ngFor="let c of matrix.competitors">{{ c.name }}</th><th scope="col">Acción</th></tr></thead>
                <tbody>
                  <ng-container *ngFor="let row of matrix.topics">
                    <tr>
                      <td><strong>{{ row.topic }}</strong></td><td>{{ row.sitePages }}</td>
                      <td *ngFor="let c of matrix.competitors" [class.cp-danger]="row.sitePages === 0 && (row.competitorPages[c.id] || 0) > 0">{{ row.competitorPages[c.id] || 0 }}</td>
                      <td class="actions"><button class="btn small ghost" type="button" [attr.aria-expanded]="coverageTopic() === row.topic" (click)="coverageTopic.set(coverageTopic() === row.topic ? null : row.topic)">Ver brechas</button></td>
                    </tr>
                    <tr *ngIf="coverageTopic() === row.topic">
                      <td [attr.colspan]="matrix.competitors.length + 3">
                        <p *ngIf="!row.siteSampleUrls.length">La muestra de este tema no incluye páginas propias.</p>
                        <ul class="cp-ev" *ngIf="row.siteSampleUrls.length"><li *ngFor="let url of row.siteSampleUrls"><a [href]="url" target="_blank" rel="noopener">{{ url }}</a></li></ul>
                        <a class="btn small" routerLink="." [queryParams]="{ tab: 'opportunities', topic: row.topic }">Buscar oportunidades del tema</a>
                      </td>
                    </tr>
                  </ng-container>
                </tbody>
              </table>
            </div>
          </ng-container>
          <app-empty-state *ngIf="loaded() && (!coverage()?.topics?.length || !coverage()?.competitors?.length)" icon="competency" title="Aún no hay cobertura comparable" text="Acepta un competidor y actualiza la muestra para comparar los temas." />
        </section>
        <section class="card">
          <div class="card-header"><div><h2>Diagnóstico accionable</h2><p>Dónde actuar sin duplicar Site Intelligence</p></div></div>
          <div class="grid2">
            <div class="callout"><h3>Tu inventario</h3><p>Las páginas propias provienen de <a routerLink="/studio/site-intelligence" [queryParams]="{ tab: 'crawl' }">Site Intelligence</a>.</p></div>
            <div class="callout"><h3>Oportunidades externas</h3><p>Las ideas pasan al plan con la evidencia de origen.</p></div>
          </div>
        </section>
      </div>

      <ng-container *ngIf="tab() === 'opportunities'">
        <dl class="kpis" aria-label="Métricas de oportunidades" *ngIf="loaded()">
          <div class="kpi"><dt class="top"><app-icon name="sparkles"></app-icon>Oportunidades abiertas</dt><dd class="number">{{ openOpportunities().length }}</dd><dd class="foot">Revisar evidencia</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="content"></app-icon>Mejoras de artículo</dt><dd class="number">{{ improvementCount() }}</dd><dd class="foot">Actualizar una página existente</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="circle-check"></app-icon>En seguimiento</dt><dd class="number">{{ monitoringCount() }}</dd><dd class="foot">Pendientes de decisión</dd></div>
          <div class="kpi"><dt class="top"><app-icon name="plan"></app-icon>Propuestas en plan</dt><dd class="number">{{ plannedCount() }}</dd><dd class="foot">Vinculadas a una oportunidad</dd></div>
        </dl>

        <section class="card">
          <div class="card-header"><div><h2>Oportunidades de crecimiento</h2><p>Convierte una idea en una propuesta con evidencia editorial</p></div></div>
          <form class="filter-bar" (ngSubmit)="opportunitySearch.set(opportunitySearchText)">
            <label class="search"><app-icon name="search"></app-icon><input class="input" type="search" name="query" aria-label="Buscar oportunidad" placeholder="Buscar oportunidad…" [(ngModel)]="opportunitySearchText" /></label>
            <select class="input filter-select" name="status" aria-label="Estado de la oportunidad" [ngModel]="opportunityStatus()" (ngModelChange)="opportunityStatus.set($event)">
              <option value="">Todas</option><option value="open">Abiertas</option><option value="monitoring">En seguimiento</option><option value="dismissed">Descartadas</option><option value="planned">En el plan</option>
            </select>
            <button class="btn small" type="submit">Filtrar</button>
          </form>
          <app-empty-state *ngIf="loaded() && !shownOpportunities().length" icon="sparkles" [title]="opportunities().length ? 'Ninguna oportunidad coincide' : 'Aún no hay oportunidades'" [text]="opportunities().length ? 'Cambia la búsqueda o el estado.' : 'Actualiza la muestra de cobertura para buscar temas que tu sitio aún no cubra.'"></app-empty-state>
          <ul class="row-list">
            <li *ngFor="let o of shownOpportunities(); trackBy: trackId">
              <div class="row-main">
                <span class="row-icon"><app-icon name="sparkles"></app-icon></span>
                <div>
                  <h3 class="row-title">{{ o.topic }}</h3>
                  <p class="row-desc">{{ o.rationale }}</p>
                  <div class="cp-actions cp-row-meta"><span class="badge purple">{{ kindLabel(o.kind) }}</span><span class="badge" [class.ok]="o.status === 'planned'">{{ opportunityLabels[o.status] }}</span></div>
                  <details class="profile-extra" *ngIf="o.evidence?.length || o.targetUrl">
                    <summary>Ver evidencia</summary>
                    <ul class="cp-ev" *ngIf="o.evidence?.length"><li *ngFor="let e of o.evidence!.slice(0, 4)"><a [href]="e.url" target="_blank" rel="noopener noreferrer">{{ e.title || e.url }}</a><span *ngIf="e.competitor"> ({{ e.competitor }})</span></li></ul>
                    <p class="row-desc" *ngIf="o.targetUrl">Página existente: <a [href]="o.targetUrl" target="_blank" rel="noopener noreferrer">{{ o.targetUrl }}</a></p>
                  </details>
                </div>
              </div>
              <div class="row-action">
                <ng-container *ngIf="o.planItemId; else opportunityActions"><span class="badge ok">Propuesta vinculada</span></ng-container>
                <ng-template #opportunityActions>
                  <ng-container *ngIf="o.status === 'open' || o.status === 'monitoring'">
                    <button class="btn small primary" type="button" (click)="toPlan(o, 'new')">Añadir al plan</button>
                    <button class="btn small" type="button" *ngIf="o.targetUrl" (click)="toPlan(o, 'update')">Mejorar artículo</button>
                    <button class="btn small" type="button" *ngIf="o.status === 'open'" (click)="oppStatus(o, 'monitoring')">Vigilar</button>
                    <button class="btn small ghost" type="button" (click)="oppStatus(o, 'dismissed')">Descartar</button>
                  </ng-container>
                  <button class="btn small" type="button" *ngIf="o.status === 'dismissed'" (click)="oppStatus(o, 'open')">Reabrir</button>
                </ng-template>
              </div>
            </li>
          </ul>
        </section>
      </ng-container>
    </section>
  `,
})
export class CompetitorsPageComponent implements OnDestroy {
  private readonly api = inject(CompetitorsApiService);
  private readonly app = inject(AppContextService);
  private readonly editorial = inject(EditorialContextService);
  private readonly toast = inject(ToastService);

  readonly tab = signal<'shortlist' | 'coverage' | 'opportunities'>('shortlist');
  readonly competitors = signal<Competitor[]>([]);
  readonly coverage = signal<CoverageComparison | null>(null);
  readonly opportunities = signal<ContentOpportunity[]>([]);
  readonly statusFilter = signal('');
  readonly search = signal('');
  readonly opportunitySearch = signal('');
  readonly opportunityStatus = signal('');
  readonly loaded = signal(false);
  readonly busy = signal<'discover' | 'coverage' | ''>('');
  readonly showAdd = signal(false);
  readonly editId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly coverageTopic = signal<string | null>(null);
  readonly competitorLabels = { suggested: 'Sugerido', accepted: 'Aceptado', rejected: 'Rechazado', paused: 'Pausado', removed: 'Retirado' };
  readonly opportunityLabels = { open: 'Abierta', planned: 'En el plan', dismissed: 'Descartada', monitoring: 'En seguimiento' };
  searchText = '';
  opportunitySearchText = '';

  overlapLabel(topic: string | { topic: string }): string {
    return typeof topic === 'string' ? topic : topic.topic;
  }

  originLabel(origin: string): string {
    return origin === 'manual' ? 'Añadido manualmente' : origin;
  }


  readonly shown = computed(() => this.competitors().filter((c) => (!this.statusFilter() || c.status === this.statusFilter()) && `${c.name} ${c.domain}`.toLowerCase().includes(this.search().trim().toLowerCase())));
  readonly shownOpportunities = computed(() => this.opportunities().filter((o) => (!this.opportunityStatus() || o.status === this.opportunityStatus()) && `${o.topic} ${o.rationale}`.toLowerCase().includes(this.opportunitySearch().trim().toLowerCase())));
  readonly acceptedCount = computed(() => this.competitors().filter((c) => c.status === 'accepted').length);
  readonly suggestedCount = computed(() => this.competitors().filter((c) => c.status === 'suggested').length);
  readonly improvementCount = computed(() => this.opportunities().filter((o) => o.kind === 'improve_existing').length);
  readonly monitoringCount = computed(() => this.opportunities().filter((o) => o.status === 'monitoring').length);
  readonly plannedCount = computed(() => this.opportunities().filter((o) => Boolean(o.planItemId)).length);
  readonly openOpportunities = computed(() => this.opportunities().filter((o) => o.status === 'open'));
  draft = { url: '', name: '', notes: '' };
  edit = { name: '', feedUrl: '', sitemapUrl: '', notes: '' };

  private siteId: string | null = null;
  private destroyed = false;

  constructor() {
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const tab = params.get('tab');
      this.tab.set(tab === 'coverage' || tab === 'opportunities' ? tab : 'shortlist');
      const topic = params.get('topic');
      if (topic !== null) {
        this.opportunitySearchText = topic;
        this.opportunitySearch.set(topic);
      }
    });
    effect(() => {
      const id = this.app.activeSite()?.id ?? null;
      if (id && id !== this.siteId) {
        this.loaded.set(false);
        this.siteId = id;
        this.editorial.update({ area: 'competitors', siteId: id });
        void this.reload();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.editorial.clear(['area']);
  }

  trackId = (_: number, row: { id: string }) => row.id;
  kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

  private message(error: unknown): string {
    const e = error as { error?: { error?: string; message?: string }; message?: string };
    return e?.error?.message ?? e?.error?.error ?? e?.message ?? 'Request failed';
  }

  async reload(): Promise<void> {
    if (!this.siteId) return;
    try {
      const [list, coverage, opportunities] = await Promise.all([firstValueFrom(this.api.list(this.siteId)), firstValueFrom(this.api.coverage(this.siteId)), firstValueFrom(this.api.opportunities(this.siteId))]);
      this.competitors.set(list.items);
      this.coverage.set(coverage);
      this.opportunities.set(opportunities.items);
      this.loaded.set(true);
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async run(kind: 'discover' | 'coverage'): Promise<void> {
    if (!this.siteId) return;
    this.busy.set(kind);
    try {
      const { operationId } = await firstValueFrom(kind === 'discover' ? this.api.discover(this.siteId) : this.api.refreshCoverage(this.siteId));
      for (let i = 0; i < 120 && !this.destroyed; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const op = await firstValueFrom(this.api.operationStatus(operationId));
        if (['completed', 'succeeded', 'done', 'failed', 'cancelled'].includes(op.status)) {
          if (op.status === 'failed') this.toast.error('The operation failed');
          break;
        }
      }
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    } finally {
      this.busy.set('');
    }
  }

  async add(): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.add(this.siteId, { url: this.draft.url.trim(), name: this.draft.name.trim() || undefined, notes: this.draft.notes.trim() || undefined }));
      this.draft = { url: '', name: '', notes: '' };
      this.showAdd.set(false);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async setStatus(c: Competitor, status: Competitor['status']): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.update(this.siteId, c.id, { status }));
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  startEdit(c: Competitor): void {
    this.editId.set(this.editId() === c.id ? null : c.id);
    this.edit = { name: c.name, feedUrl: c.feedUrl ?? '', sitemapUrl: c.sitemapUrl ?? '', notes: c.notes ?? '' };
  }

  async saveEdit(c: Competitor): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.update(this.siteId, c.id, { name: this.edit.name, feedUrl: this.edit.feedUrl.trim() || null, sitemapUrl: this.edit.sitemapUrl.trim() || null, notes: this.edit.notes.trim() || null }));
      this.editId.set(null);
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async toPlan(o: ContentOpportunity, mode: 'new' | 'update'): Promise<void> {
    if (!this.siteId) return;
    try {
      const result = await firstValueFrom(this.api.toPlan(this.siteId, o.id, { mode, targetUrl: mode === 'update' ? o.targetUrl ?? undefined : undefined }));
      this.toast.success(result.created ? 'Proposal added to the plan' : 'Already in the plan');
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }

  async oppStatus(o: ContentOpportunity, status: 'dismissed' | 'monitoring' | 'open'): Promise<void> {
    if (!this.siteId) return;
    try {
      await firstValueFrom(this.api.setOpportunityStatus(this.siteId, o.id, status));
      await this.reload();
    } catch (error) {
      this.toast.error(this.message(error));
    }
  }
}
