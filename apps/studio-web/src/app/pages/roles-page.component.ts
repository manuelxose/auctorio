import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { StudioEmptyStateComponent } from '../components/studio-empty-state.component';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioSidePanelComponent } from '../components/studio-side-panel.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import type { StudioPermission, StudioRoleSummary } from '../models/studio.models';
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

@Component({
  selector: 'app-roles-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
        intro="RBAC del cockpit: roles base, roles custom y matriz de permisos efectiva."
      >
        <button page-actions type="button" class="console-button" (click)="startCreate()">
          Create custom role
        </button>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="stats"></app-studio-stat-strip>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Role matrix</p>
                <h2 class="console-surface__title">Roles and permission coverage</h2>
              </div>
            </div>

            <div class="console-table" *ngIf="roles.length; else emptyRoles">
              <div class="console-table__head console-table__head--roles">
                <span>Role</span>
                <span>Permissions</span>
                <span>Members</span>
                <span>Actions</span>
              </div>

              <article class="console-table__row console-table__row--roles" *ngFor="let role of roles">
                <div>
                  <strong>{{ role.name }}</strong>
                  <span>{{ role.description || 'No description' }}</span>
                  <small>{{ role.isSystem ? 'System role' : 'Custom role' }}</small>
                </div>

                <div class="console-chip-row console-chip-row--tight">
                  <span class="console-chip" *ngFor="let permission of role.permissions">
                    {{ permission }}
                  </span>
                </div>

                <div>
                  <strong>{{ role.memberCount }}</strong>
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

          <app-studio-side-panel eyebrow="Policy" title="System defaults">
            <ul class="console-note-list">
              <li class="console-note-list__item">
                Owner y Admin nacen seedeados por tenant y cubren governance del cockpit.
              </li>
              <li class="console-note-list__item">
                Los system roles no se borran ni se editan; se clonan cuando hace falta especialización.
              </li>
              <li class="console-note-list__item">
                El enforcement vive en backend; la UI solo refleja y protege acceso directo.
              </li>
            </ul>
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
          title="No roles available"
          body="Los roles base deberían aparecer automáticamente al bootstrap del tenant."
        ></app-studio-empty-state>
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

  roles: StudioRoleSummary[] = [];
  stats: StudioStatItem[] = [];
  selectedRole: StudioRoleSummary | null = null;
  cloneFromRoleId: string | null = null;
  loading = true;
  saving = false;
  error = '';
  notice = '';

  ngOnInit(): void {
    this.loadData();
  }

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

  loadData(): void {
    this.loading = true;
    this.error = '';

    this.api.listRoles().subscribe({
      next: (roles) => {
        this.roles = roles;
        this.stats = [
          {
            label: 'System roles',
            value: roles.filter((role) => role.isSystem).length,
            detail: 'Roles base seedeados automáticamente para cada tenant.',
          },
          {
            label: 'Custom roles',
            value: roles.filter((role) => !role.isSystem).length,
            detail: 'Roles específicos del workspace editorial.',
          },
          {
            label: 'Permissions',
            value: this.permissions.length,
            detail: 'Permisos efectivos disponibles en la matriz RBAC.',
          },
          {
            label: 'Assigned seats',
            value: roles.reduce((sum, role) => sum + role.memberCount, 0),
            detail: 'Asignaciones actuales entre usuarios y roles.',
          },
        ];
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
}
