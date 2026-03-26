import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StudioEmptyStateComponent } from '../components/studio-empty-state.component';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioSidePanelComponent } from '../components/studio-side-panel.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import type { StudioRoleSummary, StudioUserSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type UserFocus = 'all' | 'active' | 'invited' | 'suspended';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    StudioEmptyStateComponent,
    StudioPageHeaderComponent,
    StudioSidePanelComponent,
    StudioStatStripComponent,
  ],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Settings"
        title="Users"
        intro="Invitaciones, estados de acceso, ownership operativo y cobertura real de roles dentro del workspace editorial."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--accent">{{ users.length }} seats</span>
          <span class="console-tag console-tag--success">{{ activeUsersCount }} active</span>
          <span class="console-tag console-tag--muted">{{ invitedUsersCount }} invited</span>
        </div>

        <a page-actions class="console-button console-button--secondary" routerLink="/studio/settings/workspace">
          Open workspace
        </a>
        <a page-actions class="console-button console-button--secondary" routerLink="/studio/settings/roles">
          Open roles
        </a>
        <button page-actions type="button" class="console-button" (click)="loadData()">Refresh users</button>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="stats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Access posture</p>
            <h2 class="console-surface__title">Tenant access governance across invitation, activation and ownership</h2>
            <p class="console-hero-copy__body">{{ accessNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Pending invitations</span>
                <strong>{{ invitedUsersCount }}</strong>
                <small>Workspace seats already provisioned but still waiting for the first valid login.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Governance seats</span>
                <strong>{{ governanceSeatCount }}</strong>
                <small>Users currently holding workspace or identity management permissions.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Role coverage</span>
                <strong>{{ roleCoverageLabel }}</strong>
                <small>{{ staleAccessCount }} seat{{ staleAccessCount === 1 ? '' : 's' }} with stale or missing activity signals.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Workspace access watchlist</h2>
              </div>
            </div>

            <div class="console-focus-list">
              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="invitedUsersCount === 0"
                (click)="applyStatusFocus('invited')"
              >
                <div>
                  <strong>{{ invitedUsersCount === 0 ? 'Invitation backlog clear' : 'Pending invitations' }}</strong>
                  <p>
                    {{
                      invitedUsersCount === 0
                        ? 'Every invited seat has already crossed the first-login handoff.'
                        : invitedUsersCount + ' seat' + (invitedUsersCount === 1 ? '' : 's') + ' still wait for activation.'
                    }}
                  </p>
                </div>
                <span class="console-tag" [ngClass]="invitedUsersCount === 0 ? 'console-tag--success' : 'console-tag--warning'">
                  {{ invitedUsersCount === 0 ? 'Healthy' : 'Needs follow-up' }}
                </span>
              </button>

              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="suspendedUsersCount === 0"
                (click)="applyStatusFocus('suspended')"
              >
                <div>
                  <strong>{{ suspendedUsersCount === 0 ? 'No suspended seats' : 'Suspended access' }}</strong>
                  <p>
                    {{
                      suspendedUsersCount === 0
                        ? 'No seat is currently parked outside the active governance perimeter.'
                        : suspendedUsersCount + ' suspended seat' + (suspendedUsersCount === 1 ? '' : 's') + ' keep history but no cockpit access.'
                    }}
                  </p>
                </div>
                <span class="console-tag" [ngClass]="suspendedUsersCount === 0 ? 'console-tag--success' : 'console-tag--danger'">
                  {{ suspendedUsersCount === 0 ? 'Healthy' : 'Review' }}
                </span>
              </button>

              <a class="console-focus-card" routerLink="/studio/settings/roles">
                <div>
                  <strong>Role governance</strong>
                  <p>{{ roles.length }} roles shape the effective access perimeter across editorial and publishing operations.</p>
                </div>
                <span class="console-tag console-tag--accent">Open roles</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Directory</p>
                <h2 class="console-surface__title">Workspace members</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ filteredUsers.length }} visible users</span>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="User, email or role"
                  (input)="applyFilters()"
                />
              </label>

              <label class="console-select">
                <span>Focus</span>
                <select formControlName="status" (change)="applyFilters()">
                  <option value="all">All seats</option>
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
            </form>

            <div class="console-table" *ngIf="filteredUsers.length; else emptyUsers">
              <div class="console-table__head console-table__head--users">
                <span>User</span>
                <span>Status</span>
                <span>Roles</span>
                <span>Activity</span>
              </div>

              <article class="console-table__row console-table__row--users" *ngFor="let user of filteredUsers">
                <div>
                  <strong>{{ user.displayName }}</strong>
                  <span>{{ user.email }}</span>
                  <small>{{ userProviderLabel(user) }} · joined {{ formatDate(user.createdAt) }}</small>
                </div>

                <div class="console-inline-actions console-inline-actions--stack">
                  <span class="console-tag" [ngClass]="userStatusTagClass(user.status)">{{ user.status }}</span>
                  <small>{{ userStatusNarrative(user) }}</small>
                </div>

                <div class="console-chip-row console-chip-row--tight" *ngIf="user.roles.length; else noRoles">
                  <button
                    type="button"
                    class="console-chip"
                    *ngFor="let role of user.roles"
                    (click)="removeRole(user, role.id)"
                  >
                    {{ role.name }} ×
                  </button>
                </div>

                <div class="console-inline-actions console-inline-actions--stack">
                  <span>{{ userActivityLabel(user) }}</span>
                  <div class="console-inline-actions">
                    <select #roleSelect class="console-input console-input--compact">
                      <option value="">Assign role</option>
                      <option *ngFor="let role of availableRoles(user)" [value]="role.id">
                        {{ role.name }}
                      </option>
                    </select>
                    <button
                      type="button"
                      class="console-button console-button--secondary console-button--small"
                      (click)="assignRole(user, roleSelect.value)"
                      [disabled]="!roleSelect.value"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      class="console-button console-button--secondary console-button--small"
                      (click)="toggleStatus(user)"
                    >
                      {{ user.status === 'suspended' ? 'Reactivate' : user.status === 'invited' ? 'Activate' : 'Suspend' }}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <app-studio-side-panel eyebrow="Invite" title="Add a workspace member">
            <form class="console-form" [formGroup]="inviteForm" (ngSubmit)="inviteUser()">
              <label class="console-field">
                <span>Email</span>
                <input type="email" formControlName="email" placeholder="editor@company.com" />
              </label>

              <label class="console-field">
                <span>Display name</span>
                <input type="text" formControlName="displayName" placeholder="Editorial Manager" />
              </label>

              <label class="console-field">
                <span>Initial role</span>
                <select formControlName="roleKey">
                  <option value="editor">Editor</option>
                  <option *ngFor="let role of roles" [value]="role.key">{{ role.name }}</option>
                </select>
              </label>

              <button type="submit" class="console-button console-button--full" [disabled]="inviteForm.invalid || inviting">
                {{ inviting ? 'Inviting…' : 'Invite user' }}
              </button>
            </form>
          </app-studio-side-panel>

          <app-studio-side-panel eyebrow="Coverage" title="Role watchlist">
            <div class="console-feed" *ngIf="topRoles.length; else emptyRoles">
              <article class="console-feed__item" *ngFor="let role of topRoles">
                <div>
                  <strong>{{ role.name }}</strong>
                  <p>{{ role.memberCount }} member{{ role.memberCount === 1 ? '' : 's' }} · {{ role.permissions.length }} permissions</p>
                </div>
                <span class="console-tag" [ngClass]="role.isSystem ? 'console-tag--muted' : 'console-tag--accent'">
                  {{ role.isSystem ? 'System' : 'Custom' }}
                </span>
              </article>
            </div>

            <div class="console-inline-actions">
              <a class="console-button console-button--secondary console-button--small" routerLink="/studio/settings/roles">
                Review roles
              </a>
              <a class="console-button console-button--secondary console-button--small" routerLink="/studio/ai/prompts">
                Open prompts
              </a>
            </div>
          </app-studio-side-panel>
        </aside>
      </div>

      <ng-template #loadingState>
        <app-studio-empty-state
          kicker="Settings"
          title="Loading users"
          body="Estamos reuniendo invitaciones, actividad y asignaciones de roles del workspace."
        ></app-studio-empty-state>
      </ng-template>

      <ng-template #emptyUsers>
        <app-studio-empty-state
          kicker="Settings"
          title="No users match the current view"
          body="Ajusta los filtros o invita al primer editor para activar colaboración humana dentro del cockpit."
        ></app-studio-empty-state>
      </ng-template>

      <ng-template #emptyRoles>
        <div class="console-empty-compact">
          <p>No roles loaded yet.</p>
        </div>
      </ng-template>

      <ng-template #noRoles>
        <span class="console-tag console-tag--warning">No roles yet</span>
      </ng-template>
    </section>
  `,
})
export class UsersPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly inviteForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    displayName: new FormControl('', { nonNullable: true }),
    roleKey: new FormControl('editor', { nonNullable: true }),
  });

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    status: new FormControl<UserFocus>('all', { nonNullable: true }),
  });

  users: StudioUserSummary[] = [];
  filteredUsers: StudioUserSummary[] = [];
  roles: StudioRoleSummary[] = [];
  stats: StudioStatItem[] = [];
  loading = true;
  inviting = false;
  error = '';
  notice = '';

  get activeUsersCount(): number {
    return this.users.filter((user) => user.status === 'active').length;
  }

  get invitedUsersCount(): number {
    return this.users.filter((user) => user.status === 'invited').length;
  }

  get suspendedUsersCount(): number {
    return this.users.filter((user) => user.status === 'suspended').length;
  }

  get rolelessUsersCount(): number {
    return this.users.filter((user) => user.roles.length === 0).length;
  }

  get governanceSeatCount(): number {
    return this.users.filter((user) => this.userHasGovernanceAccess(user)).length;
  }

  get staleAccessCount(): number {
    return this.users.filter((user) => user.status === 'active' && !user.lastLoginAt).length;
  }

  get roleCoverageLabel(): string {
    return `${this.users.length - this.rolelessUsersCount}/${this.users.length || 0}`;
  }

  get topRoles(): StudioRoleSummary[] {
    return [...this.roles]
      .sort((left, right) => right.memberCount - left.memberCount || left.name.localeCompare(right.name))
      .slice(0, 5);
  }

  get accessNarrative(): string {
    if (!this.users.length) {
      return 'Todavía no hay colaboración humana activa en el workspace. Antes de vender operación enterprise hace falta abrir la primera capa real de acceso y ownership.';
    }

    if (this.invitedUsersCount > 0) {
      return `${this.invitedUsersCount} seat${this.invitedUsersCount === 1 ? '' : 's'} siguen pendientes de activación. Users deja de ser un simple directorio y pasa a mostrar el handoff real entre provisión y operación.`;
    }

    if (this.suspendedUsersCount > 0) {
      return `${this.suspendedUsersCount} seat${this.suspendedUsersCount === 1 ? '' : 's'} permanecen suspendidos. La gobernanza del tenant ya exige visibilidad explícita de acceso vivo frente a acceso preservado solo por historial.`;
    }

    if (this.rolelessUsersCount > 0) {
      return `${this.rolelessUsersCount} usuario${this.rolelessUsersCount === 1 ? '' : 's'} no tienen roles asignados. El riesgo ya no está en invitar más gente, sino en cerrar coverage efectiva sobre el workspace.`;
    }

    return `${this.activeUsersCount} usuarios activos ya operan sobre ${this.roles.length} roles y ${this.governanceSeatCount} seats con permisos de gobierno. La superficie empieza a funcionar como control plane de acceso, no como simple libreta de cuentas.`;
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      users: this.api.listUsers(),
      roles: this.api.listRoles(),
    }).subscribe({
      next: ({ users, roles }) => {
        this.users = users;
        this.roles = roles;
        this.stats = [
          {
            label: 'Active seats',
            value: this.activeUsersCount,
            detail: 'Miembros con acceso operativo real al cockpit.',
            tone: this.activeUsersCount > 0 ? 'success' : 'muted',
          },
          {
            label: 'Pending invites',
            value: this.invitedUsersCount,
            detail: 'Cuentas provisionadas que todavía no completan el primer login.',
            tone: this.invitedUsersCount > 0 ? 'warning' : 'muted',
          },
          {
            label: 'Suspended seats',
            value: this.suspendedUsersCount,
            detail: 'Accesos pausados que conservan historial pero pierden entrada al Studio.',
            tone: this.suspendedUsersCount > 0 ? 'danger' : 'muted',
          },
          {
            label: 'Governance seats',
            value: this.governanceSeatCount,
            detail: 'Usuarios con permisos para gestionar workspace, roles o identidades.',
            tone: this.governanceSeatCount > 0 ? 'accent' : 'warning',
          },
        ];
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }

  inviteUser(): void {
    if (this.inviteForm.invalid || this.inviting) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    this.inviting = true;
    this.notice = '';
    this.error = '';

    this.api
      .inviteUser({
        email: this.inviteForm.controls.email.value.trim(),
        displayName: this.inviteForm.controls.displayName.value.trim() || null,
        roleKeys: [this.inviteForm.controls.roleKey.value],
      })
      .subscribe({
        next: () => {
          this.inviting = false;
          this.notice = 'Invitation queued. The user can enter through SSO as soon as the IdP grants a valid login.';
          this.inviteForm.reset({ email: '', displayName: '', roleKey: 'editor' });
          this.loadData();
        },
        error: (error) => {
          this.inviting = false;
          this.error = formatApiError(error);
        },
      });
  }

  assignRole(user: StudioUserSummary, roleId: string): void {
    if (!roleId) {
      return;
    }

    this.api.assignRole(user.id, roleId).subscribe({
      next: () => {
        this.notice = `Role assigned to ${user.displayName}.`;
        this.loadData();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  removeRole(user: StudioUserSummary, roleId: string): void {
    this.api.removeRole(user.id, roleId).subscribe({
      next: () => {
        this.notice = `Role removed from ${user.displayName}.`;
        this.loadData();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  toggleStatus(user: StudioUserSummary): void {
    const nextStatus =
      user.status === 'suspended'
        ? 'active'
        : user.status === 'invited'
          ? 'active'
          : 'suspended';

    this.api.updateUser(user.id, { status: nextStatus }).subscribe({
      next: () => {
        this.notice = `${user.displayName} is now ${nextStatus}.`;
        this.loadData();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  availableRoles(user: StudioUserSummary): StudioRoleSummary[] {
    const assigned = new Set(user.roles.map((role) => role.id));
    return this.roles.filter((role) => !assigned.has(role.id));
  }

  applyStatusFocus(status: Exclude<UserFocus, 'all'>): void {
    this.filterForm.controls.status.setValue(status);
    this.applyFilters();
  }

  applyFilters(): void {
    const query = this.filterForm.controls.query.value.trim().toLowerCase();
    const status = this.filterForm.controls.status.value;

    this.filteredUsers = this.users.filter((user) => {
      if (status !== 'all' && user.status !== status) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        user.displayName,
        user.email,
        user.authProvider,
        ...user.roles.map((role) => role.name),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  userStatusTagClass(status: StudioUserSummary['status']): string {
    switch (status) {
      case 'active':
        return 'console-tag--success';
      case 'invited':
        return 'console-tag--warning';
      case 'suspended':
        return 'console-tag--danger';
      default:
        return 'console-tag--muted';
    }
  }

  userProviderLabel(user: StudioUserSummary): string {
    return user.authProvider === 'oidc' ? 'SSO linked' : 'Invitation only';
  }

  userStatusNarrative(user: StudioUserSummary): string {
    if (user.status === 'invited') {
      return 'Waiting for the first valid login.';
    }
    if (user.status === 'suspended') {
      return 'History preserved, cockpit access paused.';
    }
    return this.userHasGovernanceAccess(user) ? 'Active with governance scope.' : 'Active editorial seat.';
  }

  userActivityLabel(user: StudioUserSummary): string {
    if (!user.lastLoginAt) {
      return user.status === 'invited' ? 'No login yet' : 'No activity recorded yet';
    }
    return `Last login ${this.formatDate(user.lastLoginAt)}`;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  private userHasGovernanceAccess(user: StudioUserSummary): boolean {
    return user.roles.some((assignedRole) => {
      const role = this.roles.find((candidate) => candidate.id === assignedRole.id);
      return role
        ? role.permissions.some((permission) =>
            ['workspace.manage', 'users.manage', 'roles.manage'].includes(permission),
          )
        : false;
    });
  }
}
