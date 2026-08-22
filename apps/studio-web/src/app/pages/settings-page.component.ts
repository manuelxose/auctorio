import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import type { AiUsageRow, StudioSiteSummary, StudioUserSummary } from '../models/studio.models';

type SettingsSection = 'profile' | 'sites' | 'team' | 'ai';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Settings</h1>
          <p class="au-page__subtitle">Profile, sites, team and AI preferences.</p>
        </div>
      </header>

      <nav class="au-tabs" aria-label="Settings sections">
        <button class="au-tab" [class.is-active]="section === 'profile'" type="button" (click)="setSection('profile')">Profile</button>
        <button class="au-tab" [class.is-active]="section === 'sites'" type="button" (click)="setSection('sites')">Sites</button>
        <button class="au-tab" [class.is-active]="section === 'team'" type="button" (click)="setSection('team')">Team</button>
        <button class="au-tab" [class.is-active]="section === 'ai'" type="button" (click)="setSection('ai')">AI</button>
      </nav>

      <section class="au-surface au-surface--padded" *ngIf="section === 'profile'">
        <h2 class="au-surface__title">Profile</h2>
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

      <section class="au-surface au-surface--padded" *ngIf="section === 'sites'">
        <h2 class="au-surface__title">Sites</h2>
        <p class="au-page__subtitle">Destinations you can publish to.</p>
        <div class="au-empty" *ngIf="tenantSites.length === 0">No sites in the active workspace.</div>
        <div class="au-row" *ngFor="let site of tenantSites">
          <span class="au-row__title">{{ site.name }}</span>
          <span class="au-tag">{{ site.type }}</span>
          <span class="au-row__meta">{{ site.baseUrl || '—' }}</span>
        </div>
      </section>

      <section class="au-surface au-surface--padded" *ngIf="section === 'team'">
        <h2 class="au-surface__title">Team</h2>
        <div class="au-empty" *ngIf="users.length === 0">No team members yet.</div>
        <div class="au-row" *ngFor="let member of users">
          <span class="au-row__title">{{ member.displayName }}</span>
          <span class="au-tag">{{ member.email }}</span>
          <span class="au-tag">{{ rolesLabel(member) }}</span>
        </div>

        <form class="au-form au-settings__invite" (ngSubmit)="invite()">
          <label class="au-field">
            <span class="au-field__label">Invite by email</span>
            <div class="au-inline">
              <input class="au-input" type="email" name="inviteEmail" placeholder="editor@example.com" [(ngModel)]="inviteEmail" />
              <select class="au-input" name="inviteRole" [(ngModel)]="inviteRole">
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button class="au-button au-button--primary" type="submit" [disabled]="inviting">
                {{ inviting ? 'Sending…' : 'Invite' }}
              </button>
            </div>
          </label>
        </form>
        <p class="au-error" *ngIf="error">{{ error }}</p>
        <p class="au-banner au-banner--success" *ngIf="notice">{{ notice }}</p>
      </section>

      <section class="au-surface au-surface--padded" *ngIf="section === 'ai'">
        <h2 class="au-surface__title">AI</h2>
        <p class="au-page__subtitle">
          Generation uses the default editorial profile of each site. Advanced prompt management is available to administrators through the API.
        </p>
        <h3 class="au-surface__title">Usage by provider and model</h3>
        <div class="au-empty" *ngIf="usageRows.length === 0">No AI usage recorded for this workspace yet.</div>
        <div class="au-usage" *ngIf="usageRows.length > 0">
          <div class="au-usage__row" *ngFor="let row of usageRows">
            <span class="au-usage__model">{{ row.provider }} / {{ row.model }}</span>
            <span class="au-tag">{{ row.textCount }} texts</span>
            <span class="au-tag">{{ row.imageCount }} images</span>
            <span class="au-tag">{{ row.tokensInput + row.tokensOutput }} tokens</span>
            <span class="au-tag au-tag--muted">{{ costLabel(row) }}</span>
          </div>
        </div>
      </section>
    </section>
  `,
})
export class SettingsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  section: SettingsSection = 'profile';
  tenantSites: StudioSiteSummary[] = [];
  users: StudioUserSummary[] = [];
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
    if (['profile', 'sites', 'team', 'ai'].includes(sectionParam)) {
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
