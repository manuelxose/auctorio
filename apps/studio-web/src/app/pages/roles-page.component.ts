import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StudioEmptyStateComponent } from '../components/studio-empty-state.component';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioSidePanelComponent } from '../components/studio-side-panel.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import type { StudioPermission, StudioRoleSummary, StudioUserSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

const PERMISSIONS: StudioPermission[] = [
  'workspace.manage',
  'users.manage',
  'roles.manage',
  'prompts.manage',
  'projects.manage',
  'review.approve',
  'publishing.manage',
  'integrations.manage',
  'analytics.read',
];

type RoleFocus = 'all' | 'system' | 'custom' | 'dormant';

@Component({
  selector: 'app-roles-page',
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
        title="Roles"
        intro="RBAC del cockpit: roles base, especialización por tenant y matriz de permisos efectiva."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--accent">{{ roles.length }} roles</span>
          <span class="console-tag console-tag--muted">{{ customRoleCount }} custom</span>
          <span class="console-tag console-tag--success">{{ governanceSeatCount }} governance seats</span>
        </div>

        <a page-actions class="console-button console-button--secondary" routerLink="/studio/settings/workspace">
          Open workspace
        </a>
        <a page-actions class="console-button console-button--secondary" routerLink="/studio/settings/users">
          Open users
        </a>
        <button page-actions type="button" class="console-button" (click)="startCreate()">
          Create custom role
        </button>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="stats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">RBAC posture</p>
            <h2 class="console-surface__title">Permission governance across system defaults and tenant specialization</h2>
            <p class="console-hero-copy__body">{{ roleNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>System roles</span>
                <strong>{{ systemRoleCount }}</strong>
                <small>Seeded defaults that anchor workspace bootstrap and baseline governance.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Custom roles</span>
                <strong>{{ customRoleCount }}</strong>
                <small>{{ dormantCustomRoleCount }} custom role{{ dormantCustomRoleCount === 1 ? '' : 's' }} still have no assigned seats.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Publishing authority</span>
                <strong>{{ publishingAuthoritySeatCount }}</strong>
                <small>Seats that can approve or push content across editorial and publishing operations.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">RBAC watchlist</h2>
              </div>
            </div>

            <div class="console-focus-list">
              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="!dormantRoleLead"
                (click)="focusRole(dormantRoleLead)"
              >
                <div>
                  <strong>{{ dormantRoleLead?.name || 'Dormant custom roles clear' }}</strong>
                  <p>
                    {{
                      dormantRoleLead
                        ? dormantCustomRoleCount + ' custom role' + (dormantCustomRoleCount === 1 ? '' : 's') + ' still have no adoption footprint.'
                        : 'Every custom role already has at least one seat assigned.'
                    }}
                  </p>
                </div>
                <span class="console-tag" [ngClass]="dormantRoleLead ? 'console-tag--warning' : 'console-tag--success'">
                  {{ dormantRoleLead ? 'Needs coverage' : 'Healthy' }}
                </span>
              </button>

              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="!governanceLeadRole"
                (click)="focusRole(governanceLeadRole)"
              >
                <div>
                  <strong>{{ governanceLeadRole?.name || 'Governance spread' }}</strong>
                  <p>
                    {{
                      governanceLeadRole
                        ? governanceLeadRole.memberCount + ' seat' + (governanceLeadRole.memberCount === 1 ? '' : 's') + ' currently concentrate the main management permissions.'
                        : 'No governance role is currently resolved from the RBAC matrix.'
                    }}
                  </p>
                </div>
                <span class="console-tag" [ngClass]="governanceLeadRole ? 'console-tag--accent' : 'console-tag--warning'">
                  {{ governanceLeadRole ? 'Review access' : 'Missing role' }}
                </span>
              </button>

              <a class="console-focus-card" routerLink="/studio/settings/users">
                <div>
                  <strong>Seat assignments</strong>
                  <p>{{ assignedSeatCount }} current role assignments span across {{ users.length }} workspace member{{ users.length === 1 ? '' : 's' }}.</p>
                </div>
                <span class="console-tag console-tag--muted">Open users</span>
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
                <p class="console-surface__eyebrow">Role matrix</p>
                <h2 class="console-surface__title">Roles and permission coverage</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ filteredRoles.length }} visible roles</span>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Role, description or permission"
                  (input)="applyFilters()"
                />
              </label>

              <label class="console-select">
                <span>Focus</span>
                <select formControlName="kind" (change)="applyFilters()">
                  <option value="all">All roles</option>
                  <option value="system">System</option>
                  <option value="custom">Custom</option>
                  <option value="dormant">Dormant custom</option>
                </select>
              </label>
            </form>

            <div class="console-table" *ngIf="filteredRoles.length; else emptyRoles">
              <div class="console-table__head console-table__head--roles">
                <span>Role</span>
                <span>Permissions</span>
                <span>Members</span>
                <span>Actions</span>
              </div>

              <article class="console-table__row console-table__row--roles" *ngFor="let role of filteredRoles">
                <div>
                  <strong>{{ role.name }}</strong>
                  <span>{{ role.description || 'No description' }}</span>
                  <small>{{ role.isSystem ? 'System role' : 'Custom role' }} · {{ role.permissions.length }} permissions</small>
                </div>

                <div class="console-chip-row console-chip-row--tight">
                  <span class="console-chip" *ngFor="let permission of role.permissions">
                    {{ permission }}
                  </span>
                </div>

                <div class="console-inline-actions console-inline-actions--stack">
                  <strong>{{ role.memberCount }}</strong>
                  <small>{{ roleMemberNarrative(role) }}</small>
                </div>

                <div class="console-inline-actions">
                  <button
                    type="button"
                    class="console-button console-button--secondary console-button--small"
                    (click)="startClone(role)"
                  >
                    Clone
                  </button>
                  <button
                    type="button"
                    class="console-button console-button--secondary console-button--small"
                    (click)="startEdit(role)"
                    [disabled]="role.isSystem"
                  >
                    Edit
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <app-studio-side-panel eyebrow="Editor" [title]="editorTitle">
            <form class="console-form" [formGroup]="roleForm" (ngSubmit)="saveRole()">
              <label class="console-field">
                <span>Name</span>
                <input type="text" formControlName="name" placeholder="Regional Publisher" />
              </label>

              <label class="console-field">
                <span>Key</span>
                <input type="text" formControlName="key" placeholder="regional_publisher" />
              </label>

              <label class="console-field">
                <span>Description</span>
                <textarea rows="3" formControlName="description" placeholder="What this role controls"></textarea>
              </label>

              <div class="console-checkbox-grid">
                <label class="console-checkbox" *ngFor="let permission of permissionControls.controls; let index = index">
                  <input type="checkbox" [formControl]="permission" />
                  <span>{{ permissions[index] }}</span>
                </label>
              </div>

              <button
                type="submit"
                class="console-button console-button--full"
                [disabled]="roleForm.invalid || saving || selectedRole?.isSystem"
              >
                {{ saving ? 'Saving…' : editorActionLabel }}
              </button>
            </form>
          </app-studio-side-panel>

          <app-studio-side-panel eyebrow="Coverage" title="Role adoption">
            <div class="console-feed" *ngIf="topRoles.length; else emptyRoleCoverage">
              <article class="console-feed__item" *ngFor="let role of topRoles">
                <div>
                  <strong>{{ role.name }}</strong>
                  <p>{{ role.memberCount }} member{{ role.memberCount === 1 ? '' : 's' }} · {{ role.permissions.length }} permissions</p>
                </div>
                <span class="console-tag" [ngClass]="roleKindTagClass(role)">
                  {{ role.isSystem ? 'System' : 'Custom' }}
                </span>
              </article>
            </div>

            <div class="console-inline-actions">
              <a class="console-button console-button--secondary console-button--small" routerLink="/studio/settings/users">
                Review users
              </a>
              <a class="console-button console-button--secondary console-button--small" routerLink="/studio/settings/workspace">
                Open workspace
              </a>
            </div>
          </app-studio-side-panel>
        </aside>
      </div>

      <ng-template #loadingState>
        <app-studio-empty-state
          kicker="Settings"
          title="Loading roles"
          body="Estamos reuniendo roles base, roles custom y cobertura real de permisos."
        ></app-studio-empty-state>
      </ng-template>

      <ng-template #emptyRoles>
        <app-studio-empty-state
          kicker="Settings"
          title="No roles match the current view"
          body="Ajusta los filtros o crea el siguiente rol custom para seguir especializando el cockpit."
        ></app-studio-empty-state>
      </ng-template>

      <ng-template #emptyRoleCoverage>
        <div class="console-empty-compact">
          <p>No role coverage available yet.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class RolesPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly formBuilder = inject(FormBuilder);

  readonly permissions = PERMISSIONS;
  readonly roleForm = this.formBuilder.group({
    name: this.formBuilder.nonNullable.control('', [Validators.required]),
    key: this.formBuilder.nonNullable.control(''),
    description: this.formBuilder.nonNullable.control(''),
    permissions: this.formBuilder.array(
      this.permissions.map(() => this.formBuilder.nonNullable.control(false)),
    ),
  });

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    kind: new FormControl<RoleFocus>('all', { nonNullable: true }),
  });

  roles: StudioRoleSummary[] = [];
  filteredRoles: StudioRoleSummary[] = [];
  users: StudioUserSummary[] = [];
  stats: StudioStatItem[] = [];
  selectedRole: StudioRoleSummary | null = null;
  cloneFromRoleId: string | null = null;
  loading = true;
  saving = false;
  error = '';
  notice = '';

  get permissionControls(): FormArray<FormControl<boolean>> {
    return this.roleForm.controls.permissions as FormArray<FormControl<boolean>>;
  }

  get editorTitle(): string {
    if (this.cloneFromRoleId) {
      return 'Clone role';
    }
    return this.selectedRole ? `Edit ${this.selectedRole.name}` : 'Create custom role';
  }

  get editorActionLabel(): string {
    if (this.cloneFromRoleId) {
      return 'Create cloned role';
    }
    return this.selectedRole ? 'Save role' : 'Create role';
  }

  get systemRoleCount(): number {
    return this.roles.filter((role) => role.isSystem).length;
  }

  get customRoleCount(): number {
    return this.roles.filter((role) => !role.isSystem).length;
  }

  get dormantCustomRoleCount(): number {
    return this.roles.filter((role) => !role.isSystem && role.memberCount === 0).length;
  }

  get assignedSeatCount(): number {
    return this.roles.reduce((sum, role) => sum + role.memberCount, 0);
  }

  get governanceSeatCount(): number {
    return this.users.filter((user) => this.userHasAnyPermission(user, ['workspace.manage', 'users.manage', 'roles.manage'])).length;
  }

  get publishingAuthoritySeatCount(): number {
    return this.users.filter((user) => this.userHasAnyPermission(user, ['review.approve', 'publishing.manage'])).length;
  }

  get dormantRoleLead(): StudioRoleSummary | null {
    return this.roles.find((role) => !role.isSystem && role.memberCount === 0) ?? null;
  }

  get governanceLeadRole(): StudioRoleSummary | null {
    return this.roles
      .filter((role) => role.permissions.some((permission) => ['workspace.manage', 'users.manage', 'roles.manage'].includes(permission)))
      .sort((left, right) => right.memberCount - left.memberCount || left.name.localeCompare(right.name))[0] ?? null;
  }

  get topRoles(): StudioRoleSummary[] {
    return [...this.roles]
      .sort((left, right) => right.memberCount - left.memberCount || left.name.localeCompare(right.name))
      .slice(0, 5);
  }

  get roleNarrative(): string {
    if (!this.roles.length) {
      return 'Todavía no existe una matriz RBAC visible para el tenant. Sin ella, el cockpit no puede pretender comportamiento enterprise serio.';
    }

    if (this.dormantCustomRoleCount > 0) {
      return `${this.dormantCustomRoleCount} role${this.dormantCustomRoleCount === 1 ? '' : 's'} custom siguen sin adopción. La deuda ya no está en crear más permisos, sino en simplificar o asignar mejor la matriz real.`;
    }

    if (this.governanceSeatCount <= 1 && this.users.length > 2) {
      return `La autoridad de gobierno sigue concentrada en ${this.governanceSeatCount} seat${this.governanceSeatCount === 1 ? '' : 's'}. Roles debe enseñar no solo la matriz, sino también el riesgo operativo de concentración.`;
    }

    return `${this.roles.length} roles gobiernan ${this.users.length} usuarios y ${this.assignedSeatCount} asignaciones activas. La superficie ya se acerca a un control plane RBAC y no a una tabla administrativa aislada.`;
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      roles: this.api.listRoles(),
      users: this.api.listUsers(),
    }).subscribe({
      next: ({ roles, users }) => {
        this.roles = roles;
        this.users = users;
        this.stats = [
          {
            label: 'System roles',
            value: this.systemRoleCount,
            detail: 'Roles base seedeados automáticamente para cada tenant.',
            tone: this.systemRoleCount > 0 ? 'muted' : 'warning',
          },
          {
            label: 'Custom roles',
            value: this.customRoleCount,
            detail: 'Especialización editorial y operativa añadida por el workspace.',
            tone: this.customRoleCount > 0 ? 'accent' : 'muted',
          },
          {
            label: 'Governance seats',
            value: this.governanceSeatCount,
            detail: 'Usuarios con permisos de administración de workspace, users o roles.',
            tone: this.governanceSeatCount > 0 ? 'success' : 'warning',
          },
          {
            label: 'Publishing authority',
            value: this.publishingAuthoritySeatCount,
            detail: 'Seats capaces de aprobar o publicar contenido desde el cockpit.',
            tone: this.publishingAuthoritySeatCount > 0 ? 'accent' : 'warning',
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

  startCreate(): void {
    this.selectedRole = null;
    this.cloneFromRoleId = null;
    this.resetForm();
  }

  startEdit(role: StudioRoleSummary): void {
    this.selectedRole = role;
    this.cloneFromRoleId = null;
    this.resetForm(role);
  }

  startClone(role: StudioRoleSummary): void {
    this.selectedRole = null;
    this.cloneFromRoleId = role.id;
    this.resetForm({
      name: `${role.name} Clone`,
      key: '',
      description: role.description,
      permissions: role.permissions,
    });
  }

  saveRole(): void {
    if (this.roleForm.invalid || this.saving || this.selectedRole?.isSystem) {
      this.roleForm.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.error = '';
    this.notice = '';

    const payload = {
      key: this.roleForm.controls.key.value.trim() || undefined,
      name: this.roleForm.controls.name.value.trim(),
      description: this.roleForm.controls.description.value.trim() || null,
      permissions: this.selectedPermissions(),
    };

    const request = this.selectedRole
      ? this.api.updateRole(this.selectedRole.id, payload)
      : this.api.createRole({
          ...payload,
          cloneFromRoleId: this.cloneFromRoleId,
        });

    request.subscribe({
      next: () => {
        this.saving = false;
        this.notice = this.selectedRole ? 'Role updated.' : 'Custom role created.';
        this.startCreate();
        this.loadData();
      },
      error: (error) => {
        this.saving = false;
        this.error = formatApiError(error);
      },
    });
  }

  applyFilters(): void {
    const query = this.filterForm.controls.query.value.trim().toLowerCase();
    const kind = this.filterForm.controls.kind.value;

    this.filteredRoles = this.roles.filter((role) => {
      if (kind === 'system' && !role.isSystem) {
        return false;
      }
      if (kind === 'custom' && role.isSystem) {
        return false;
      }
      if (kind === 'dormant' && (role.isSystem || role.memberCount > 0)) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [role.name, role.key, role.description || '', ...role.permissions]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  focusRole(role: StudioRoleSummary | null): void {
    if (!role) {
      return;
    }

    this.filterForm.controls.query.setValue(role.name);
    this.filterForm.controls.kind.setValue(role.isSystem ? 'system' : 'custom');
    this.applyFilters();
    if (!role.isSystem) {
      this.startEdit(role);
    }
  }

  roleMemberNarrative(role: StudioRoleSummary): string {
    if (role.memberCount === 0) {
      return role.isSystem ? 'System baseline with no direct seats.' : 'Custom role still not assigned.';
    }
    if (role.permissions.some((permission) => ['workspace.manage', 'users.manage', 'roles.manage'].includes(permission))) {
      return 'Governance-sensitive access.';
    }
    if (role.permissions.some((permission) => ['review.approve', 'publishing.manage'].includes(permission))) {
      return 'Editorial release authority.';
    }
    return 'Operational role coverage.';
  }

  roleKindTagClass(role: StudioRoleSummary): string {
    return role.isSystem ? 'console-tag--muted' : 'console-tag--accent';
  }

  private resetForm(role?: Pick<StudioRoleSummary, 'name' | 'description' | 'permissions' | 'key'>): void {
    this.roleForm.reset({
      name: role?.name || '',
      key: role?.key || '',
      description: role?.description || '',
      permissions: this.permissions.map((permission) => role?.permissions.includes(permission) ?? false),
    });
  }

  private selectedPermissions(): StudioPermission[] {
    return this.permissionControls.controls
      .map((control, index) => (control.value ? this.permissions[index] : null))
      .filter((permission): permission is StudioPermission => Boolean(permission));
  }

  private userHasAnyPermission(user: StudioUserSummary, permissions: StudioPermission[]): boolean {
    return user.roles.some((assignedRole) => {
      const role = this.roles.find((candidate) => candidate.id === assignedRole.id);
      return role ? role.permissions.some((permission) => permissions.includes(permission)) : false;
    });
  }
}
