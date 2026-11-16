import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import type { StudioPermission } from '../models/studio.models';

const PERMISSION_LABELS: Record<StudioPermission, string> = {
  'workspace.manage': 'Manage workspace',
  'users.manage': 'Invite and remove people',
  'roles.manage': 'Edit roles',
  'prompts.manage': 'Edit writing prompts',
  'projects.manage': 'Manage content and plan',
  'review.approve': 'Approve content',
  'publishing.manage': 'Publish to sites',
  'integrations.manage': 'Connect sites and accounts',
  'analytics.read': 'View analytics',
};

/** Personal account: who you are, what you can do, which sites you reach. Workspace and platform controls live elsewhere. */
@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Account</p>
          <h1 class="au-page__title">Profile</h1>
        </div>
      </header>

      <div class="au-profile">
        <section class="au-panel au-profile__identity">
          <span class="au-avatar au-profile__avatar">{{ initials }}</span>
          <div class="au-profile__who">
            <h2 class="au-profile__name">{{ user?.displayName || user?.email }}</h2>
            <p class="au-profile__email">{{ user?.email }}</p>
          </div>
          <span class="au-badge au-badge--outline">{{ role }}</span>
          <button class="au-btn" type="button" (click)="logout()"><app-icon name="logout"></app-icon>Log out</button>
        </section>

        <section class="au-panel">
          <header class="au-panel__header">
            <div>
              <h2 class="au-panel__title">Your sites</h2>
              <p class="au-panel__subtitle">The site you pick drives plan, content and publishing.</p>
            </div>
            <a class="au-btn" routerLink="/studio/connections/wizard"><app-icon name="plus"></app-icon>Add site</a>
          </header>
          <div class="au-row" *ngFor="let site of sites">
            <span class="au-row__title">{{ site.name }}</span>
            <span class="au-row__meta">{{ site.role }}</span>
            <span class="au-badge au-badge--brand" *ngIf="site.id === activeSiteId">Active</span>
            <button class="au-btn" type="button" *ngIf="site.id !== activeSiteId" (click)="useSite(site.id)">Use</button>
          </div>
          <p class="au-row au-muted" *ngIf="sites.length === 0">No sites yet.</p>
        </section>

        <section class="au-panel">
          <header class="au-panel__header">
            <div>
              <h2 class="au-panel__title">What your role allows</h2>
              <p class="au-panel__subtitle">Set by workspace admins.</p>
            </div>
          </header>
          <ul class="au-profile__perms">
            <li *ngFor="let permission of permissions"><app-icon name="circle-check"></app-icon>{{ labelOf(permission) }}</li>
          </ul>
          <p class="au-row au-muted" *ngIf="permissions.length === 0">Access follows the {{ role }} role.</p>
        </section>
      </div>
    </section>
  `,
})
export class ProfilePageComponent implements OnInit {
  private readonly appContext = inject(AppContextService);
  private readonly api = inject(StudioApiService);
  private readonly router = inject(Router);

  permissions: string[] = [];

  get user() { return this.appContext.user(); }
  get role() { return this.appContext.role(); }
  get sites() { return this.appContext.sites(); }
  get activeSiteId(): string | null { return this.appContext.session()?.activeSiteId ?? null; }
  get initials(): string {
    const name = this.user?.displayName || this.user?.email || '?';
    return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
  }

  ngOnInit(): void {
    this.api.listRoles().subscribe({
      next: (roles) => (this.permissions = roles.find((r) => r.key === this.role)?.permissions ?? []),
      error: () => (this.permissions = []),
    });
  }

  labelOf(permission: string): string {
    return PERMISSION_LABELS[permission as StudioPermission] ?? permission;
  }

  async useSite(siteId: string): Promise<void> {
    await this.appContext.switchSite(siteId);
  }

  logout(): void {
    void this.appContext.logout().then(() => this.router.navigate(['/login']));
  }
}
