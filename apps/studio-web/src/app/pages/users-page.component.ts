import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { StudioEmptyStateComponent } from '../components/studio-empty-state.component';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioSidePanelComponent } from '../components/studio-side-panel.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import type { StudioRoleSummary, StudioUserSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

@Component({
  selector: 'app-users-page',
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
        title="Users"
        intro="Invitaciones, estados de acceso, ownership y roles activos del workspace editorial."
      >
        <button page-actions type="button" class="console-button" (click)="loadData()">
          Refresh users
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
                <p class="console-surface__eyebrow">Directory</p>
                <h2 class="console-surface__title">Workspace members</h2>
              </div>
            </div>

            <div class="console-table" *ngIf="users.length; else emptyUsers">
              <div class="console-table__head console-table__head--users">
                <span>User</span>
                <span>Status</span>
                <span>Roles</span>
                <span>Activity</span>
              </div>

              <article class="console-table__row console-table__row--users" *ngFor="let user of users">
                <div>
                  <strong>{{ user.displayName }}</strong>
                  <span>{{ user.email }}</span>
                  <small>{{ user.authProvider === 'oidc' ? 'SSO' : 'Invitation only' }}</small>
                </div>

                <div>
                  <span
                    class="console-tag"
                    [class.console-tag--success]="user.status === 'active'"
                    [class.console-tag--warning]="user.status === 'invited'"
                    [class.console-tag--danger]="user.status === 'suspended'"
                  >
                    {{ user.status }}
                  </span>
                </div>

                <div class="console-chip-row console-chip-row--tight">
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
                  <span>{{ user.lastLoginAt ? formatDate(user.lastLoginAt) : 'No login yet' }}</span>
                  <div class="console-inline-actions">
                    <select #roleSelect class="console-input console-input--compact">
                      <option value="">Assign role</option>
                      <option
                        *ngFor="let role of availableRoles(user)"
                        [value]="role.id"
                      >
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

          <app-studio-side-panel eyebrow="Governance" title="Access rules">
            <ul class="console-note-list">
              <li class="console-note-list__item">
                El provisioning es invite-only: nadie entra por SSO si no existe invitación o cuenta previa.
              </li>
              <li class="console-note-list__item">
                Los roles se aplican en backend y cada mutación queda alineada con RBAC real.
              </li>
              <li class="console-note-list__item">
                Los usuarios suspendidos conservan historial pero pierden acceso inmediato al cockpit.
              </li>
            </ul>
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
          title="No users yet"
          body="Invita al primer editor o reviewer para activar colaboración humana dentro del cockpit."
        ></app-studio-empty-state>
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

  users: StudioUserSummary[] = [];
  roles: StudioRoleSummary[] = [];
  stats: StudioStatItem[] = [];
  loading = true;
  inviting = false;
  error = '';
  notice = '';

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
            label: 'Active users',
            value: users.filter((user) => user.status === 'active').length,
            detail: 'Miembros con acceso activo al cockpit.',
          },
          {
            label: 'Invited',
            value: users.filter((user) => user.status === 'invited').length,
            detail: 'Cuentas preautorizadas pendientes de primer login SSO.',
          },
          {
            label: 'Suspended',
            value: users.filter((user) => user.status === 'suspended').length,
            detail: 'Accesos pausados sin eliminar el historial del usuario.',
          },
          {
            label: 'Role coverage',
            value: roles.length,
            detail: 'Roles disponibles para operación y governance del workspace.',
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

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }
}
