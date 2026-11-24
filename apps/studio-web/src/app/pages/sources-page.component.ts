import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { SiteSourceRegistryComponent } from '../components/sources/site-source-registry.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { sectionFor } from '../layout/studio-nav';

type SourcesView = 'sources' | 'recommendations' | 'evidence' | 'add' | 'settings';
import type { BlockedDomain, DiscoveredDomain, SourceRecommendation, SourceType, StudioEnrichmentProvider, StudioFeedCandidate, StudioFeedDiscoveryResult, StudioSite, StudioSource, StudioSourcePack } from '../models/studio.models';

@Component({
  selector: 'app-sources-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, SiteSourceRegistryComponent],
  styleUrls: ['./site-intelligence-profile.css', './site-intelligence-sections.css', './source-diagnostics.css'],
  styles: [`.add-url { display: flex; gap: var(--au-s2); flex-wrap: wrap; } .add-url .au-input { flex: 1 1 320px; }`],
  template: `
    <section class="au-page advanced-page advanced-sources">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Auctorio / Herramientas avanzadas</p>
          <h1 class="au-page__title">Fuentes y evidencias</h1>
          <p class="au-page__subtitle">De dónde procede la información, cómo se comprueba y qué entra en el sistema editorial.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="view !== 'add' && view !== 'settings'" (click)="registry?.reload()"><app-icon name="refresh"></app-icon>Sincronizar</button>
          <a class="au-btn au-btn--primary" routerLink="." [queryParams]="{ tab: 'add' }" *ngIf="view !== 'add'">
            <app-icon name="plus"></app-icon>
            Añadir fuente
          </a>
        </div>
      </header>

      <app-site-source-registry *ngIf="view === 'sources'" section="sources"></app-site-source-registry>
      <app-site-source-registry *ngIf="view === 'recommendations'" section="recommendations"></app-site-source-registry>
      <app-site-source-registry *ngIf="view === 'evidence'" section="evidence"></app-site-source-registry>


      <ng-template #domainDiagnostics>
      <!-- Recently discovered -->
      <section class="au-panel au-panel--padded au-mb-3">
        <h2 class="au-panel__title">Dominios descubiertos</h2>
        <p class="au-panel__subtitle au-mb-3">Consulta los dominios detectados y excluye los que no deban entrar en la ingesta.</p>
        <app-empty-state
          *ngIf="domains.length === 0"
          icon="sources"
          title="Todavía no hay dominios descubiertos"
          text="Puedes ejecutar el descubrimiento cuando esté configurado."
        >
          <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="runDiscovery()" [disabled]="runningDiscovery">
            {{ runningDiscovery ? 'En curso…' : 'Ejecutar descubrimiento' }}
          </button>
        </app-empty-state>
        <div class="au-table-wrap" *ngIf="domains.length > 0">
          <table class="au-table">
            <thead>
              <tr>
                <th>Dominio</th>
                <th>Detecciones</th>
                <th>Calidad</th>
                <th>Última detección</th>
                <th style="width: 120px"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let domain of domains">
                <td><span class="au-table__title">{{ domain.domain }}</span></td>
                <td>{{ domain.discoveryCount }}</td>
                <td>
                  <span class="au-badge" [class.au-badge--success]="(domain.qualityScore ?? 0) >= 70" [class.au-badge--warning]="(domain.qualityScore ?? 0) >= 40 && (domain.qualityScore ?? 0) < 70" [class.au-badge--neutral]="(domain.qualityScore ?? 0) < 40">
                    {{ domain.qualityScore ?? '—' }}{{ domain.tier ? ' · ' + domain.tier : '' }}
                  </span>
                </td>
                <td class="au-nowrap au-muted">{{ dateLabel(domain.lastSeenAt) }}</td>
                <td>
                  <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="blockDomain(domain.domain)" *ngIf="!domain.blocked">
                    Bloquear
                  </button>
                  <span class="au-badge au-badge--danger" *ngIf="domain.blocked">Bloqueado</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="au-inline" *ngIf="domains.length > 0">
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="runDiscovery()" [disabled]="runningDiscovery">
            <app-icon name="sparkles"></app-icon>
            {{ runningDiscovery ? 'En curso…' : 'Ejecutar descubrimiento' }}
          </button>
        </div>
      </section>

      <!-- Blocked -->
      <section class="au-panel au-panel--padded au-mb-3">
        <h2 class="au-panel__title">Dominios bloqueados</h2>
        <p class="au-panel__subtitle au-mb-3">Estos dominios están excluidos del descubrimiento y de la ingesta.</p>
        <app-empty-state
          *ngIf="blockedDomains.length === 0"
          icon="sources"
          title="No hay dominios bloqueados"
          text="Las exclusiones se aplican desde la lista de dominios detectados."
        ></app-empty-state>
        <div class="au-table-wrap" *ngIf="blockedDomains.length > 0">
          <table class="au-table">
            <thead>
              <tr>
                <th>Dominio</th>
                <th>Motivo</th>
                <th>Fecha de bloqueo</th>
                <th style="width: 120px"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let entry of blockedDomains">
                <td><span class="au-table__title">{{ entry.domain }}</span></td>
                <td class="au-muted">{{ entry.reason || '—' }}</td>
                <td class="au-nowrap au-muted">{{ dateLabel(entry.createdAt) }}</td>
                <td>
                  <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="unblockDomain(entry.domain)">
                    Desbloquear
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      </ng-template>

      <div class="advanced-source-split" *ngIf="view === 'add'">
        <section class="au-panel au-panel--padded" aria-labelledby="new-source">
          <h2 class="au-panel__title" id="new-source">{{ editingId ? 'Editar fuente' : 'Nueva fuente' }}</h2>
          <p class="au-panel__subtitle au-mb-3">Alta guiada. Comprueba el sitio, feed o sitemap antes de guardarlo.</p>
          <div class="au-field au-mb-3">
            <span class="au-field__label">1. Website or feed address</span>
            <div class="add-url">
              <input class="au-input" type="url" [(ngModel)]="form.url" placeholder="https://www.example.com" [disabled]="form.type === 'manual'" aria-label="Website or feed address" />
              <button class="au-btn au-btn--secondary" type="button" (click)="discoverFeeds()" [disabled]="!form.url || discoveringFeeds">
                <app-icon name="sparkles"></app-icon>
                {{ discoveringFeeds ? 'Looking…' : 'Find the feed' }}
              </button>
            </div>
          </div>
          <div class="au-field-grid au-mb-3">
            <label class="au-field">
              <span class="au-field__label">2. Name</span>
              <input class="au-input" type="text" [(ngModel)]="form.name" placeholder="e.g. El Mundo Deportes" />
            </label>
            <label class="au-field">
              <span class="au-field__label">3. Used by</span>
              <select class="au-select" [(ngModel)]="form.siteId">
                <option [ngValue]="activeSiteId">This site only</option>
                <option [ngValue]="null">Shared by all sites</option>
              </select>
            </label>
          </div>
          <details class="au-details au-mb-3">
            <summary class="au-details__summary">More options (type, refresh, trust, categories…)</summary>
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Type</span>
              <select class="au-select" [(ngModel)]="form.type">
                <option *ngFor="let type of sourceTypes" [ngValue]="type">{{ type }}</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Refresh (minutes)</span>
              <input class="au-input" type="number" min="5" [(ngModel)]="form.refreshIntervalMinutes" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Priority (-5..5)</span>
              <input class="au-input" type="number" min="-5" max="5" [(ngModel)]="form.priority" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Trust (0..1)</span>
              <input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="form.trustScore" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Language</span>
              <input class="au-input" type="text" [(ngModel)]="form.language" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Categories (comma separated)</span>
              <input class="au-input" type="text" [(ngModel)]="form.categoriesText" placeholder="football, streaming, technology" />
            </label>
            <label class="au-field au-field--wide">
              <span class="au-field__label">Configuration (JSON, optional)</span>
              <textarea class="au-input au-textarea" rows="4" [(ngModel)]="form.configurationText" placeholder='{"itemSelector": "div.fa-card", "engine": "browser"}'></textarea>
              <span class="au-field__hint">Selectors for htmllist, filters for imdb. Leave empty to use per-site defaults.</span>
            </label>
          </div>
            <div class="au-field-grid au-mt-3">
              <label class="au-field">
                <span class="au-field__label">Authority (0..1)</span>
                <input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="form.authorityScore" />
              </label>
              <label class="au-field">
                <span class="au-field__label">Country</span>
                <input class="au-input" type="text" [(ngModel)]="form.country" placeholder="e.g. US, GB, ES" />
              </label>
              <label class="au-field">
                <span class="au-field__label">Tags (comma separated)</span>
                <input class="au-input" type="text" [(ngModel)]="form.tagsText" placeholder="movies, tv, trade" />
              </label>
              <label class="au-field">
                <span class="au-field__label">Respect robots.txt</span>
                <select class="au-select" [(ngModel)]="form.respectRobots">
                  <option [ngValue]="true">Yes</option>
                  <option [ngValue]="false">No</option>
                </select>
              </label>
              <label class="au-field">
                <span class="au-field__label">Rate limits (JSON, optional)</span>
                <input class="au-input" type="text" [(ngModel)]="form.rateLimitsText" placeholder='{"maxRequestsPerMinute": 6, "minIntervalMs": 10000}' />
              </label>
              <label class="au-field">
                <span class="au-field__label">Extraction policy (JSON, optional)</span>
                <input class="au-input" type="text" [(ngModel)]="form.extractionPolicyText" placeholder='{"extractArticleMetadataOnly": true}' />
              </label>
            </div>
          </details>
          <div class="au-panel au-panel--padded au-mb-3" *ngIf="feedCandidates.length > 0">
            <h3 class="au-panel__title">Discovered endpoints for {{ discoveredHostname }}</h3>
            <p class="au-panel__subtitle">Verified endpoints only. Pick one to use — nothing is subscribed automatically.</p>
            <ul class="au-list">
              <li class="au-list__item" *ngFor="let candidate of feedCandidates">
                <div class="au-flex-1">
                  <span class="au-badge au-badge--success" *ngIf="candidate.verified">verified</span>
                  <span class="au-badge au-badge--warning" *ngIf="!candidate.verified">unverified</span>
                  <span class="au-badge au-badge--outline au-ml-1">{{ candidate.type }}</span>
                  <span class="au-badge au-badge--outline au-ml-1">{{ candidate.method }}</span>
                  <div class="au-truncate au-muted" style="max-width: 640px">{{ candidate.url }}</div>
                  <div class="au-muted" *ngIf="candidate.note">{{ candidate.note }}</div>
                </div>
                <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="useCandidate(candidate)" [disabled]="!candidate.verified">Use this endpoint</button>
              </li>
            </ul>
          </div>
          <div class="au-panel au-panel--padded au-mb-3" *ngIf="draftTest">
            <h3 class="au-panel__title">Preview — {{ draftTest.itemCount ?? 0 }} items</h3>
            <div class="au-muted au-mb-2" *ngIf="!draftTest.ok">{{ draftTest.message }}</div>
            <table class="au-table" *ngIf="draftTest.ok && draftTest.sample?.length">
              <thead><tr><th>Title</th><th>Published</th><th>Category</th></tr></thead>
              <tbody>
                <tr *ngFor="let item of draftTest.sample">
                  <td><span class="au-table__title">{{ item['title'] }}</span><span class="au-table__sub au-truncate" style="display:block;max-width:420px">{{ item['canonicalUrl'] }}</span></td>
                  <td class="au-nowrap au-muted">{{ dateLabel(item['publishedAt']) }}</td>
                  <td class="au-muted">{{ categoriesLabel(item) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="au-form__actions">
            <button class="au-btn au-btn--ghost" type="button" *ngIf="editingId" (click)="resetForm()">Cancel</button>
            <button class="au-btn au-btn--secondary" type="button" (click)="testDraft()" [disabled]="!form.url || testingDraft">
              {{ testingDraft ? 'Testing…' : 'Test connection' }}
            </button>
            <button class="au-btn au-btn--primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save source' }}</button>
          </div>
        </section>

        <div class="advanced-source-stack profile-reference">
          <aside class="au-panel au-panel--padded" aria-labelledby="source-checklist">
            <div class="advanced-card-header">
              <h2 class="au-panel__title" id="source-checklist">Antes de añadir una fuente</h2>
              <p>Comprueba la URL y revisa una muestra de los elementos que podrá leer Studio.</p>
            </div>
          </aside>
          <ng-container *ngTemplateOutlet="sourcePacks"></ng-container>
        </div>
      </div>

      <ng-template #sourcePacks>
        <section class="card" aria-labelledby="source-packs">
          <div class="card-header">
            <div><h2 id="source-packs">Paquetes de fuentes</h2><p>Packs de importación preconfigurados, con revisión previa</p></div>
          </div>
          <app-empty-state *ngIf="!packs.length" icon="sources" title="Aún no hay paquetes disponibles" text="Los paquetes registrados en Studio aparecerán aquí."></app-empty-state>
          <div class="grid2">
            <article class="source-pack" *ngFor="let pack of packs">
              <h3>{{ pack.name }}</h3>
              <p>{{ pack.description }}</p>
              <div class="source-pack__actions">
                <span class="badge">{{ pack.entryCount }} {{ pack.entryCount === 1 ? 'fuente' : 'fuentes' }}</span>
                <details class="source-pack__details">
                  <summary class="btn primary small">Inspeccionar e importar<span class="visually-hidden"> {{ pack.name }}</span></summary>
                  <p>{{ pack.importedSourceCount }} importadas · {{ pack.providerCount }} proveedores</p>
                  <ul *ngIf="pack.entries.length">
                    <li *ngFor="let entry of pack.entries">
                      <strong>{{ entry.name }}</strong> · {{ entry.adapter }} · {{ entry.discoveryMethod }}
                      <div>{{ entry.endpoint }}</div><p *ngIf="entry.notes">{{ entry.notes }}</p>
                    </li>
                  </ul>
                  <label class="source-option"><input type="checkbox" [(ngModel)]="importEnabled" /> Activar las fuentes tras importar</label>
                  <label class="source-option"><input type="checkbox" [(ngModel)]="importWithProviders" /> Incluir proveedores de enriquecimiento</label>
                  <button class="btn primary small" type="button" (click)="importPack(pack.key)" [disabled]="!!importingPack">{{ importingPack === pack.key ? 'Importando…' : 'Importar paquete' }}</button>
                </details>
              </div>
            </article>
          </div>
        </section>
      </ng-template>

      <div class="profile-reference source-diagnostics" *ngIf="view === 'settings'">
        <p class="section-note"><app-icon name="info"></app-icon><span><strong>Zona especializada.</strong> Diagnostica la ingesta, importa paquetes y consulta el estado de los proveedores. Las credenciales y la configuración global se gestionan desde Conexiones.</span></p>
        <p class="au-error" role="alert" *ngIf="feedback">{{ feedback }}</p>
        <div class="split">
          <div class="stack">
            <ng-container *ngTemplateOutlet="sourcePacks"></ng-container>

            <section class="card" aria-labelledby="source-providers">
              <div class="card-header">
                <div><h2 id="source-providers">Proveedores de enriquecimiento</h2><p>La información de configuración no revela las credenciales</p></div>
                <button class="btn small" type="button" [attr.aria-expanded]="showProviderForm" (click)="showProviderForm = !showProviderForm">{{ showProviderForm ? 'Cerrar formulario' : 'Añadir proveedor' }}</button>
              </div>
              <form *ngIf="showProviderForm" class="stack provider-form" (ngSubmit)="addProvider()">
                <div class="fields">
                  <label class="profile-field"><span>Identificador</span><input class="input" type="text" name="key" required [(ngModel)]="providerForm.key" /></label>
                  <label class="profile-field"><span>Nombre</span><input class="input" type="text" name="name" required [(ngModel)]="providerForm.name" /></label>
                  <label class="profile-field"><span>Tipo de proveedor</span><input class="input" type="text" name="providerType" required [(ngModel)]="providerForm.providerType" /></label>
                  <label class="profile-field"><span>URL base</span><input class="input" type="url" name="baseUrl" [(ngModel)]="providerForm.baseUrl" /></label>
                  <label class="profile-field"><span>Ruta del endpoint</span><input class="input" type="text" name="endpoint" [(ngModel)]="providerForm.endpoint" /></label>
                  <label class="profile-field"><span>Referencia de credenciales</span><input class="input" type="text" name="credentialsRef" [(ngModel)]="providerForm.credentialsRef" /><small>Nombre de la variable de entorno en el servidor.</small></label>
                </div>
                <div class="source-pack__actions"><button class="btn small primary" type="submit" [disabled]="savingProvider">{{ savingProvider ? 'Guardando…' : 'Guardar proveedor' }}</button></div>
              </form>
              <app-empty-state *ngIf="!providers.length" icon="sources" title="Aún no hay proveedores" text="Importa un paquete con proveedores o añade uno manualmente."></app-empty-state>
              <div class="table-wrap" role="region" aria-label="Proveedores" tabindex="0" *ngIf="providers.length">
                <table class="table provider-table">
                  <thead><tr><th scope="col">Proveedor</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col">Comprobación</th><th scope="col" aria-label="Acciones"></th></tr></thead>
                  <tbody>
                    <tr *ngFor="let provider of providers">
                      <td>
                        <strong>{{ provider.name }}</strong>
                        <details class="provider-details">
                          <summary>Configuración</summary>
                          <div>{{ provider.key }}</div><div>{{ provider.baseUrl ?? '—' }}{{ provider.endpoint ?? '' }}</div>
                          <div>{{ provider.credentialsConfigured ? 'Referencia configurada' : provider.credentialsRef || 'Sin referencia' }}</div>
                        </details>
                      </td>
                      <td>{{ provider.providerType }}</td>
                      <td><span class="badge" [class.ok]="provider.enabled" [class.warning]="!provider.enabled">{{ provider.enabled ? 'Activo' : 'Pausado' }}</span></td>
                      <td><span class="badge" [class.ok]="provider.verificationStatus === 'verified'" [class.warning]="provider.verificationStatus !== 'verified'">{{ providerCheckLabels[provider.verificationStatus ?? 'unverified'] || provider.verificationStatus }}</span></td>
                      <td class="actions">
                        <div class="source-provider-actions">
                          <button class="btn small" type="button" (click)="testProvider(provider)" [disabled]="!!testingProvider">{{ testingProvider === provider.id ? 'Probando…' : 'Probar' }}</button>
                          <button class="btn small ghost" type="button" (click)="toggleProvider(provider)">{{ provider.enabled ? 'Pausar' : 'Activar' }}</button>
                          <button class="btn small ghost source-danger" type="button" (click)="removeProvider(provider)">Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="callout provider-result" role="status" *ngIf="providerTestResult"><h3>Resultado de la comprobación</h3><p>{{ providerTestResult }}</p></div>
            </section>
          </div>

          <aside class="stack" aria-label="Política y conexiones">
            <section class="card" aria-labelledby="source-policy">
              <div class="card-header"><div><h2 id="source-policy">Política de extracción</h2><p>Reglas de confianza y protección</p></div></div>
              <dl class="source-policy">
                <div class="metric-line"><dt class="metric-label">Robots y restricciones</dt><dd>Por fuente</dd></div>
                <div class="metric-line"><dt class="metric-label">Cuotas de lectura</dt><dd>Por feed o endpoint</dd></div>
                <div class="metric-line"><dt class="metric-label">Licencias</dt><dd>Revisión específica</dd></div>
                <div class="metric-line"><dt class="metric-label">LLM y credenciales</dt><dd>Configuración</dd></div>
                <div class="metric-line"><dt class="metric-label">Retención y borrado</dt><dd>Operaciones administrativas</dd></div>
              </dl>
              <a class="btn small" routerLink="/studio/settings/discovery">Ir a Descubrimiento web <app-icon name="external"></app-icon></a>
            </section>
            <section class="card" aria-labelledby="source-connection">
              <div class="card-header"><div><h2 id="source-connection">Claridad sobre la conexión</h2><p>Evitar estados engañosos</p></div></div>
              <p class="source-muted">Configurado, autenticado, verificado y operativo son estados distintos. Una clave guardada solo indica configuración.</p>
              <a class="btn small ghost" routerLink="/studio/connections">Abrir Conexiones</a>
            </section>
          </aside>
        </div>
        <details class="card source-domain-details">
          <summary>Gestionar dominios descubiertos y bloqueados</summary>
          <div class="stack"><ng-container *ngTemplateOutlet="domainDiagnostics"></ng-container></div>
        </details>
      </div>
    </section>
  `,
})
export class SourcesPageComponent implements OnInit {
  @ViewChild(SiteSourceRegistryComponent) registry?: SiteSourceRegistryComponent;
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  sourceTypes: SourceType[] = ['rss', 'atom', 'html', 'sitemap', 'api', 'htmllist', 'imdb', 'manual'];
  sources: StudioSource[] = [];
  sites: StudioSite[] = [];
  showForm = false;
  saving = false;
  editingId: string | null = null;
  fetching: Record<string, boolean> = {};
  feedback = '';
  view: SourcesView = 'sources';
  /** New sources default to the active site; null shares them with every site. */
  readonly activeSiteId = this.appContext.activeSite()?.id ?? null;
  recommendations: SourceRecommendation[] = [];
  domains: DiscoveredDomain[] = [];
  blockedDomains: BlockedDomain[] = [];
  busyRecommendation = '';
  runningDiscovery = false;
  includeArchived = false;

  // Feed discovery + draft test
  discoveringFeeds = false;
  testingDraft = false;
  feedCandidates: StudioFeedCandidate[] = [];
  discoveryResult: StudioFeedDiscoveryResult | null = null;
  discoveredHostname = '';
  draftTest: { ok: boolean; itemCount?: number; sample?: Array<Record<string, unknown>>; message?: string } | null = null;

  // Bulk operations
  selected = new Set<string>();
  bulkRunning = false;
  bulkFeedback = '';
  bulkCategory = '';
  bulkSiteId: string | null = null;

  // Source detail & runs
  detailSource: StudioSource | null = null;
  detailId: string | null = null;
  runs: Array<{
    id: string;
    runKey: string;
    status: string;
    startedAt: string;
    durationMs: number | null;
    itemsFound: number;
    itemsCreated: number;
    itemsDuplicated: number;
    errorMessage: string | null;
  }> = [];

  // Source packs
  packs: StudioSourcePack[] = [];
  importingPack = '';
  importEnabled = true;
  importWithProviders = false;

  // Enrichment providers
  providers: StudioEnrichmentProvider[] = [];
  testingProvider = '';
  savingProvider = false;
  showProviderForm = false;
  readonly providerCheckLabels: Record<string, string> = { verified: 'Verificado', unverified: 'Sin verificar', unsupported: 'No compatible', failed: 'Fallido' };
  providerTestResult = '';
  providerForm = { key: '', name: '', providerType: '', baseUrl: '', endpoint: '', credentialsRef: '' };

  form = {
    name: '',
    type: 'rss' as SourceType,
    url: '',
    domain: '',
    siteId: this.activeSiteId as string | null,
    refreshIntervalMinutes: 30,
    priority: 0,
    trustScore: 0.5,
    authorityScore: 0.5,
    language: 'es',
    country: '',
    categoriesText: '',
    tagsText: '',
    configurationText: '',
    rateLimitsText: '',
    extractionPolicyText: '',
    respectRobots: true,
    discoveryMethod: '' as string,
  };

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    // Sections are picked in the sidebar (?tab=).
    this.route.queryParamMap.subscribe((params) => this.setView(sectionFor('/studio/sources', params.get('tab')) as SourcesView));
  }

  setView(view: SourcesView): void {
    this.view = view;
    this.feedback = '';
    if (view === 'add') {
      this.resetForm();
      this.loadPacks();
    }
    if (view === 'settings') {
      this.loadPacks();
      this.loadDiscovered();
      this.loadBlocked();
      this.loadProviders();
    }
  }

  loadDiscovered(): void {
    this.api.listDiscoveredDomains(1, 50).subscribe({
      next: (response) => { this.domains = response.items; },
      error: () => { this.domains = []; },
    });
  }

  loadBlocked(): void {
    this.api.listBlockedDomains().subscribe({
      next: (response) => { this.blockedDomains = response.items; },
      error: () => { this.blockedDomains = []; },
    });
  }

  blockDomain(domain: string): void {
    this.api.blockDiscoveredDomain(domain).subscribe({
      next: () => {
        this.toast.success(`${domain} blocked from discovery.`);
        this.loadDiscovered();
        this.loadBlocked();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Could not block the domain.');
      },
    });
  }

  unblockDomain(domain: string): void {
    this.api.unblockDiscoveredDomain(domain).subscribe({
      next: () => {
        this.toast.success(`${domain} unblocked.`);
        this.loadBlocked();
        this.loadDiscovered();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Could not unblock the domain.');
      },
    });
  }

  runDiscovery(): void {
    this.runningDiscovery = true;
    this.api.runDiscoveryNow().subscribe({
      next: () => {
        this.runningDiscovery = false;
        this.toast.success('AI discovery started. Results appear shortly.');
        setTimeout(() => this.loadDiscovered(), 4000);
      },
      error: (error) => {
        this.runningDiscovery = false;
        this.feedback = String(error?.error?.message ?? 'Discovery could not be started.');
      },
    });
  }

  save(): void {
    if (!this.form.name.trim()) {
      this.feedback = 'Name is required.';
      return;
    }
    let configuration: Record<string, unknown> | undefined;
    if (this.form.configurationText.trim()) {
      try {
        const parsed = JSON.parse(this.form.configurationText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        configuration = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Configuration must be valid JSON.';
        return;
      }
    }
    let rateLimitPolicy: Record<string, unknown> | undefined;
    if (this.form.rateLimitsText.trim()) {
      try {
        const parsed = JSON.parse(this.form.rateLimitsText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        rateLimitPolicy = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Rate limits must be valid JSON.';
        return;
      }
    }
    let extractionPolicy: Record<string, unknown> | undefined;
    if (this.form.extractionPolicyText.trim()) {
      try {
        const parsed = JSON.parse(this.form.extractionPolicyText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        extractionPolicy = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Extraction policy must be valid JSON.';
        return;
      }
    }
    const payload = {
      name: this.form.name.trim(),
      type: this.form.type,
      url: this.form.type === 'manual' ? undefined : this.form.url.trim(),
      domain: this.form.domain.trim() || undefined,
      siteId: this.form.siteId ?? undefined,
      refreshIntervalMinutes: Math.max(5, this.form.refreshIntervalMinutes),
      priority: this.form.priority,
      trustScore: this.form.trustScore,
      authorityScore: this.form.authorityScore,
      language: this.form.language || 'es',
      country: this.form.country.trim() || undefined,
      categories: this.form.categoriesText.split(',').map((item) => item.trim()).filter(Boolean),
      tags: this.form.tagsText.split(',').map((item) => item.trim()).filter(Boolean),
      configuration,
      rateLimitPolicy,
      robotsPolicy: { respect: this.form.respectRobots },
      extractionPolicy,
      discoveryMethod: this.form.discoveryMethod || undefined,
    };
    this.saving = true;
    const request = this.editingId
      ? this.api.updateSource(this.editingId, payload)
      : this.api.createSource(payload);
    request.subscribe({
      next: () => {
        this.saving = false;
        this.resetForm();
        this.toast.success('Source saved. It now appears in Sources.');
      },
      error: (error) => {
        this.saving = false;
        this.feedback = String(error?.error?.message ?? 'Failed to save source.');
      },
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.showForm = false;
    this.feedCandidates = [];
    this.discoveryResult = null;
    this.draftTest = null;
    this.form = {
      name: '',
      type: 'rss',
      url: '',
      domain: '',
      siteId: this.activeSiteId,
      refreshIntervalMinutes: 30,
      priority: 0,
      trustScore: 0.5,
      authorityScore: 0.5,
      language: 'es',
      country: '',
      categoriesText: '',
      tagsText: '',
      configurationText: '',
      rateLimitsText: '',
      extractionPolicyText: '',
      respectRobots: true,
      discoveryMethod: '',
    };
  }

  // ── Feed discovery ───────────────────────────────────────────────────

  discoverFeeds(): void {
    const target = this.form.url.trim();
    if (!target) {
      this.feedback = 'Enter a URL or domain to discover feeds.';
      return;
    }
    this.discoveringFeeds = true;
    this.feedback = '';
    this.api.discoverFeeds(target).subscribe({
      next: (result) => {
        this.discoveringFeeds = false;
        this.discoveryResult = result;
        this.discoveredHostname = result.hostname;
        this.feedCandidates = result.candidates.filter((candidate) => candidate.verified || candidate.type === 'feed');
        if (result.errors.length > 0 && this.feedCandidates.length === 0) {
          this.feedback = `Discovery issues: ${result.errors.join('; ')}`;
        }
      },
      error: (error) => {
        this.discoveringFeeds = false;
        this.feedback = String(error?.error?.message ?? 'Feed discovery failed.');
      },
    });
  }

  useCandidate(candidate: StudioFeedCandidate): void {
    this.form.url = candidate.url;
    this.form.domain = this.discoveredHostname || this.form.domain;
    this.form.type = candidate.type === 'atom' ? 'atom' : candidate.type === 'sitemap' || candidate.type === 'news_sitemap' ? 'sitemap' : 'rss';
    this.form.discoveryMethod = candidate.method;
    this.toast.success(`Endpoint selected: ${candidate.url}`);
  }

  testDraft(): void {
    if (!this.form.url.trim() || this.form.type === 'manual') {
      return;
    }
    this.testingDraft = true;
    let configuration: Record<string, unknown> | undefined;
    if (this.form.configurationText.trim()) {
      try {
        configuration = JSON.parse(this.form.configurationText) as Record<string, unknown>;
      } catch {
        this.feedback = 'Configuration must be valid JSON before testing.';
        this.testingDraft = false;
        return;
      }
    }
    this.api.testSourceDraft(this.form.type, this.form.url.trim(), configuration).subscribe({
      next: (result) => {
        this.testingDraft = false;
        this.draftTest = result;
        if (!result.ok) {
          this.feedback = String(result.message ?? 'Test failed.');
        }
      },
      error: (error) => {
        this.testingDraft = false;
        this.draftTest = { ok: false, message: String(error?.error?.message ?? 'Test failed.') };
      },
    });
  }

  // ── Bulk operations ──────────────────────────────────────────────────

  allSelected(): boolean {
    return this.sources.length > 0 && this.sources.every((source) => this.selected.has(source.id));
  }

  // ── Source detail & runs ─────────────────────────────────────────────

  // ── Source packs ─────────────────────────────────────────────────────

  loadPacks(): void {
    this.api.listSourcePacks().subscribe({
      next: (response) => {
        this.packs = response.items;
      },
      error: () => {
        this.packs = [];
      },
    });
  }

  importPack(packKey: string): void {
    this.importingPack = packKey;
    this.api.importSourcePack(packKey, this.importEnabled, this.importWithProviders).subscribe({
      next: (result) => {
        this.importingPack = '';
        this.toast.success(`Pack imported: ${result.imported} sources, ${result.skipped} skipped, ${result.failed} failed.`);
        if (result.errors.length > 0) {
          this.feedback = result.errors.join('; ');
        }
        this.loadPacks();
        this.loadProviders();
      },
      error: (error) => {
        this.importingPack = '';
        this.feedback = String(error?.error?.message ?? 'Import failed.');
      },
    });
  }

  // ── Enrichment providers ─────────────────────────────────────────────

  loadProviders(): void {
    this.api.listEnrichmentProviders(1, 50).subscribe({
      next: (response) => {
        this.providers = response.items;
      },
      error: () => {
        this.providers = [];
      },
    });
  }

  addProvider(): void {
    this.feedback = '';
    if (!this.providerForm.key.trim() || !this.providerForm.name.trim() || !this.providerForm.providerType.trim()) {
      this.feedback = 'Key, name and provider type are required.';
      return;
    }
    this.savingProvider = true;
    this.api.createEnrichmentProvider({
      key: this.providerForm.key.trim(),
      name: this.providerForm.name.trim(),
      providerType: this.providerForm.providerType.trim(),
      baseUrl: this.providerForm.baseUrl.trim() || undefined,
      endpoint: this.providerForm.endpoint.trim() || undefined,
      credentialsRef: this.providerForm.credentialsRef.trim() || undefined,
    }).subscribe({
      next: () => {
        this.savingProvider = false;
        this.providerForm = { key: '', name: '', providerType: '', baseUrl: '', endpoint: '', credentialsRef: '' };
        this.showProviderForm = false;
        this.toast.success('Proveedor añadido.');
        this.loadProviders();
      },
      error: (error) => {
        this.savingProvider = false;
        this.feedback = String(error?.error?.message ?? 'Could not add provider.');
      },
    });
  }

  testProvider(provider: StudioEnrichmentProvider): void {
    this.testingProvider = provider.id;
    this.providerTestResult = '';
    this.api.testEnrichmentProvider(provider.id).subscribe({
      next: (result) => {
        this.testingProvider = '';
        const credentialNote = result.credentialsConfigured ? 'credentials configured' : 'credentials NOT configured';
        this.providerTestResult = result.ok
          ? `OK (HTTP ${result.status ?? '?'}, ${result.itemCount ?? 0} items, ${credentialNote}). Sample: ${(result.sample ?? []).map((item) => String(item['title'] ?? '')).join(' | ')}`
          : `Failed (${credentialNote}): ${result.message ?? 'unknown error'}`;
        this.loadProviders();
      },
      error: (error) => {
        this.testingProvider = '';
        this.providerTestResult = String(error?.error?.message ?? 'Provider test failed.');
      },
    });
  }

  toggleProvider(provider: StudioEnrichmentProvider): void {
    this.api.updateEnrichmentProvider(provider.id, { enabled: !provider.enabled }).subscribe({
      next: () => {
        this.toast.success(provider.enabled ? 'Provider disabled.' : 'Provider enabled.');
        this.loadProviders();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Update failed.');
      },
    });
  }

  removeProvider(provider: StudioEnrichmentProvider): void {
    void this.confirm.confirm({
      title: `Delete enrichment provider "${provider.name}"?`,
      message: 'Enrichment lookups through this provider stop immediately.',
      confirmLabel: 'Delete provider',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.deleteEnrichmentProvider(provider.id).subscribe({
        next: () => {
          this.toast.success('Provider deleted.');
          this.loadProviders();
        },
        error: (error) => {
          this.feedback = String(error?.error?.message ?? 'Delete failed.');
        },
      });
    });
  }

  // ── Health presentation ──────────────────────────────────────────────

  dateLabel(value: unknown): string {
    if (!value) {
      return '—';
    }
    return new Date(String(value)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  categoriesLabel(item: Record<string, unknown>): string {
    const categories = item['categories'];
    return Array.isArray(categories) ? (categories as string[]).join(', ') : '';
  }
}
