import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, combineLatest, distinctUntilChanged, forkJoin, of } from 'rxjs';
import { sectionFor } from '../layout/studio-nav';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { DiscoverySettingsResponse, StudioRoleSummary, StudioSiteSummary, StudioUserSummary } from '../models/studio.models';

type SettingsSection = 'sites' | 'team' | 'roles' | 'discovery';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent, RouterLink],
  styleUrl: './settings-sites.css',
  template: `
    <section class="au-page">
      <ng-template #siteEditor>
            <form *ngIf="editingSite" #siteForm="ngForm" class="access-form" (ngSubmit)="saveSite()">
              <h3>Edit {{ editingSite.name }}</h3>
              <label>Site name <input class="au-input" name="siteName" [(ngModel)]="siteName" required></label>
              <label>Locale <input class="au-input" name="siteLocale" [(ngModel)]="siteLocale" required></label>
              <p class="au-muted">{{ editingSite.baseUrl || 'No public URL configured' }}. Manage the destination in Connections.</p>
              <p class="au-error" *ngIf="siteEditError" role="alert">{{ siteEditError }}</p>
              <div><button class="au-btn au-btn--primary" type="submit" [disabled]="siteSaving || siteForm.invalid">Save site</button> <button class="au-btn" type="button" [disabled]="siteSaving" (click)="cancelSiteEdit(!!siteForm.dirty)">Cancel</button></div>
            </form>
      </ng-template>
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Workspace settings</p>
          <h1 class="au-page__title">{{ titles[section] }}</h1>
          <p class="au-page__subtitle">{{ descriptions[section] }}</p>
        </div>
      </header>

        <div class="sites-settings" *ngIf="section === 'sites' && tab === 'list'">
          <div class="sites-metrics" *ngIf="!sitesLoading && !sitesError">
            <div class="sites-metric"><span>Sitios registrados</span><strong>{{ sitesTotal }}</strong><small>Workspace</small></div>
            <div class="sites-metric"><span>Destino conectado</span><strong>{{ verifiedSiteCount }}</strong><small>Verificado</small></div>
            <div class="sites-metric"><span>Por verificar</span><strong>{{ tenantSites.length - verifiedSiteCount }}</strong><small>Revisión pendiente</small></div>
            <div class="sites-metric"><span>Artículos asociados</span><strong>{{ sitesArticleCount }}</strong><small>Sitios listados</small></div>
          </div>
          <section class="au-panel au-panel--padded">
            <div class="sites-heading"><div><h2 class="au-panel__title">Tus sitios</h2><p class="au-panel__subtitle">Selecciona el sitio activo y comprueba su conectividad. Borrar no elimina contenido remoto.</p></div>
              <a *ngIf="canManageSites" class="au-btn au-btn--primary" routerLink="/studio/connections/wizard"><app-icon name="plus"></app-icon>Conectar un sitio</a></div>
            <p class="au-muted" *ngIf="sitesLoading">Cargando sitios…</p>
            <p class="au-error" *ngIf="sitesError">No se pudieron cargar los sitios. <button class="au-btn" type="button" (click)="load()">Reintentar</button></p>
            <app-empty-state *ngIf="!sitesLoading && !sitesError && tenantSites.length === 0" icon="globe" title="Sin sitios en el workspace activo" text="Conecta tu primer sitio para empezar."></app-empty-state>
            <div class="site-card" *ngFor="let site of tenantSites">
              <span class="site-card__icon"><app-icon name="globe"></app-icon></span>
              <div class="site-card__details"><strong>{{ site.name }}</strong> <span class="au-badge au-badge--brand" *ngIf="site.id === activeSiteId">Activo</span><p>{{ site.baseUrl || '—' }} · {{ site.locale }} · {{ site.type }}</p></div>
              <div class="site-card__actions">
                <span class="au-badge" [class.au-badge--success]="site.websiteConnection?.stage === 'ready'" [class.au-badge--warning]="site.websiteConnection?.stage !== 'ready'">{{ connectionLabel(site) }}</span>
                <button class="au-btn" type="button" *ngIf="site.id !== activeSiteId" (click)="useSite(site.id)">Activar</button>
                <button class="au-btn" type="button" *ngIf="canManageSites" (click)="editSite(site)" [attr.aria-label]="'Editar ' + site.name">Editar</button>
                <button class="au-btn au-btn--ghost au-btn--danger-ghost" type="button" *ngIf="canManageSites" (click)="deleteSite(site)" [attr.aria-label]="'Eliminar ' + site.name"><app-icon name="trash"></app-icon>Eliminar</button>
              </div>
            </div>
            <ng-container *ngTemplateOutlet="siteEditor"></ng-container>
            <div class="au-pagination" *ngIf="sitesTotal > sitePageSize">
              <button class="au-btn" type="button" [disabled]="sitesLoading || sitePage <= 1" (click)="goToSitePage(sitePage - 1)">Anterior</button>
              <span class="au-muted">Página {{ sitePage }} · {{ sitesTotal }} sitios</span>
              <button class="au-btn" type="button" [disabled]="sitesLoading || sitePage * sitePageSize >= sitesTotal" (click)="goToSitePage(sitePage + 1)">Siguiente</button>
            </div>
          </section>
          <section class="au-panel au-panel--padded" *ngIf="tenantSites.length">
            <div class="sites-heading"><div><h2 class="au-panel__title">Estado de conexión</h2><p class="au-panel__subtitle">Se muestra el estado de cada conexión, no se deduce la verificación a partir de una clave guardada.</p></div></div>
            <div class="sites-table-wrap" tabindex="0" role="region" aria-label="Estado de conexión del sitio"><table class="sites-table"><thead><tr><th scope="col">Sitio</th><th scope="col">Estado</th><th scope="col">Última comprobación</th><th scope="col">Artículos</th><th scope="col">Acción</th></tr></thead><tbody>
              <tr *ngFor="let site of tenantSites"><th scope="row">{{ site.name }}</th><td><span class="au-badge" [class.au-badge--success]="site.websiteConnection?.stage === 'ready'" [class.au-badge--warning]="site.websiteConnection?.stage !== 'ready'">{{ connectionLabel(site) }}</span></td><td>{{ (site.websiteConnection?.lastVerifiedAt | date:'d MMM y, HH:mm') || '—' }}</td><td>{{ site.projectCount }}</td><td><button type="button" class="au-btn" (click)="openConnections(site.id)" [attr.aria-label]="'Ver conexiones de ' + site.name">Ver conexiones</button></td></tr>
            </tbody></table></div>
          </section>
        </div>

        <section class="au-panel au-panel--padded" *ngIf="section === 'sites' && tab === 'defaults'">
          <div class="sites-heading"><div><h2 class="au-panel__title">Identidad y alcance editorial</h2><p class="au-panel__subtitle">El sitio activo determina el contexto del contenido, no los permisos de todo el workspace.</p></div></div>
          <p *ngIf="sitesLoading" role="status">Cargando identidad…</p>
          <p class="au-error" *ngIf="sitesError" role="alert">No se pudo cargar el sitio. <button class="au-btn" type="button" (click)="load()">Reintentar</button></p>
          <p *ngIf="!activeSiteId">Selecciona un sitio para editar su identidad.</p>
          <ng-container *ngIf="siteIdentity as site">
            <dl class="identity-fields" *ngIf="!editingSite">
              <div><dt>Nombre público</dt><dd>{{ site.name }}</dd></div>
              <div><dt>URL del sitio</dt><dd>{{ site.baseUrl || '—' }}</dd></div>
              <div><dt>Idioma principal</dt><dd>{{ site.locale }}</dd></div>
              <div><dt>Tipo de integración</dt><dd>{{ site.type }}</dd></div>
            </dl>
            <ng-container *ngTemplateOutlet="siteEditor"></ng-container>
            <div class="au-form__actions">
              <button class="au-btn au-btn--primary" type="button" *ngIf="canManageSites && !editingSite" (click)="editSite(site)">Editar identidad</button>
              <a class="au-btn" routerLink="/studio/connections">Gestionar destino</a>
              <a class="au-btn" routerLink="/studio/settings/writing" [queryParams]="{ tab: 'brand' }">Editar marca</a>
              <a class="au-btn" routerLink="/studio/site-intelligence">Ver perfil editorial</a>
            </div>
          </ng-container>
        </section>
        <section class="au-panel au-panel--padded" *ngIf="section === 'sites' && tab === 'defaults'">
          <div class="sites-heading"><div><h2 class="au-panel__title">Propiedad de los datos</h2><p class="au-panel__subtitle">Una misma información no debería editarse en varios lugares.</p></div></div>
          <div class="data-ownership"><div class="note"><strong>Settings</strong><p>Nombre, país, marca, tono, política de escritura y conexiones.</p></div><div class="note"><strong>Advanced</strong><p>Rastreo del sitio, datos detectados, pilares, análisis y fuentes.</p></div></div>
        </section>

        <div class="sites-settings" *ngIf="section === 'team' || section === 'roles'">
          <p class="au-muted" *ngIf="accessLoading">Loading access settings…</p>
          <p class="au-error" *ngIf="accessError">{{ accessError }} <button class="au-btn" type="button" (click)="loadAccess()">Retry</button></p>
          <ng-container *ngIf="!accessLoading && !accessError">
            <dl class="sites-metrics people-metrics" *ngIf="section === 'team' && tab === 'members' && canManageUsers">
              <div class="sites-metric"><dt>Miembros</dt><dd>{{ users.length }}</dd></div>
              <div class="sites-metric"><dt>Activos</dt><dd>{{ peopleCounts.active }}</dd></div>
              <div class="sites-metric"><dt>Invitados</dt><dd>{{ peopleCounts.invited }}</dd></div>
              <div class="sites-metric"><dt>Suspendidos</dt><dd>{{ peopleCounts.suspended }}</dd></div>
            </dl>
            <section class="au-panel au-panel--padded" *ngIf="section === 'team' && canManageUsers">
              <div class="sites-heading">
                <div>
                  <h2 class="au-panel__title">{{ tab === 'invites' ? 'Invitaciones (' + peopleCounts.invited + ')' : 'Directorio del equipo' }}</h2>
                  <p class="au-panel__subtitle">{{ tab === 'invites' ? 'Consulta las invitaciones pendientes y sus roles asignados.' : 'Gestiona la identidad, los roles, el estado y la última actividad de cada cuenta.' }}</p>
                </div>
                <button class="au-btn au-btn--primary" type="button" (click)="error = ''; inviteDialog.showModal()"><app-icon name="plus"></app-icon>Invitar persona</button>
              </div>
              <div class="access-filters">
                <label>Buscar usuarios <input class="au-input" type="search" placeholder="Nombre o correo" [(ngModel)]="peopleSearch"></label>
                <label *ngIf="tab === 'members'">Estado
                  <select class="au-select" [(ngModel)]="peopleStatus">
                    <option value="">Todos</option><option value="active">Activos</option><option value="invited">Invitados</option><option value="suspended">Suspendidos</option>
                  </select>
                </label>
              </div>
              <p class="au-muted" *ngIf="filteredUsers.length === 0">{{ tab === 'invites' && !peopleCounts.invited ? 'Sin invitaciones pendientes' : 'Ninguna persona coincide con la búsqueda.' }}</p>
              <ul class="people-list">
                <li class="access-person" *ngFor="let member of filteredUsers; trackBy: trackMember">
                  <span class="access-avatar" aria-hidden="true">{{ memberInitials(member) }}</span>
                  <div class="access-person__identity">
                    <strong>{{ tab === 'invites' ? member.email : member.displayName }}</strong>
                    <span class="au-badge au-badge--brand" *ngIf="member.id === workspaceUserId">Cuenta actual</span>
                    <p *ngIf="tab === 'members'">{{ member.email }}<ng-container *ngIf="member.lastLoginAt"> · {{ member.lastLoginAt | date:'short' }}</ng-container></p>
                    <p *ngIf="tab === 'invites'">{{ memberRoleNames(member) || 'Sin roles asignados' }}</p>
                  </div>
                  <div class="access-person__actions">
                    <span class="au-badge" [ngClass]="member.status === 'active' ? 'au-badge--success' : member.status === 'invited' ? 'au-badge--warning' : 'au-badge--danger'">{{ memberStatusLabels[member.status] }}</span>
                    <button class="au-btn au-btn--sm access-edit" type="button" [disabled]="accessBusy" (click)="openMemberAccess(member, accessDialog)">{{ tab === 'invites' ? 'Editar acceso' : 'Gestionar acceso' }}</button>
                    <button *ngIf="tab === 'invites' && member.status === 'invited'"
                      class="au-btn au-btn--sm au-btn--danger-ghost" type="button"
                      [disabled]="accessBusy || !canManageMember(member)"
                      (click)="revokeInvitation(member)">Revocar invitación</button>
                  </div>
                </li>
              </ul>
              <dialog #accessDialog class="settings-dialog" aria-labelledby="settings-member-title"
                (cancel)="accessBusy ? $event.preventDefault() : undefined">
                <div class="settings-dialog__heading">
                  <h2 id="settings-member-title">Gestionar acceso{{ accessMember ? ' · ' + accessMember.displayName : '' }}</h2>
                  <button class="au-btn au-btn--ghost" type="button" [disabled]="accessBusy" (click)="accessDialog.close()">Cerrar</button>
                </div>
                <form *ngIf="accessMember as member" class="access-form" (ngSubmit)="saveMemberAccess(accessDialog)">
                  <div class="access-fields">
                    <label>Nombre <input class="au-input" name="accessName" [(ngModel)]="memberName" [readonly]="!canManageMember(member)" required></label>
                    <label>Correo electrónico <input class="au-input" type="email" [value]="member.email" readonly></label>
                    <label>Estado
                      <select class="au-select" name="accessStatus" [(ngModel)]="memberStatus"
                        [disabled]="member.status === 'invited' || member.id === workspaceUserId || !canManageMember(member)">
                        <option *ngIf="member.status === 'invited'" value="invited">Invitado</option>
                        <option value="active">Activo</option><option value="suspended">Suspendido</option>
                      </select>
                    </label>
                  </div>
                  <fieldset class="access-role-list">
                    <legend>Asignación de roles</legend>
                    <label *ngFor="let role of roles">
                      <input type="checkbox" [checked]="memberRoleIds.includes(role.id)"
                        [disabled]="accessBusy || !canManageMember(member) || !canDelegate(role)"
                        (change)="toggleMemberRole(role.id, $any($event.target).checked)">
                      {{ role.name }}
                    </label>
                  </fieldset>
                  <details>
                    <summary>{{ memberStatus === 'active' ? 'Permisos efectivos' : 'Permisos de los roles asignados' }}</summary>
                    <p>{{ memberDraftPermissions.join(', ') || 'Sin permisos' }}</p>
                    <p *ngIf="memberStatus !== 'active'">La cuenta no tiene acceso operativo mientras permanezca {{ memberStatus === 'invited' ? 'invitada' : 'suspendida' }}.</p>
                  </details>
                  <p class="au-error" *ngIf="error" role="alert">{{ error }}</p>
                  <div class="au-form__actions">
                    <button class="au-btn" type="button" [disabled]="accessBusy" (click)="accessDialog.close()">Cancelar</button>
                    <button class="au-btn au-btn--primary" type="submit" [disabled]="accessBusy || !memberChanges">{{ accessBusy ? 'Guardando…' : 'Guardar acceso' }}</button>
                  </div>
                </form>
              </dialog>
              <dialog #inviteDialog class="settings-dialog" aria-labelledby="settings-invite-title" (cancel)="inviting ? $event.preventDefault() : undefined">
                <h2 id="settings-invite-title">Invitar persona</h2>
                <form class="access-form" (ngSubmit)="invite(inviteDialog)">
                <label>Nombre (opcional) <input class="au-input" name="inviteName" [(ngModel)]="inviteName"></label>
                <label>Correo electrónico <input class="au-input" type="email" name="inviteEmail" [(ngModel)]="inviteEmail" required></label>
                <fieldset><legend>Roles</legend><label *ngFor="let role of roles"><input type="checkbox" [checked]="inviteRoles.includes(role.key)" [disabled]="!canDelegate(role)" (change)="toggleInviteRole(role.key, $any($event.target).checked)"> {{ role.name }}</label></fieldset>
                <p class="au-error" *ngIf="error" role="alert">{{ error }}</p>
                <div class="au-form__actions">
                  <button class="au-btn" type="button" [disabled]="inviting" (click)="error = ''; inviteDialog.close()">Cancelar</button>
                  <button class="au-btn au-btn--primary" type="submit" [disabled]="inviting || !inviteRoles.length">{{ inviting ? 'Enviando…' : 'Crear invitación' }}</button>
                </div>
              </form>
              </dialog><p class="au-error" *ngIf="error && !inviteDialog.open && !accessDialog.open" role="alert">{{ error }}</p><p class="au-muted" *ngIf="notice" role="status">{{ notice }}</p>
            </section>
            <section class="au-panel au-panel--padded" *ngIf="section === 'roles' && (canManageRoles || canManageUsers)">
              <div class="sites-heading"><div><h2 class="au-panel__title">{{ tab === 'matrix' ? 'Matriz completa de permisos' : tab === 'simulate' ? 'Simular acceso' : 'Roles del workspace' }}</h2><p class="au-panel__subtitle">Review the effective permissions granted by each role.</p></div><button class="au-btn au-btn--primary" *ngIf="canManageRoles && tab !== 'simulate'" type="button" (click)="editRole(); roleDialog.showModal()">Create role</button></div>
              <div class="role-library" *ngIf="tab === 'library'">
                <article class="role-card" *ngFor="let role of roles">
                  <div><h3>{{ role.name }}</h3><span class="au-badge">{{ role.isSystem ? 'Sistema' : 'Personalizado' }}</span></div>
                  <p *ngIf="role.description">{{ role.description }}</p>
                  <p>{{ role.memberCount }} miembros · {{ role.permissions.length }} permisos</p>
                  <div *ngIf="canManageRoles" class="au-form__actions">
                    <button class="au-btn" type="button" [disabled]="!canDelegate(role)" (click)="editRole(role, true); roleDialog.showModal()">Clone</button>
                    <button class="au-btn" type="button" *ngIf="!role.isSystem" [disabled]="!canDelegate(role)" (click)="editRole(role); roleDialog.showModal()">Edit</button>
                  </div>
                </article>
              </div>
              <div class="sites-table-wrap" *ngIf="tab === 'matrix'" tabindex="0" role="region" aria-label="Workspace permission matrix"><table class="sites-table access-matrix"><thead><tr><th scope="col">Capacidad</th><th scope="col" *ngFor="let role of roles">{{ role.name }}<br><small>{{ role.isSystem ? 'System · ' : '' }}{{ role.memberCount }} members</small></th></tr></thead><tbody>
                <tr *ngFor="let permission of allPermissions"><th scope="row"><strong>{{ permissionLabels[permission][0] }}</strong><small>{{ permission }}</small><small>{{ permissionLabels[permission][1] }}</small></th><td *ngFor="let role of roles"><span [class.access-granted]="role.permissions.includes(permission)" [attr.aria-label]="role.permissions.includes(permission) ? 'Granted' : 'Not granted'">{{ role.permissions.includes(permission) ? '✓' : '—' }}</span></td></tr>
                <tr *ngIf="canManageRoles"><th scope="row">Actions</th><td *ngFor="let role of roles"><button class="au-btn" type="button" (click)="editRole(role, true); roleDialog.showModal()" [disabled]="!canDelegate(role)">Clone</button> <button class="au-btn" type="button" *ngIf="!role.isSystem" (click)="editRole(role); roleDialog.showModal()" [disabled]="!canDelegate(role)">Edit</button></td></tr>
              </tbody></table></div>
              <dialog #roleDialog class="settings-dialog" aria-labelledby="settings-role-title" (cancel)="accessBusy ? $event.preventDefault() : undefined">
                <h2 id="settings-role-title">{{ roleId ? 'Editar rol' : 'Crear rol' }}</h2>
                <form class="access-form" (ngSubmit)="saveRole(roleDialog)">
                <label>Name <input class="au-input" name="roleName" [(ngModel)]="roleName" required></label><label>Description <input class="au-input" name="roleDescription" [(ngModel)]="roleDescription"></label>
                <fieldset><legend>Permissions</legend><label *ngFor="let permission of allPermissions"><input type="checkbox" [checked]="rolePermissions.includes(permission)" [disabled]="!accessPermissions.includes(permission)" (change)="toggleRolePermission(permission, $any($event.target).checked)"> {{ permission }}</label></fieldset>
                <p class="au-error" *ngIf="error" role="alert">{{ error }}</p>
                <div class="au-form__actions"><button class="au-btn" type="button" [disabled]="accessBusy" (click)="roleDialog.close()">Cancel</button><button class="au-btn au-btn--primary" type="submit" [disabled]="accessBusy">Save role</button></div>
              </form></dialog>
              <a *ngIf="tab === 'matrix' && canManageUsers" class="au-btn" routerLink="." [queryParams]="{ tab: 'simulate' }">Comparar el acceso de usuarios</a>
              <p *ngIf="tab === 'simulate' && !canManageUsers">El permiso users.manage permite consultar el acceso efectivo de las personas del workspace.</p>
              <details *ngIf="tab === 'simulate' && canManageUsers && users.length" open class="access-comparison">
                <summary>Compare member access</summary>
                <div class="access-filters">
                  <label>First member <select class="au-select" [(ngModel)]="compareFirst"><option value="">Choose a member</option><option *ngFor="let member of users" [value]="member.id">{{ member.displayName }} ({{ member.status }})</option></select></label>
                  <label>Second member <select class="au-select" [(ngModel)]="compareSecond"><option value="">Choose a member</option><option *ngFor="let member of users" [value]="member.id">{{ member.displayName }} ({{ member.status }})</option></select></label>
                </div>
                <div *ngIf="compareFirst && compareSecond">
                  <p>Shared: {{ comparison.shared.join(', ') || 'None' }}</p>
                  <p>First member only: {{ comparison.first.join(', ') || 'None' }}</p>
                  <p>Second member only: {{ comparison.second.join(', ') || 'None' }}</p>
                </div>
              </details>
            </section>
            <p class="au-panel au-panel--padded" *ngIf="section === 'team' ? !canManageUsers : !canManageRoles && !canManageUsers">You do not have permission to view this section.</p>
          </ng-container>
        </div>

        <section class="au-panel au-panel--padded" *ngIf="section === 'discovery'">
          <h2 class="au-panel__title">{{ tab === 'quality' ? 'Calidad y límites' : 'Política de descubrimiento' }}</h2>
          <p class="au-panel__subtitle au-mb-3">
            AI understands the editorial niche, searches the live web and feeds useful stories into the Inbox.
          </p>

          <div class="au-banner" *ngIf="discovery && !discovery.provider.configured">
            <app-icon name="warning"></app-icon>
            <span class="au-banner__text">Web search needs a provider key server-side ({{ discovery.provider.provider }}). Discovery stays paused until it is configured.</span>
          </div>

          <app-empty-state *ngIf="!discovery" icon="sources" title="Discovery settings unavailable" text="Could not load discovery configuration."></app-empty-state>

          <form *ngIf="discovery" (ngSubmit)="saveDiscovery()">
            <label class="au-field au-switch-row" *ngIf="tab === 'policy'">
              <span class="au-field__label">AI source discovery</span>
              <input type="checkbox" [(ngModel)]="discoveryForm.enabled" name="discoveryEnabled" />
            </label>

            <div class="au-field-grid">
              <label class="au-field" *ngIf="tab === 'policy'">
                <span class="au-field__label">Mode</span>
                <select class="au-select" [(ngModel)]="discoveryForm.mode" name="discoveryMode">
                  <option value="manual">Manual</option>
                  <option value="recommend">Recommend</option>
                  <option value="automatic">Automatic</option>
                </select>
                <span class="au-field__hint">Automatic registers high-confidence sources without approval.</span>
              </label>
              <label class="au-field" *ngIf="tab === 'policy'">
                <span class="au-field__label">Frequency (minutes)</span>
                <input class="au-input" type="number" min="5" [(ngModel)]="discoveryForm.frequencyMinutes" name="discoveryFrequency" />
              </label>
              <label class="au-field" *ngIf="tab === 'quality'">
                <span class="au-field__label">Maximum searches/day</span>
                <input class="au-input" type="number" min="1" [(ngModel)]="discoveryForm.maxSearchesPerDay" name="maxSearches" />
              </label>
              <label class="au-field" *ngIf="tab === 'quality'">
                <span class="au-field__label">Maximum pages scraped/day</span>
                <input class="au-input" type="number" min="1" [(ngModel)]="discoveryForm.maxScrapesPerDay" name="maxScrapes" />
              </label>
              <label class="au-field" *ngIf="tab === 'quality'">
                <span class="au-field__label">Maximum daily cost (USD)</span>
                <input class="au-input" type="number" min="0" step="0.5" [(ngModel)]="discoveryForm.maxDiscoveryCostPerDay" name="maxCost" />
              </label>
            </div>

            <div class="au-field-grid">
              <label class="au-field" *ngIf="tab === 'policy'">
                <span class="au-field__label">Languages</span>
                <input class="au-input" type="text" [(ngModel)]="discoveryForm.languagesText" name="languages" placeholder="es, en" />
              </label>
              <label class="au-field" *ngIf="tab === 'policy'">
                <span class="au-field__label">Regions</span>
                <input class="au-input" type="text" [(ngModel)]="discoveryForm.regionsText" name="regions" placeholder="Spain, Europe, Global" />
              </label>
            </div>

            <h3 class="au-panel__title au-mt-2 au-mb-2" *ngIf="tab === 'quality'">Quality</h3>
            <div class="au-field-grid" *ngIf="tab === 'quality'">
              <label class="au-field au-switch-row">
                <span class="au-field__label">Prefer primary sources</span>
                <input type="checkbox" [(ngModel)]="discoveryForm.preferPrimarySources" name="preferPrimary" />
              </label>
              <label class="au-field au-switch-row">
                <span class="au-field__label">Require 2 sources when possible</span>
                <input type="checkbox" [(ngModel)]="discoveryForm.requireTwoSources" name="requireTwo" />
              </label>
              <label class="au-field au-switch-row">
                <span class="au-field__label">Avoid low-authority domains</span>
                <input type="checkbox" [(ngModel)]="discoveryForm.avoidLowAuthority" name="avoidLow" />
              </label>
              <label class="au-field au-switch-row">
                <span class="au-field__label">Detect developing stories</span>
                <input type="checkbox" [(ngModel)]="discoveryForm.detectDevelopingStories" name="developing" />
              </label>
              <label class="au-field au-switch-row">
                <span class="au-field__label">Auto-enable accepted sources</span>
                <input type="checkbox" [(ngModel)]="discoveryForm.autoEnableSources" name="autoEnable" />
              </label>
            </div>

            <p class="au-muted" *ngIf="discovery">
              Today: {{ discovery.usageToday.searches }} searches · {{ discovery.usageToday.scrapes }} pages · {{ discoveryCostLabel() }}
            </p>

            <div class="au-form__actions">
              <button class="au-btn au-btn--primary" type="submit" [disabled]="savingDiscovery">{{ savingDiscovery ? 'Saving…' : 'Save discovery settings' }}</button>
              <button class="au-btn au-btn--secondary" type="button" (click)="runDiscovery()" [disabled]="runningDiscovery || !discovery?.provider?.configured" [attr.title]="discovery?.provider?.configured ? '' : 'Web search needs a provider key server-side. Configure firecrawl or tavily to enable discovery runs.'">
                {{ runningDiscovery ? 'Running…' : 'Run discovery now' }}
              </button>
              <!-- Findings are reviewed in one place, next to each site's own recommendations. -->
              <a class="au-btn au-btn--ghost" routerLink="/studio/sources" [queryParams]="{ tab: 'recommendations' }">Review findings in Sources → Suggested for you</a>
            </div>
          </form>
        </section>
    </section>
  `,
})
export class SettingsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessions = toObservable(this.appContext.session);
  private reads?: Subscription;

  readonly titles: Record<SettingsSection, string> = { sites: 'Sitios y negocio', team: 'Personas y equipo', roles: 'Roles y permisos', discovery: 'Descubrimiento web' };
  readonly descriptions: Record<SettingsSection, string> = { sites: 'Controla tus sitios, su identidad editorial y los destinos asociados.', team: 'Invitaciones, membresías, estados y control de acceso del workspace.', roles: 'Matriz de permisos efectivos y roles personalizados.', discovery: 'Configura cómo Auctorio encuentra y evalúa fuentes.' };
  section: SettingsSection = 'sites';
  tenantSites: StudioSiteSummary[] = [];
  sitesTotal = 0;
  sitePage = 1;
  readonly sitePageSize = 50;
  sitesLoading = true;
  sitesError = false;
  siteIdentity: Pick<StudioSiteSummary, 'id' | 'name' | 'locale' | 'baseUrl' | 'type'> | null = null;
  editingSite: SettingsPageComponent['siteIdentity'] = null;
  siteName = '';
  siteLocale = '';
  siteEditError = '';
  siteSaving = false;

  get canManageSites(): boolean { return this.appContext.permissions().includes('integrations.manage'); }
  get verifiedSiteCount(): number {
    return this.tenantSites.filter((site) => site.websiteConnection?.stage === 'ready').length;
  }

  get sitesArticleCount(): number {
    return this.tenantSites.reduce((total, site) => total + site.projectCount, 0);
  }
  users: StudioUserSummary[] = [];
  peopleCounts = { active: 0, invited: 0, suspended: 0 };
  roles: StudioRoleSummary[] = [];
  inviteEmail = '';
  inviteName = '';
  inviteRoles: string[] = [];
  readonly permissionLabels = {
    'workspace.manage': ['Workspace', 'Configurar el workspace y sus políticas'],
    'users.manage': ['Usuarios', 'Invitar, suspender y asignar roles'],
    'roles.manage': ['Roles', 'Crear y editar roles personalizados'],
    'prompts.manage': ['Prompts y QA', 'Gestionar herramientas y configuración editorial'],
    'projects.manage': ['Artículos', 'Gestionar briefs, artículos y producción'],
    'review.approve': ['Aprobaciones', 'Autorizar revisiones editoriales'],
    'publishing.manage': ['Publicación', 'Programar, publicar, cancelar y despublicar'],
    'integrations.manage': ['Integraciones', 'Gestionar destinos, sitios y fuentes'],
    'analytics.read': ['Analítica', 'Consultar resultados e indicadores'],
  };
  readonly allPermissions = ['workspace.manage', 'users.manage', 'roles.manage', 'prompts.manage', 'projects.manage', 'review.approve', 'publishing.manage', 'integrations.manage', 'analytics.read'] as const;
  accessPermissions: string[] = [];
  accessLoading = true;
  accessError = '';
  accessBusy = false;
  peopleSearch = '';
  peopleStatus = '';
  accessMember: StudioUserSummary | null = null;
  memberName = '';
  memberStatus: StudioUserSummary['status'] = 'invited';
  memberRoleIds: string[] = [];
  readonly memberStatusLabels = { active: 'Activo', invited: 'Invitado', suspended: 'Suspendido' };
  compareFirst = '';
  compareSecond = '';
  roleId = '';
  roleName = '';
  roleDescription = '';
  rolePermissions: string[] = [];
  get canManageUsers(): boolean { return this.accessPermissions.includes('users.manage'); }
  get canManageRoles(): boolean { return this.accessPermissions.includes('roles.manage'); }
  get workspaceUserId(): string | null { return this.appContext.session()?.workspaceUserId ?? null; }
  get filteredUsers(): StudioUserSummary[] {
    const query = this.peopleSearch.trim().toLowerCase();
    return this.users.filter((user) => (this.tab === 'invites' ? user.status === 'invited' : !this.peopleStatus || user.status === this.peopleStatus) && `${user.displayName} ${user.email}`.toLowerCase().includes(query));
  }
  get comparison(): { shared: string[]; first: string[]; second: string[] } {
    const activePermissions = (memberId: string) => {
      const member = this.users.find((user) => user.id === memberId);
      return member?.status === 'active' ? this.effectivePermissions(member) : [];
    };
    const first = activePermissions(this.compareFirst);
    const second = activePermissions(this.compareSecond);
    return {
      shared: first.filter((permission) => second.includes(permission)),
      first: first.filter((permission) => !second.includes(permission)),
      second: second.filter((permission) => !first.includes(permission)),
    };
  }
  inviting = false;
  error = '';
  notice = '';
  discovery: DiscoverySettingsResponse | null = null;
  discoveryForm = {
    enabled: true,
    mode: 'recommend' as 'manual' | 'recommend' | 'automatic',
    frequencyMinutes: 30,
    languagesText: 'es, en',
    regionsText: '',
    maxSearchesPerDay: 100,
    maxScrapesPerDay: 250,
    maxDiscoveryCostPerDay: 5,
    preferPrimarySources: true,
    requireTwoSources: true,
    avoidLowAuthority: true,
    detectDevelopingStories: true,
    autoEnableSources: false,
  };
  savingDiscovery = false;
  runningDiscovery = false;

  get tab(): string {
    return sectionFor('/studio/settings/' + this.section, this.route.snapshot?.queryParamMap.get('tab'));
  }

  get activeSiteId(): string | null {
    return this.appContext.session()?.activeSiteId ?? null;
  }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap, this.sessions]).pipe(
      distinctUntilChanged(([oldParams, oldQuery, oldSession], [params, query, session]) =>
        oldParams.get('section') === params.get('section') && oldSession?.activeSiteId === session?.activeSiteId
        && (params.get('section') !== 'sites' || (oldQuery.get('tab') === 'defaults') === (query.get('tab') === 'defaults'))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(([params]) => {
      const sectionParam = String(params.get('section') || 'sites');
      this.section = (['sites', 'team', 'roles', 'discovery'].includes(sectionParam) ? sectionParam : 'sites') as SettingsSection;
      this.error = '';
      this.notice = '';
      this.editingSite = null;

      this.sitePage = 1;
      this.compareFirst = '';
      this.compareSecond = '';
      this.load();
    });
  }

  load(): void {
    this.reads?.unsubscribe();
    if (this.section === 'team' || this.section === 'roles') {
      this.loadAccess();
      return;
    }
    if (this.section === 'sites') {
      this.sitesLoading = true;
      this.sitesError = false;
      if (this.tab === 'defaults') {
        this.siteIdentity = null;
        if (!this.activeSiteId) { this.sitesLoading = false; return; }
        this.reads = this.api.getSite(this.activeSiteId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (site) => { this.siteIdentity = site; this.sitesLoading = false; },
          error: () => { this.sitesError = true; this.sitesLoading = false; },
        });
        return;
      }
      this.reads = this.api.listTenantSites(this.sitePage, this.sitePageSize).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (this.sitePage > 1 && response.items.length === 0 && response.total <= (this.sitePage - 1) * this.sitePageSize) {
          this.goToSitePage(this.sitePage - 1);
          return;
        }
        this.tenantSites = response.items;
        this.sitesTotal = response.total;
        this.sitesLoading = false;
      },
      error: () => {
        this.tenantSites = [];
        this.sitesTotal = 0;
        this.sitesLoading = false;
        this.sitesError = true;
      },
      });
      return;
    }
    this.reads = this.api.getDiscoverySettings().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.discovery = response;
        const config = response.config;
        this.discoveryForm = {
          enabled: config.enabled,
          mode: config.mode,
          frequencyMinutes: config.frequencyMinutes,
          languagesText: (config.languages ?? ['es', 'en']).join(', '),
          regionsText: (config.regions ?? []).join(', '),
          maxSearchesPerDay: config.maxSearchesPerDay,
          maxScrapesPerDay: config.maxScrapesPerDay,
          maxDiscoveryCostPerDay: config.maxDiscoveryCostPerDay,
          preferPrimarySources: config.preferPrimarySources,
          requireTwoSources: config.requireTwoSources,
          avoidLowAuthority: config.avoidLowAuthority,
          detectDevelopingStories: config.detectDevelopingStories,
          autoEnableSources: config.autoEnableSources,
        };
      },
      error: () => {
        this.discovery = null;
      },
    });
  }

  saveDiscovery(): void {
    this.savingDiscovery = true;
    this.error = '';
    this.api
      .updateDiscoverySettings({
        enabled: this.discoveryForm.enabled,
        mode: this.discoveryForm.mode,
        frequencyMinutes: Number(this.discoveryForm.frequencyMinutes),
        languages: this.discoveryForm.languagesText.split(',').map((item) => item.trim()).filter(Boolean),
        regions: this.discoveryForm.regionsText.split(',').map((item) => item.trim()).filter(Boolean),
        maxSearchesPerDay: Number(this.discoveryForm.maxSearchesPerDay),
        maxScrapesPerDay: Number(this.discoveryForm.maxScrapesPerDay),
        maxDiscoveryCostPerDay: Number(this.discoveryForm.maxDiscoveryCostPerDay),
        preferPrimarySources: this.discoveryForm.preferPrimarySources,
        requireTwoSources: this.discoveryForm.requireTwoSources,
        avoidLowAuthority: this.discoveryForm.avoidLowAuthority,
        detectDevelopingStories: this.discoveryForm.detectDevelopingStories,
        autoEnableSources: this.discoveryForm.autoEnableSources,
      })
      .subscribe({
        next: () => {
          this.savingDiscovery = false;
          this.toast.success('Discovery settings saved.');
        },
        error: (err) => {
          this.savingDiscovery = false;
          const body = (err as { error?: { message?: string } })?.error;
          this.error = body?.message ? String(body.message) : 'Could not save discovery settings.';
        },
      });
  }

  runDiscovery(): void {
    this.runningDiscovery = true;
    this.api.runDiscoveryNow().subscribe({
      next: () => {
        this.runningDiscovery = false;
        this.toast.success('AI discovery started — results appear in the Inbox and Sources.');
      },
      error: (err) => {
        this.runningDiscovery = false;
        const body = (err as { error?: { code?: string; message?: string } })?.error;
        this.toast.error(body?.message ? String(body.message) : 'Discovery could not be started.');
      },
    });
  }

  /** Switches the active site; the shell reads the same app context, so its menu updates too. */
  async useSite(siteId: string): Promise<boolean> {
    try {
      await this.appContext.switchSite(siteId);
      return true;
    } catch {
      this.toast.error('Could not activate this site.');
      return false;
    }
  }

  goToSitePage(page: number): void {
    this.sitePage = page;
    this.load();
  }

  async openConnections(siteId: string): Promise<void> {
    if (siteId === this.activeSiteId || await this.useSite(siteId)) {
      await this.router.navigate(['/studio/connections']);
    }
  }

  connectionLabel(site: StudioSiteSummary): string {
    return ({
      ready: 'Verificado', stale: 'Verificación caducada', error: 'Comprobación fallida', stored: 'Sin verificar',
      authenticated: 'Autenticado', read_only: 'Solo lectura', not_verified: 'Sin verificar', unconfigured: 'Sin configurar',
    } as const)[site.websiteConnection?.stage ?? 'unconfigured'];
  }

  editSite(site: NonNullable<SettingsPageComponent['siteIdentity']>): void {
    this.editingSite = site;
    this.siteName = site.name;
    this.siteLocale = site.locale;
    this.siteEditError = '';
  }

  async cancelSiteEdit(dirty: boolean): Promise<void> {
    if (!dirty || await this.confirm.confirm({ title: 'Discard site changes?', message: 'The unsaved changes will be lost.', confirmLabel: 'Discard' })) {
      this.editingSite = null;
    }
  }

  saveSite(): void {
    const site = this.editingSite;
    if (!site || !this.siteName.trim() || !this.siteLocale.trim()) return;
    this.siteSaving = true;
    this.siteEditError = '';
    this.api.updateSite(site.id, {
      name: this.siteName.trim(), type: site.type, locale: this.siteLocale.trim(),
    }).subscribe({
      next: () => {
        this.siteSaving = false;
        this.editingSite = null;
        this.toast.success('Site updated.');
        this.load();
      },
      error: (err) => { this.siteSaving = false; this.siteEditError = err?.error?.message || 'Could not update this site.'; },
    });
  }

  async deleteSite(site: StudioSiteSummary): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `Delete ${site.name}?`,
      message: `Its articles, editorial plans, settings and indexed pages are deleted from Auctorio. Nothing is removed from ${site.baseUrl || 'the destination website'}. This cannot be undone.`,
      confirmLabel: 'Delete site',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteSite(site.id).subscribe({
      next: async (result) => {
        this.toast.success(`${site.name} deleted (${result.projects} articles, ${result.plans} plans).`);
        try {
          await this.appContext.ensureSession(true);
        } catch {
          this.toast.error('The site was deleted. Refresh the page to update your site list.');
        }
        this.load();
      },
      error: (err) => this.toast.error(err?.error?.message ? String(err.error.message) : 'The site could not be deleted.'),
    });
  }

  discoveryCostLabel(): string {
    const cost = this.discovery?.usageToday?.estimatedCostUsd ?? 0;
    return `$${Number(cost).toFixed(3)}`;
  }

  loadAccess(): void {
    this.reads?.unsubscribe();
    this.accessLoading = true;
    this.accessError = '';
    this.accessPermissions = this.appContext.permissions();
    this.users = [];
    this.roles = [];
    if (!this.canManageRoles && !this.canManageUsers) {
      this.accessLoading = false;
      return;
    }
    this.reads = forkJoin({
      roles: this.api.listRoles(),
      users: this.canManageUsers ? this.api.listUsers() : of([]),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({roles, users}) => {
        this.roles = roles;
        this.setDirectory(users);
        this.accessLoading = false;
      },
      error: () => { this.accessLoading = false; this.accessError = 'Could not load workspace access.'; },
    });
  }

  canDelegate(role: StudioRoleSummary): boolean {
    const isOwner = this.users.find((user) => user.id === this.workspaceUserId)?.roles.some((item) => item.key === 'owner');
    return (role.key !== 'owner' || !!isOwner) && role.permissions.every((permission) => this.accessPermissions.includes(permission));
  }
  canManageMember(member: StudioUserSummary): boolean {
    return this.roles.filter((role) => this.memberHasRole(member, role)).every((role) => this.canDelegate(role));
  }
  effectivePermissions(member: StudioUserSummary): string[] {
    return Array.from(new Set(this.roles.filter((role) => this.memberHasRole(member, role)).flatMap((role) => role.permissions))).sort();
  }
  private setDirectory(users: StudioUserSummary[]): void {
    this.users = users;
    this.peopleCounts = { active: 0, invited: 0, suspended: 0 };
    for (const user of users) this.peopleCounts[user.status]++;
  }

  trackMember(_: number, member: StudioUserSummary): string { return member.id; }

  memberInitials(member: StudioUserSummary): string {
    return (member.displayName.trim() || member.email).split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  }

  memberRoleNames(member: StudioUserSummary): string { return member.roles.map((role) => role.name).join(', '); }

  openMemberAccess(member: StudioUserSummary, dialog: HTMLDialogElement): void {
    this.accessMember = member;
    this.memberName = member.displayName;
    this.memberStatus = member.status;
    this.memberRoleIds = member.roles.map((role) => role.id);
    this.error = '';
    dialog.showModal();
  }

  get memberDraftPermissions(): string[] {
    return [...new Set(this.roles.filter((role) => this.memberRoleIds.includes(role.id)).flatMap((role) => role.permissions))].sort();
  }

  get memberChanges(): Parameters<StudioApiService['updateUser']>[1] | null {
    const member = this.accessMember;
    const displayName = this.memberName.trim();
    if (!member || !displayName || !this.canManageMember(member)) return null;
    const changes: Parameters<StudioApiService['updateUser']>[1] = {};
    if (displayName !== member.displayName) changes.displayName = displayName;
    if (member.id !== this.workspaceUserId && member.status !== 'invited' && this.memberStatus !== member.status) {
      changes.status = this.memberStatus;
    }
    if (this.memberRoleIds.length !== member.roles.length || member.roles.some((role) => !this.memberRoleIds.includes(role.id))) {
      changes.roleIds = this.memberRoleIds;
    }
    return Object.keys(changes).length ? changes : null;
  }

  async saveMemberAccess(dialog: HTMLDialogElement): Promise<void> {
    const member = this.accessMember;
    const changes = this.memberChanges;
    if (!member || !changes || this.accessBusy) return;
    this.accessBusy = true;
    this.error = '';
    if (changes.status) {
      const suspend = changes.status === 'suspended';
      const action = suspend ? 'Suspender' : 'Reactivar';
      dialog.close();
      const confirmed = await this.confirm.confirm({
        title: action + ' a ' + member.displayName + '?',
        message: suspend ? 'Se bloqueará el acceso al workspace y se revocarán las sesiones activas.' : 'La persona podrá volver a iniciar sesión en el workspace.',
        confirmLabel: action,
        danger: suspend,
      });
      if (!confirmed || !dialog.isConnected) {
        this.accessBusy = false;
        if (dialog.isConnected && !dialog.open) dialog.showModal();
        return;
      }
    }
    this.api.updateUser(member.id, changes).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.accessBusy = false;
        if (dialog.open) dialog.close();
        this.setDirectory(this.users.map((user) => user.id === updated.id ? updated : user));
        this.notice = 'Acceso actualizado.';
      },
      error: (err) => {
        this.accessBusy = false;
        this.error = err?.error?.message || 'No se pudo actualizar el acceso.';
        if (dialog.isConnected && !dialog.open) dialog.showModal();
      },
    });
  }

  async revokeInvitation(member: StudioUserSummary): Promise<void> {
    if (this.accessBusy || member.status !== 'invited' || !this.canManageMember(member)) return;
    const confirmed = await this.confirm.confirm({
      title: '¿Revocar la invitación a ' + member.email + '?',
      message: 'La invitación pendiente a este workspace quedará anulada.',
      confirmLabel: 'Revocar invitación',
      danger: true,
    });
    if (!confirmed || this.accessBusy || this.section !== 'team') return;
    this.accessBusy = true;
    this.error = '';
    this.notice = '';
    this.api.revokeUserInvitation(member.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.accessBusy = false;
        this.notice = 'Invitación revocada.';
        this.loadAccess();
      },
      error: (error) => {
        this.accessBusy = false;
        this.error = error?.error?.message || 'No se pudo revocar la invitación.';
      },
    });
  }

  toggleMemberRole(id: string, checked: boolean): void {
    this.memberRoleIds = checked ? [...new Set([...this.memberRoleIds, id])] : this.memberRoleIds.filter((roleId) => roleId !== id);
  }

  memberHasRole(member: StudioUserSummary, role: StudioRoleSummary): boolean { return member.roles.some((item) => item.id === role.id); }
  toggleInviteRole(key: string, checked: boolean): void { this.inviteRoles = checked ? [...this.inviteRoles, key] : this.inviteRoles.filter((item) => item !== key); }
  toggleRolePermission(permission: string, checked: boolean): void { this.rolePermissions = checked ? [...this.rolePermissions, permission] : this.rolePermissions.filter((item) => item !== permission); }

  editRole(role?: StudioRoleSummary, clone = false): void {
    this.roleId = clone ? '' : role?.id || '';
    this.roleName = role ? (clone ? `${role.name} copy` : role.name) : '';
    this.roleDescription = role?.description || '';
    this.rolePermissions = [...(role?.permissions || [])];
    this.error = '';
  }
  saveRole(dialog?: HTMLDialogElement): void {
    const name = this.roleName.trim();
    if (!name) return;
    this.accessBusy = true; this.error = '';
    const payload = { name, description: this.roleDescription.trim(), permissions: this.rolePermissions };
    (this.roleId ? this.api.updateRole(this.roleId, payload) : this.api.createRole(payload)).subscribe({
      next: () => { this.accessBusy = false; dialog?.close(); this.loadAccess(); },
      error: (err) => { this.accessBusy = false; this.error = err?.error?.message || 'Could not save role.'; },
    });
  }

  invite(dialog?: HTMLDialogElement): void {
    if (!this.inviteEmail.trim()) {
      this.error = 'Enter an email to invite.';
      return;
    }
    this.inviting = true;
    this.error = '';
    this.api
      .inviteUser({
        email: this.inviteEmail.trim(),
        displayName: this.inviteName.trim() || undefined,
        roleKeys: this.inviteRoles,
      })
      .subscribe({
        next: (invitation) => {
          this.inviting = false;
          this.inviteEmail = '';
          this.inviteName = '';
          this.inviteRoles = [];
          this.notice = invitation.delivery === 'sent' ? 'Invitation sent.'
            : invitation.delivery === 'failed' ? 'Invitation saved. Email delivery failed.'
            : 'Invitation saved. Email delivery is unavailable.';
          dialog?.close();
          this.toast.success('Invitation saved.');
          this.load();
        },
        error: (err) => {
          this.inviting = false;
          const body = (err as { error?: { message?: string } })?.error;
          this.error = body?.message ? String(body.message) : 'Could not send the invitation.';
        },
      });
  }
}
