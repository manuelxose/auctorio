import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Subscription, filter, startWith } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { SeoService } from '../services/seo.service';
import type { StudioSession, StudioSite } from '../models/studio.models';

type NavItem = {
  label: string;
  path: string;
};

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="au-shell" *ngIf="!loading; else bootState">
      <aside class="au-sidebar" [class.is-open]="menuOpen">
        <a class="au-sidebar__brand" routerLink="/studio/overview" (click)="menuOpen = false">
          <span class="au-brand__mark">AU</span>
          <span class="au-brand__name">Auctorio</span>
        </a>

        <div class="au-sidebar__section">
          <label class="au-select au-select--site">
            <span class="au-select__label">Site</span>
            <select class="au-input" [ngModel]="activeSiteId" (ngModelChange)="onSiteChange($event)">
              <option *ngFor="let site of sites" [ngValue]="site.id">
                {{ site.name }}
              </option>
            </select>
          </label>
        </div>

        <nav class="au-nav" aria-label="Primary">
          <a
            *ngFor="let item of primaryNav"
            class="au-nav__item"
            [routerLink]="item.path"
            routerLinkActive="is-active"
            (click)="menuOpen = false"
          >
            <svg class="au-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path [attr.d]="iconPath(item.path)" />
            </svg>
            {{ item.label }}
          </a>
        </nav>

        <nav class="au-nav au-nav--secondary" aria-label="Secondary">
          <a
            class="au-nav__item"
            routerLink="/studio/settings"
            routerLinkActive="is-active"
            (click)="menuOpen = false"
          >
            <svg class="au-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v3 M12 19v3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1 7 17 M17 7l2.1-2.1" />
            </svg>
            Settings
          </a>
        </nav>

        <div class="au-sidebar__footer">
          <div class="au-user" *ngIf="session">
            <span class="au-avatar">{{ initials }}</span>
            <span class="au-user__name">{{ session.user.displayName }}</span>
          </div>
          <button class="au-button au-button--ghost au-button--block" type="button" (click)="logout()">
            Log out
          </button>
        </div>
      </aside>

      <main class="au-main">
        <header class="au-topbar">
          <button
            class="au-menu-toggle"
            type="button"
            (click)="menuOpen = !menuOpen"
            [attr.aria-expanded]="menuOpen"
            aria-label="Toggle navigation"
          >
            <span></span><span></span><span></span>
          </button>
          <div class="au-topbar__context">
            <span class="au-tag">{{ activeSiteName }}</span>
            <span class="au-topbar__title">{{ sectionTitle }}</span>
          </div>
          <div class="au-topbar__actions">
            <a class="au-button au-button--primary au-button--sm" routerLink="/studio/content/new">
              + New content
            </a>
          </div>
        </header>
        <router-outlet></router-outlet>
      </main>
    </div>

    <ng-template #bootState>
      <div class="au-boot">
        <span class="au-spinner" aria-label="Loading"></span>
      </div>
    </ng-template>
  `,
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly appContext = inject(AppContextService);

  readonly primaryNav: NavItem[] = [
    { label: 'Overview', path: '/studio/overview' },
    { label: 'Content', path: '/studio/content' },
    { label: 'Media', path: '/studio/media' },
    { label: 'Publishing', path: '/studio/publishing' },
  ];

  private subscription: Subscription | null = null;

  session: StudioSession | null = null;
  sites: StudioSite[] = [];
  activeSiteId: string | null = null;
  loading = true;
  menuOpen = false;
  sectionTitle = '';

  get activeSiteName(): string {
    return this.sites.find((site) => site.id === this.activeSiteId)?.name ?? 'All sites';
  }

  get initials(): string {
    const label = this.session?.user.displayName?.trim() || this.session?.user.email || 'AU';
    return (
      label
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'AU'
    );
  }

  ngOnInit(): void {
    this.subscription = this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
      )
      .subscribe(() => {
        this.menuOpen = false;
        const snapshot = this.route.snapshot.firstChild;
        this.sectionTitle = snapshot?.data['studioMeta']?.title ?? '';
      });

    void this.bootstrap();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  iconPath(path: string): string {
    switch (path) {
      case '/studio/overview':
        return 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3Z';
      case '/studio/content':
        return 'M7 3h7l4 4v14H7Z M14 3v5h5 M10 12h5 M10 16h5';
      case '/studio/media':
        return 'M3 5h18v14H3Z M3 16l5-5 4 4 3-3 6 6 M8.5 9.5a1 1 0 1 0 0-.01';
      case '/studio/publishing':
        return 'M3 11 21 3l-8 18-2.5-7.5Z';
      default:
        return 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z';
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      const session = await this.appContext.ensureSession();
      this.session = session;
      this.sites = session?.sites ?? [];
      this.activeSiteId = session?.activeSiteId ?? this.sites[0]?.id ?? null;
      this.loading = false;
      this.seo.update({
        title: 'Auctorio',
        description: 'Editorial workspace',
        path: '/studio',
        locale: 'en',
        noIndex: true,
      });
    } catch {
      void this.router.navigate(['/login'], {
        queryParams: { reason: 'session_expired', returnTo: this.router.url },
      });
    }
  }

  async onSiteChange(siteId: string): Promise<void> {
    const session = await this.appContext.switchSite(siteId);
    this.session = session;
    this.sites = session?.sites ?? [];
    this.activeSiteId = session?.activeSiteId ?? null;
  }

  logout(): void {
    void this.appContext.logout().then(() => this.router.navigate(['/login']));
  }
}
