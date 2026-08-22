import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { AiUsageRow, StudioRoleSummary, StudioSiteSummary, StudioUserSummary } from '../models/studio.models';

type SettingsSection = 'profile' | 'sites' | 'team' | 'roles' | 'ai';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Workspace configuration</p>
          <h1 class="au-page__title">Settings</h1>
          <p class="au-page__subtitle">Profile, sites, team, roles and AI preferences.</p>
        </div>
      </header>

      <div class="au-settings">
        <nav class="au-settings__nav" aria-label="Settings sections">
          <button class="au-btn au-btn--ghost" [class.is-active]="section === 'profile'" type="button" (click)="setSection('profile')">
            <app-icon name="user"></app-icon>
            Profile
          </button>
          <button class="au-btn au-btn--ghost" [class.is-active]="section === 'sites'" type="button" (click)="setSection('sites')">
            <app-icon name="globe"></app-icon>
            Sites
          </button>
          <button class="au-btn au-btn--ghost" [class.is-active]="section === 'team'" type="button" (click)="setSection('team')">
            <app-icon name="user"></app-icon>
            Users
          </button>
          <button class="au-btn au-btn--ghost" [class.is-active]="section === 'roles'" type="button" (click)="setSection('roles')">
            <app-icon name="lock"></app-icon>
            Roles
          </button>
          <button class="au-btn au-btn--ghost" [class.is-active]="section === 'ai'" type="button" (click)="setSection('ai')">
            <app-icon name="sparkles"></app-icon>
            AI
          </button>
        </nav>

        <section class="au-panel au-panel--padded" *ngIf="section === 'profile'">
          <h2 class="au-panel__title au-mb-3">Profile</h2>
          <dl class="au-kv">
            <dt>Name</dt>
            <dd>{{ user?.displayName || '—' }}</dd>
            <dt>Email</dt>
            <dd>{{ user?.email || '—' }}</dd>
            <dt>Role</dt>
            <dd>{{ role }}</dd>
            <dt>Accessible sites</dt>
            <dd>{{ siteNames }}</dd>
          </dl>
        </section>

        <section class="au-panel au-panel--padded" *ngIf="section === 'sites'">
          <h2 class="au-panel__title">Sites</h2>
          <p class="au-panel__subtitle au-mb-3">Destinations you can publish to.</p>
          <app-empty-state
            *ngIf="tenantSites.length === 0"
            icon="globe"
            title="No sites in the active workspace"
            text="Sites appear here once they are connected to your account."
          ></app-empty-state>
          <div class="au-row" *ngFor="let site of tenantSites">
            <span class="au-row__title">{{ site.name }}</span>
            <span class="au-badge au-badge--outline">{{ site.type }}</span>
            <span class="au-row__meta">{{ site.baseUrl || '—' }}</span>
          </div>
        </section>

        <section class="au-panel au-panel--padded" *ngIf="section === 'team'">
          <h2 class="au-panel__title">Users</h2>
          <p class="au-panel__subtitle au-mb-3">People who can access this workspace.</p>
          <app-empty-state *ngIf="users.length === 0" icon="user" title="No team members yet" text="Invite the first member by email."></app-empty-state>
          <div class="au-row" *ngFor="let member of users">
            <span class="au-avatar">{{ initialsOf(member.displayName) }}</span>
            <span class="au-row__title">{{ member.displayName }}</span>
            <span class="au-row__meta">{{ member.email }}</span>
            <span class="au-badge au-badge--brand">{{ rolesLabel(member) }}</span>
          </div>

          <form class="au-mt-4" (ngSubmit)="invite()">
            <h3 class="au-panel__title au-mb-2">Invite by email</h3>
            <div class="au-inline au-inline--wrap">
              <input class="au-input au-flex-1" style="min-width: 220px" type="email" name="inviteEmail" placeholder="editor@example.com" [(ngModel)]="inviteEmail" />
              <select class="au-select au-filter-select" name="inviteRole" [(ngModel)]="inviteRole" aria-label="Invite role">
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button class="au-btn au-btn--primary" type="submit" [disabled]="inviting">
                {{ inviting ? 'Sending…' : 'Invite' }}
              </button>
            </div>
          </form>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <div class="au-banner au-banner--success" *ngIf="notice">
            <app-icon name="circle-check"></app-icon>
            <span class="au-banner__text">{{ notice }}</span>
          </div>
        </section>

        <section class="au-panel au-panel--padded" *ngIf="section === 'roles'">
          <h2 class="au-panel__title">Roles</h2>
          <p class="au-panel__subtitle au-mb-3">Permission sets available in this workspace.</p>
          <app-empty-state *ngIf="roles.length === 0" icon="lock" title="No roles defined" text="Roles appear here once assigned."></app-empty-state>
          <div class="au-row" *ngFor="let role of roles">
            <span class="au-row__title">{{ role.name }}</span>
            <span class="au-row__meta au-truncate" style="max-width: 420px">{{ permissionsLabel(role) }}</span>
            <span class="au-badge au-badge--neutral">{{ role.memberCount }} members</span>
          </div>
        </section>

        <section class="au-panel au-panel--padded" *ngIf="section === 'ai'">
          <h2 class="au-panel__title">AI</h2>
          <p class="au-panel__subtitle au-mb-3">
            Generation uses the default editorial profile of each site. Advanced prompt management is available to administrators through the API.
          </p>
          <h3 class="au-panel__title au-mt-2 au-mb-2">Usage by provider and model</h3>
          <app-empty-state *ngIf="usageRows.length === 0" icon="sparkles" title="No AI usage recorded yet" text="Usage appears after the first generation."></app-empty-state>
          <div class="au-usage" *ngIf="usageRows.length > 0">
            <div class="au-usage__row" *ngFor="let row of usageRows">
              <span class="au-usage__model">{{ row.provider }} / {{ row.model }}</span>
              <span class="au-badge au-badge--neutral">{{ row.textCount }} texts</span>
              <span class="au-badge au-badge--neutral">{{ row.imageCount }} images</span>
              <span class="au-badge au-badge--neutral">{{ row.tokensInput + row.tokensOutput }} tokens</span>
              <span class="au-badge au-badge--brand">{{ costLabel(row) }}</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  `,
})
export class SettingsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);

  section: SettingsSection = 'profile';
  tenantSites: StudioSiteSummary[] = [];
  users: StudioUserSummary[] = [];
  roles: StudioRoleSummary[] = [];
  usageRows: AiUsageRow[] = [];
  inviteEmail = '';
  inviteRole = 'editor';
  inviting = false;
  error = '';
  notice = '';

  get user() {
    return this.appContext.user();
  }

  get role() {
    return this.appContext.role();
  }

  get siteNames(): string {
    return this.appContext
      .sites()
      .map((site) => site.name)
      .join(', ');
  }

  ngOnInit(): void {
    const sectionParam = String(this.route.snapshot.paramMap.get('section') || 'profile');
    if (['profile', 'sites', 'team', 'roles', 'ai'].includes(sectionParam)) {
      this.section = sectionParam as SettingsSection;
    }
    this.load();
  }

  load(): void {
    this.api.listTenantSites(1, 50).subscribe({
      next: (response) => {
        this.tenantSites = response.items;
      },
      error: () => {
        this.tenantSites = [];
      },
    });
    this.api.listUsers().subscribe({
      next: (users) => {
        this.users = users;
      },
      error: () => {
        this.users = [];
      },
    });
    this.api.listRoles().subscribe({
      next: (roles) => {
        this.roles = roles;
      },
      error: () => {
        this.roles = [];
      },
    });
    this.api.getAiUsage().subscribe({
      next: (usage) => {
        this.usageRows = usage.rows;
      },
      error: () => {
        this.usageRows = [];
      },
    });
  }

  setSection(section: SettingsSection): void {
    this.section = section;
    this.error = '';
    this.notice = '';
  }

  rolesLabel(member: StudioUserSummary): string {
    return member.roles.map((role) => role.key).join(', ') || '—';
  }

  permissionsLabel(role: StudioRoleSummary): string {
    return role.permissions?.length ? role.permissions.join(', ') : '—';
  }

  initialsOf(name: string): string {
    return (
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '?'
    );
  }

  costLabel(row: AiUsageRow): string {
    return `$${row.costUsd.toFixed(4)}`;
  }

  invite(): void {
    if (!this.inviteEmail.trim()) {
      this.error = 'Enter an email to invite.';
      return;
    }
    this.inviting = true;
    this.error = '';
    this.api
      .inviteUser({
        email: this.inviteEmail.trim(),
        roleKeys: [this.inviteRole],
      })
      .subscribe({
        next: () => {
          this.inviting = false;
          this.inviteEmail = '';
          this.notice = 'Invitation sent.';
          this.toast.success('Invitation sent.');
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
