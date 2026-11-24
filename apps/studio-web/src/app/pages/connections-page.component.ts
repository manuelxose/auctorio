import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, filter, forkJoin, of, switchMap, take, timeout, timer, type Observable } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { ConnectBoxComponent } from '../components/connect-box.component';
import type {
  ConnectorInstallation,
  PublishingAccount,
  SocialConnection,
  SocialSetupInfo,
} from '../models/studio.models';

type TabId = 'all' | 'websites' | 'social' | 'attention';

type ConnectionRow = {
  id: string;
  kind: 'website' | 'x' | 'instagram' | 'facebook';
  provider: string;
  displayName: string;
  state: string;
  needsAttention: boolean;
  lastError: string | null;
  verifiedAt: string | null;
  activatedAt: string | null;
  siteName: string | null;
  social?: SocialConnection;
  website?: PublishingAccount;
  installation?: ConnectorInstallation;
};

@Component({
  selector: 'app-connections-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, ConnectBoxComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header au-page__header--split">
        <div>
          <p class="au-page__eyebrow">Destinos de publicación</p>
          <h1 class="au-page__title">Conexiones</h1>
          <p class="au-page__subtitle">Los sitios web y las cuentas sociales en los que publica Auctorio, con su estado de verificación</p>
        </div>
      </header>

      <app-connect-box *ngIf="canManage && !diagnostics" title="Conectar un sitio o una cuenta"></app-connect-box>
      <p><a routerLink="/studio/settings/social">Ajustes de redes</a></p>
      <div class="au-banner" *ngIf="!canManage">Necesitas el permiso integrations.manage para gestionar las conexiones.</div>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Reintentar</button>
      </div>

      <div class="au-banner" *ngIf="setup && !setup.provider.configured">
        <app-icon name="info"></app-icon>
        <span class="au-banner__text">
          Las conexiones sociales con un clic necesitan un proveedor configurado en el servidor (API gestionada de Ayrshare o tus propias apps de desarrollador de X/Meta).
          Mientras tanto, siguen disponibles los destinos de sitio web y las referencias avanzadas de credenciales.
        </span>
      </div>

      <h2 class="au-panel__title" *ngIf="diagnostics">Verificación y credenciales</h2>
      <p class="workspace-caption" *ngIf="!loading">{{ rows.length }} destinos · {{ filteredRows.length }} mostrados</p>
      <div class="au-tabs" role="tablist" aria-label="Tipos de conexión">
        <button
          class="au-tab"
          type="button"
          role="tab"
          *ngFor="let tab of tabs"
          [class.is-active]="activeTab === tab.id"
          [attr.aria-selected]="activeTab === tab.id"
          (click)="selectTab(tab.id)"
        >
          {{ tab.label }}
          <span class="au-tab__count" *ngIf="countFor(tab.id) > 0">{{ countFor(tab.id) }}</span>
        </button>
      </div>

      <div class="au-toolbar au-mb-2">
        <label class="au-search au-flex-1">
          <app-icon name="search"></app-icon>
          <input
            class="au-search__input"
            type="search"
            placeholder="Buscar conexiones…"
            [(ngModel)]="search"
            (input)="applyFilters()"
            aria-label="Buscar conexiones"
          />
        </label>
      </div>

      <div class="au-skeleton-list" *ngIf="loading" aria-label="Cargando conexiones">
        <div class="au-skeleton" *ngFor="let _ of [1, 2, 3]" style="height: 76px"></div>
      </div>

      <app-empty-state
        *ngIf="!loading && !loadError && rows.length === 0"
        icon="connections"
        title="Aún no hay destinos"
        text="Conecta un sitio web, X o Instagram para empezar a publicar."
      >
        <a *ngIf="canManage" class="au-btn au-btn--primary" routerLink="/studio/connections/wizard">Conectar destino</a>
      </app-empty-state>

      <div class="au-empty-note" *ngIf="!loading && !loadError && rows.length > 0 && filteredRows.length === 0">
        Ninguna conexión coincide con esta vista.
      </div>

      <div class="au-table-wrap au-table-wrap--scrollable" *ngIf="filteredRows.length > 0">
        <table class="au-table au-table--hover">
          <thead>
            <tr>
              <th scope="col">Destino</th>
              <th scope="col">Tipo</th>
              <th scope="col">Sitio</th>
              <th scope="col">Estado</th>
              <th scope="col">Última comprobación</th>
              <th scope="col" class="au-table__actions"><span class="au-visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of filteredRows">
              <td data-label="Destino">
                <div class="au-cell-title">
                  <span class="au-platform-icon au-platform-icon--sm" aria-hidden="true">{{ mark(row.kind) }}</span>
                  <div>
                    <div class="au-cell-title__name">{{ row.displayName }}</div>
                    <div class="au-cell-title__meta">
                      {{ row.social?.username ? '@' + row.social!.username : row.website?.externalAccountId || row.installation?.provider || row.provider }}
                    </div>
                  </div>
                </div>
              </td>
              <td data-label="Tipo">{{ kindLabel(row.kind) }}</td>
              <td data-label="Sitio">{{ row.siteName || 'Workspace por defecto' }}</td>
              <td data-label="Estado">
                <span class="au-badge" [class]="badgeClass(row)">{{ stateLabel(row) }}</span>
                <div *ngIf="row.installation">Ciclo de vida: {{ row.installation.state }}<span *ngIf="row.installation.kind === 'website'"> · Verificación: {{ row.installation.verificationStage || 'desconocida' }}</span></div>
                <div *ngIf="row.installation">{{ row.installation.hasCredentials ? 'Credenciales guardadas' : 'Sin credenciales guardadas' }}</div>
                <div *ngIf="row.website">{{ row.website.hasCredentials ? 'Credenciales guardadas' : 'Sin credenciales guardadas' }}</div>
                <div *ngIf="row.lastError">{{ row.lastError }}</div>
                <div *ngIf="row.social">{{ row.social.hasCredentials ? 'Credenciales guardadas' : 'Sin credenciales guardadas' }}<span *ngIf="row.social.connectionState === 'permissions_required'"> · Permisos necesarios</span></div>
              </td>
              <td data-label="Última comprobación">
                {{ row.verifiedAt ? (row.verifiedAt | date: 'd MMM y, HH:mm') : 'Aún sin comprobar' }}
              </td>
              <td class="au-table__actions">
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.website" (click)="verifyLegacy(row.website)" [disabled]="busyId === row.id">
                  Probar
                </button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.social" (click)="verifySocial(row.social)" [disabled]="busyId === row.id">
                  Probar
                </button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.installation?.kind === 'website' && row.installation?.state === 'active' && row.installation?.hasCredentials" (click)="verifyWebsite(row.installation!)" [disabled]="busyId === row.id">Probar sitio web</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.social && row.social.connectionState !== 'connected'" (click)="reconnect(row.social)" [disabled]="busyId === row.id">Reconectar</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.installation && resumable(row.installation)" (click)="resume(row.installation)">Abrir configuración</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && (row.website || row.social || (row.installation && row.installation.state !== 'disabled' && (row.installation.kind === 'website' || !isActive(row.installation))))" (click)="remove(row)" [disabled]="busyId === row.id" [attr.aria-label]="(row.installation?.state === 'active' ? 'Desconectar ' : 'Quitar ') + row.displayName">
                  <app-icon name="trash"></app-icon>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class ConnectionsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly tabs: Array<{ id: TabId; label: string }> = [
    { id: 'all', label: 'Todas' },
    { id: 'websites', label: 'Sitios web' },
    { id: 'social', label: 'Redes' },
    { id: 'attention', label: 'Requieren atención' },
  ];

  get canManage(): boolean { return this.appContext.permissions().includes('integrations.manage'); }
  private loadVersion = 0;

  activeTab: TabId = 'all';
  search = '';
  loading = true;
  diagnostics = false;
  loadError = '';
  busyId = '';
  rows: ConnectionRow[] = [];
  filteredRows: ConnectionRow[] = [];
  setup: SocialSetupInfo | null = null;
  socialConnections: SocialConnection[] = [];
  websiteAccounts: PublishingAccount[] = [];
  installations: ConnectorInstallation[] = [];

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.diagnostics = params.get('tab') === 'status';
      const filter = params.get(this.diagnostics ? 'filter' : 'tab');
      this.activeTab = filter === 'websites' || filter === 'social' || filter === 'attention' ? filter : 'all';
      this.applyFilters();
    });
    const query = this.route.snapshot.queryParamMap.get('q');
    if (query) {
      this.search = query;
    }
    this.load();
    this.readCallbackStatus();
  }

  private readCallbackStatus(): void {
    const status = this.route.snapshot.queryParamMap.get('social');
    const reason = this.route.snapshot.queryParamMap.get('reason') || '';
    if (status === 'success') {
      this.toast.success('Cuenta social conectada.');
    } else if (status === 'error') {
      this.toast.error(reason ? `Conexión fallida: ${reason}` : 'La conexión ha fallado. Inténtalo de nuevo.');
    } else if (status === 'cancelled') {
      this.toast.info('Conexión cancelada.');
    }
    if (this.isBrowser && status) {
      const url = new URL(window.location.href);
      url.searchParams.delete('social');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    const version = ++this.loadVersion;
    forkJoin({
      social: this.api.listSocialConnections().pipe(catchError(() => of(null))),
      accounts: this.api.listPublishingAccounts().pipe(catchError(() => of(null))),
      installations: this.api.listConnectorInstallations().pipe(catchError(() => of(null))),
      setup: this.api.getSocialSetup().pipe(catchError(() => of(null))),
    }).subscribe(({ social, accounts, installations, setup }) => {
      if (version !== this.loadVersion) return;
      this.socialConnections = social?.items.filter((item) => ['x', 'instagram', 'facebook'].includes(item.platform)) ?? [];
      this.websiteAccounts = accounts?.items ?? [];
      this.installations = installations?.items ?? [];
      this.setup = setup;
      const failed = [!social && 'social connections', !accounts && 'publishing accounts', !installations && 'installations', !setup && 'social setup'].filter(Boolean);
      this.loadError = failed.length ? `No se pudo cargar: ${failed.join(', ')}. Debajo se muestran los demás resultados.` : '';
      this.loading = false;
      this.rebuildRows();
    });
  }

  private rebuildRows(): void {
    const merged = new Map<string, ConnectionRow>();
    // An installation is the canonical record: hide a legacy website account of the same site.
    const covered = new Set(this.installations.filter((i) => i.kind === 'website' && (i.state === 'active' || i.state === 'disabled') && i.siteId).map((i) => i.siteId));
    for (const account of this.websiteAccounts) {
      if (this.socialConnections.some((social) => social.id === account.id)) continue;
      if (account.platform === 'website' && account.site?.id && covered.has(account.site.id)) continue;
      merged.set(`website:${account.id}`, {
        id: account.id,
        kind: account.platform,
        provider: account.provider || 'legacy',
        displayName: account.displayName,
        state: !account.enabled ? 'disabled' : account.status === 'active' ? (account.lastVerifiedAt ? 'connected' : 'not_verified') : account.status === 'error' ? 'error' : account.status,
        needsAttention: !account.enabled || account.status === 'error' || (account.status === 'active' && !account.lastVerifiedAt),
        lastError: null,
        verifiedAt: account.lastVerifiedAt,
        activatedAt: account.connectedAt ?? null,
        siteName: account.site?.name ?? null,
        website: account,
      });
    }
    for (const social of this.socialConnections) {
      merged.set(`social:${social.id}`, {
        id: social.id,
        kind: social.platform,
        provider: social.provider,
        displayName: social.displayName,
        state: social.connectionState,
        needsAttention: ['expired', 'permissions_required', 'provider_error'].includes(social.connectionState),
        lastError: social.lastError,
        verifiedAt: social.lastVerifiedAt,
        activatedAt: social.connectedAt,
        siteName: null,
        social,
      });
    }
    for (const installation of this.installations) {
      if (installation.kind !== 'website' && installation.externalAccountId && this.socialConnections.some((social) => social.id === installation.externalAccountId)) continue;
      merged.set(`installation:${installation.id}`, {
        id: installation.id,
        kind: installation.kind,
        provider: installation.provider,
        displayName: installation.displayName ?? installation.provider,
        // Active alone is not proof: it must also carry a recorded verification and no last error.
        state: this.installationState(installation),
        needsAttention: ['failed', 'expired', 'credentials_required', 'not_verified', 'error', 'stale', 'read_only', 'unconfigured', 'stored', 'authenticated'].includes(this.installationState(installation)),
        lastError: installation.lastError,
        verifiedAt: installation.verifiedAt,
        activatedAt: installation.activatedAt,
        siteName: this.appContext.sites().find((site) => site.id === installation.siteId)?.name ?? null,
        installation,
      });
    }
    this.rows = Array.from(merged.values()).sort((a, b) => {
      const score = (row: ConnectionRow): number => (row.needsAttention ? 0 : 1);
      return score(a) - score(b) || String(a.displayName).localeCompare(String(b.displayName));
    });
    this.applyFilters();
  }

  applyFilters(): void {
    const query = this.search.trim().toLowerCase();
    this.filteredRows = this.rows.filter((row) => {
      if (this.activeTab === 'websites' && row.kind !== 'website') {
        return false;
      }
      if (this.activeTab === 'social' && row.kind === 'website') {
        return false;
      }
      if (this.activeTab === 'attention' && !row.needsAttention) {
        return false;
      }
      if (query) {
        const haystack = `${row.displayName} ${row.provider} ${row.siteName ?? ''}`.toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });
  }

  selectTab(tab: TabId): void {
    this.activeTab = tab;
    this.applyFilters();
    const query = this.route.snapshot.queryParams;
    void this.router.navigate([], {
      queryParams: this.diagnostics ? { filter: tab === 'all' ? null : tab } : { ...query, tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  countFor(tab: TabId): number {
    if (tab === 'websites') {
      return this.rows.filter((row) => row.kind === 'website').length;
    }
    if (tab === 'social') {
      return this.rows.filter((row) => row.kind !== 'website').length;
    }
    if (tab === 'attention') {
      return this.rows.filter((row) => row.needsAttention).length;
    }
    return this.rows.length;
  }

  mark(kind: string): string {
    return kind === 'x' ? 'X' : kind === 'instagram' ? 'IG' : kind === 'facebook' ? 'FB' : 'WEB';
  }

  kindLabel(kind: string): string {
    return kind === 'x' ? 'X (Twitter)' : kind === 'instagram' ? 'Instagram' : kind === 'facebook' ? 'Facebook' : 'Sitio web';
  }

  installationState(installation: ConnectorInstallation): string {
    if (installation.state !== 'active') return installation.state;
    if (installation.lastError) return 'error';
    if (installation.kind !== 'website') return installation.verifiedAt ? 'active' : 'not_verified';
    return installation.verificationStage === 'ready' ? 'active' : installation.verificationStage || 'not_verified';
  }

  stateLabel(row: ConnectionRow): string {
    switch (row.state) {
      case 'not_verified':
        return 'Sin verificar';
      case 'unconfigured': return 'Sin configurar';
      case 'stored': return 'Credenciales guardadas';
      case 'authenticated': return 'Autenticado';
      case 'read_only': return 'Acceso de solo lectura';
      case 'stale': return 'Verificación caducada';
      case 'connected':
        return 'Conectado';
      case 'active':
        return 'Activo';
      case 'ready':
        return 'Listo para activar';
      case 'verifying':
        return 'Verificando…';
      case 'discovering':
        return 'Detectando…';
      case 'credentials_required':
        return 'Faltan credenciales';
      case 'failed':
        return 'Acción necesaria';
      case 'expired':
        return 'Reconexión necesaria';
      case 'permissions_required':
        return 'Permisos necesarios';
      case 'provider_error':
        return 'Error del proveedor';
      case 'disabled':
        return 'Deshabilitado';
      case 'error':
        return 'Acción necesaria';
      case 'draft':
        return 'Borrador';
      case 'cancelled':
        return 'Cancelado';
      default:
        return row.state;
    }
  }

  badgeClass(row: ConnectionRow): string {
    switch (row.state) {
      case 'connected':
      case 'active':
        return 'au-badge--success';
      case 'ready':
      case 'not_verified':
      case 'unconfigured':
      case 'stored':
      case 'authenticated':
      case 'read_only':
      case 'stale':
      case 'verifying':
      case 'discovering':
      case 'draft':
        return 'au-badge--warning';
      case 'failed':
      case 'error':
      case 'expired':
      case 'permissions_required':
      case 'provider_error':
        return 'au-badge--danger';
      default:
        return 'au-badge--neutral';
    }
  }

  resumable(installation: ConnectorInstallation): boolean {
    if (installation.kind !== 'website' && installation.state === 'active') return false;
    if (installation.state === 'active') return this.installationState(installation) !== 'active';
    return ['draft', 'credentials_required', 'failed', 'ready', 'cancelled', 'disabled', 'expired'].includes(installation.state);
  }

  isActive(installation: ConnectorInstallation): boolean {
    return installation.state === 'active' || installation.state === 'disabled';
  }

  resume(installation: ConnectorInstallation): void {
    if (!this.canManage) return;
    if (installation.kind === 'website' && installation.state === 'disabled') {
      const target = this.appContext.sites().find((site) => site.id === installation.siteId)?.baseUrl;
      void this.router.navigate(['/studio/connections/wizard'], { queryParams: target ? { target } : {} });
      return;
    }
    void this.router.navigate(['/studio/connections/wizard', installation.id]);
  }

  reconnect(connection: SocialConnection): void {
    if (!this.canManage || !this.isBrowser) return;
    this.busyId = connection.id;
    this.api.reconnectSocialConnection(connection.id).subscribe({
      next: (session) => { this.busyId = ''; window.location.assign(session.url); },
      error: (error) => { this.busyId = ''; this.toast.error(error?.error?.message || 'No se pudo reconectar.'); },
    });
  }

  verifySocial(connection: SocialConnection): void {
    if (!this.canManage) return;
    this.busyId = connection.id;
    this.api.verifySocialConnection(connection.id).subscribe({
      next: (result) => {
        this.busyId = '';
        if (result.ok) {
          this.toast.success('Conexión verificada.');
        } else {
          this.toast.info(result.message || 'La conexión requiere atención.');
        }
        this.load();
      },
      error: () => {
        this.busyId = '';
        this.toast.error('La comprobación de la conexión ha fallado.');
      },
    });
  }

  verifyLegacy(account: PublishingAccount): void {
    if (!this.canManage) return;
    this.busyId = account.id;
    this.api.verifyPublishingAccount(account.id).subscribe({
      next: (result) => {
        this.busyId = '';
        if (result.ok) {
          this.toast.success('Conexión verificada.');
          this.load();
        } else {
          this.toast.error('La conexión requiere atención.');
          this.load();
        }
      },
      error: () => {
        this.busyId = '';
        this.load();
      },
    });
  }

  async remove(row: ConnectionRow): Promise<void> {
    if (!this.canManage) return;
    const activeWebsite = row.installation?.kind === 'website' && row.installation.state === 'active';
    const action = activeWebsite ? 'Desconectar' : 'Quitar';
    const siteId = this.appContext.activeSite()?.id;
    const confirmed = await this.confirm.confirm({
      title: `${action} ${row.displayName}?`,
      message: activeWebsite ? 'Se bloquearán las nuevas entregas a este sitio web. El historial de publicaciones sigue disponible.'
        : row.website ? '¿Quitar el registro de esta cuenta? Puede que sigan configuradas las credenciales de otros destinos.'
        : 'El historial de publicaciones sigue disponible.',
      confirmLabel: action,
      danger: true,
    });
    if (!confirmed || !this.canManage || siteId !== this.appContext.activeSite()?.id) {
      return;
    }
    this.busyId = row.id;
    if (row.website) {
      this.api.deletePublishingAccount(row.website.id).subscribe({
        next: () => {
          this.busyId = '';
          this.toast.success('Conexión eliminada.');
          this.load();
        },
        error: () => {
          this.busyId = '';
          this.loadError = 'No se pudo eliminar la conexión.';
        },
      });
    } else if (row.social) {
      this.api.disconnectSocialConnection(row.social.id).subscribe({
        next: () => {
          this.busyId = '';
          this.toast.success('Conexión eliminada.');
          this.load();
        },
        error: () => {
          this.busyId = '';
          this.toast.error('No se pudo eliminar la conexión.');
        },
      });
    } else if (row.installation) {
      const request: Observable<unknown> = activeWebsite ? this.api.disconnectConnectorInstallation(row.installation.id) : this.api.deleteConnectorInstallation(row.installation.id);
      request.subscribe({
        next: () => {
          this.busyId = '';
          this.toast.success(activeWebsite ? 'Conexión desconectada.' : 'Borrador eliminado.');
          this.load();
        },
        error: (err) => {
          this.busyId = '';
          this.toast.error(err?.error?.error?.message || 'No se pudo eliminar.');
        },
      });
    }
  }

  verifyWebsite(installation: ConnectorInstallation): void {
    if (!this.canManage || this.busyId) return;
    this.busyId = installation.id;
    this.api.startInstallationVerification(installation.id).pipe(
      switchMap(({ operationId }) => timer(0, 2000).pipe(
        switchMap(() => this.api.getOperation(operationId)),
        filter((operation) => ['succeeded', 'failed', 'cancelled'].includes(operation.status)),
        take(1),
        timeout(120_000),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (operation) => {
        this.busyId = '';
        if (operation.status === 'succeeded') this.toast.success('Sitio web verificado.');
        else this.toast.error('El sitio web no ha superado su última comprobación.');
        this.load();
      },
      error: () => {
        this.busyId = '';
        this.toast.error('Aún no hay resultado de verificación. Revisa los trabajos en segundo plano o inténtalo de nuevo.');
      },
    });
  }
}
