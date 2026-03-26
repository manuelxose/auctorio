import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Subscription, filter, startWith } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { SeoService } from '../services/seo.service';
import { StudioApiService } from '../services/studio-api.service';
import { StudioSessionService } from '../services/studio-session.service';
import type { StudioPermission, StudioSession } from '../models/studio.models';
import {
  STUDIO_NAV_CATEGORIES,
  type StudioMeta,
  type StudioNavCategory,
} from '../studio/studio-navigation';
import { formatApiError } from '../utils/api-error';

@Component({
  selector: 'app-studio-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="console-shell" *ngIf="!loading; else loadingState">
      <button
        *ngIf="menuOpen"
        type="button"
        class="console-sidebar-backdrop"
        (click)="menuOpen = false"
        aria-label="Close navigation"
      ></button>

      <aside class="console-sidebar" [class.is-open]="menuOpen">
        <div class="console-sidebar__scroll">
          <div class="console-brand">
            <div class="console-brand__mark">AU</div>
            <div class="console-brand__stack">
              <p class="console-kicker">Auctorio</p>
              <h1 class="console-brand__title">Editorial Cockpit</h1>
              <p class="console-brand__copy">
                Opera briefs, generación IA, review, assets y publishing multi-site desde un único control plane editorial.
              </p>
              <div class="console-brand__meta">
                <span class="console-tag console-tag--accent">Multi-site studio</span>
                <span class="console-tag console-tag--muted">{{ navItemCount }} surfaces</span>
              </div>
            </div>
          </div>

          <section class="console-workspace-card" *ngIf="session">
            <div class="console-workspace-card__head">
              <div class="console-workspace-card__identity">
                <div class="console-avatar">{{ userInitials }}</div>
                <div>
                  <p class="console-kicker">Workspace</p>
                  <h2>{{ session.tenant.name }}</h2>
                </div>
              </div>
              <span class="console-tag" [ngClass]="tenantStatusClass">{{ session.tenant.status }}</span>
            </div>

            <div class="console-workspace-card__statusline">
              <span>{{ authModeLabel }}</span>
              <span>{{ session.permissions.length }} controls enabled</span>
              <span>{{ session.identityProvider?.enabled ? 'SSO active' : 'Workspace fallback' }}</span>
            </div>

            <div class="console-workspace-card__metrics">
              <article class="console-mini-stat">
                <span>Destinations</span>
                <strong>{{ session.siteCount }}</strong>
              </article>
              <article class="console-mini-stat">
                <span>Projects</span>
                <strong>{{ session.projectCount }}</strong>
              </article>
            </div>

            <div class="console-workspace-card__metrics">
              <article class="console-mini-stat">
                <span>User</span>
                <strong>{{ session.user.displayName }}</strong>
              </article>
              <article class="console-mini-stat">
                <span>Auth</span>
                <strong>
                  {{
                    session.authMode === 'oidc'
                      ? 'SSO'
                      : session.authMode === 'google'
                        ? 'Google'
                        : session.authMode === 'password'
                          ? 'Password'
                          : session.authMode === 'launch'
                            ? 'Launch'
                            : 'API key'
                  }}
                </strong>
              </article>
            </div>
          </section>

          <nav class="console-nav" aria-label="Studio navigation">
            <ng-container *ngFor="let cat of visibleNavCategories">
              <p class="console-nav__category">{{ cat.category }}</p>

              <section class="console-nav__group" *ngFor="let group of cat.groups">
                <p class="console-nav__label">{{ group.label }}</p>

                <a
                  *ngFor="let item of group.items"
                  class="console-nav__item"
                  [routerLink]="item.path"
                  routerLinkActive="is-active"
                  (click)="menuOpen = false"
                >
                  <div class="console-nav__title-wrap">
                    <span class="console-nav__title">{{ item.label }}</span>
                    <span class="console-nav__caption">{{ group.label }}</span>
                  </div>
                  <span class="console-nav__chevron">↗</span>
                </a>
              </section>
            </ng-container>
          </nav>
        </div>

        <div class="console-sidebar__footer">
          <div class="console-action-stack">
            <a class="console-action-card" routerLink="/studio/projects/new" (click)="menuOpen = false">
              <strong>New project</strong>
              <span>Abre un brief nuevo y activa el pipeline editorial</span>
            </a>
            <a class="console-action-card" routerLink="/studio/publishing/history" (click)="menuOpen = false">
              <strong>Publishing history</strong>
              <span>Revisa salidas, sync draft y errores de release</span>
            </a>
          </div>

          <button type="button" class="console-button console-button--secondary console-button--full" (click)="logout()">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main class="console-main">
        <header class="console-topbar">
          <div class="console-topbar__copy">
            <div class="console-topbar__mobile-row">
              <button
                type="button"
                class="console-menu-toggle"
                (click)="menuOpen = !menuOpen"
                [attr.aria-expanded]="menuOpen"
                aria-label="Toggle navigation"
              >
                <span></span>
                <span></span>
                <span></span>
              </button>

              <span class="console-tag console-tag--muted">{{ session?.tenant?.name || 'workspace' }}</span>
            </div>

            <div class="console-topbar__context">
              <span class="console-tag console-tag--accent">{{ currentMeta.section }}</span>
              <span class="console-topbar__divider"></span>
              <span>{{ session?.tenant?.name || 'workspace' }}</span>
            </div>
            <h2 class="console-topbar__title">{{ currentMeta.title }}</h2>
            <div class="console-topbar__meta">
              <span>{{ authModeLabel }}</span>
              <span>{{ session?.permissions?.length || 0 }} controls enabled</span>
              <span>{{ session?.identityProvider?.enabled ? 'SSO enforced' : 'Workspace sign-in fallback' }}</span>
            </div>
          </div>

          <div class="console-topbar__actions">
            <button type="button" class="console-command-button">
              Command palette
              <span>⌘K</span>
            </button>
            <a
              *ngIf="canAccess('prompts.manage')"
              class="console-button console-button--secondary"
              routerLink="/studio/ai/prompts"
            >
              Prompt Library
            </a>
            <a *ngIf="canAccess('projects.manage')" class="console-button" routerLink="/studio/projects/new">
              New project
            </a>
            <div class="console-identity-pill" *ngIf="session">
              <div class="console-identity-pill__avatar">{{ userInitials }}</div>
              <div>
                <strong>{{ session.user.displayName }}</strong>
                <span>{{ session.user.email }}</span>
              </div>
            </div>
          </div>
        </header>

        <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

        <router-outlet></router-outlet>
      </main>
    </div>

    <ng-template #loadingState>
      <div class="console-loading">
        <section class="console-loading__panel">
          <p class="console-kicker">Auctorio</p>
          <h2>Loading workspace...</h2>
          <p>Preparing the editorial cockpit, permissions and workspace context.</p>
          <p class="console-loading__hint" *ngIf="slowLoading">
            This is taking longer than expected. You can retry the current route or return to the
            public login without getting trapped on a blank screen.
          </p>
          <div class="console-inline-actions console-loading__actions" *ngIf="slowLoading">
            <button type="button" class="console-button" (click)="reloadCurrentRoute()">
              Retry loading
            </button>
            <a class="console-button console-button--secondary" [href]="loginHref">
              Back to login
            </a>
          </div>
        </section>
      </div>
    </ng-template>
  `,
})
export class StudioShellComponent implements OnInit, OnDestroy {
  private static readonly defaultMetaDescription =
    'Cockpit editorial de Auctorio para operar generación IA, review, assets y publishing multi-site.';

  private readonly api = inject(StudioApiService);
  private readonly studioSession = inject(StudioSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private subscription: Subscription | null = null;
  private slowLoadingTimer: number | null = null;

  session: StudioSession | null = null;
  loading = true;
  slowLoading = false;
  error = '';
  menuOpen = false;
  visibleNavCategories: StudioNavCategory[] = [];
  currentMeta: StudioMeta = {
    section: 'Dashboard',
    title: 'Overview',
  };

  get userInitials(): string {
    const label = this.session?.user.displayName?.trim() || this.session?.user.email || 'AU';
    return label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'AU';
  }

  get authModeLabel(): string {
    switch (this.session?.authMode) {
      case 'oidc':
        return 'SSO workspace';
      case 'google':
        return 'Google sign-in';
      case 'password':
        return 'Password sign-in';
      case 'launch':
        return 'Launch ticket';
      case 'api_key':
      default:
        return 'API key fallback';
    }
  }

  get navItemCount(): number {
    return this.visibleNavCategories.reduce(
      (total, category) =>
        total + category.groups.reduce((groupTotal, group) => groupTotal + group.items.length, 0),
      0,
    );
  }

  get tenantStatusClass(): string {
    return this.session?.tenant.status === 'active' ? 'console-tag--success' : 'console-tag--warning';
  }

  ngOnInit(): void {
    this.armSlowLoadingTimer();
    this.loadSession();
    this.subscription = this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
      )
      .subscribe(() => {
        this.menuOpen = false;
        this.currentMeta = this.resolveCurrentMeta();
        this.seo.update({
          title: `${this.currentMeta.title} · Studio`,
          description: StudioShellComponent.defaultMetaDescription,
          path: this.router.url.split('?')[0] || '/studio/dashboard',
          locale: 'en',
          noIndex: true,
        });
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.clearSlowLoadingTimer();
  }

  logout(): void {
    this.api.logout().subscribe({
      next: () => {
        this.studioSession.clearSession();
        void this.router.navigateByUrl('/login');
      },
      error: () => {
        this.studioSession.clearSession();
        void this.router.navigateByUrl('/login');
      },
    });
  }

  get loginHref(): string {
    return `/login?entry=public&returnTo=${encodeURIComponent(this.router.url || '/studio/dashboard')}`;
  }

  reloadCurrentRoute(): void {
    if (!this.isBrowser) {
      return;
    }

    window.location.reload();
  }

  private loadSession(): void {
    this.studioSession
      .ensureSession()
      .then((session) => {
        this.session = session;
        this.visibleNavCategories = this.buildNavCategories(session);
        this.loading = false;
        this.slowLoading = false;
        this.clearSlowLoadingTimer();
        this.notifyStudioReady();
      })
      .catch((error) => {
        this.visibleNavCategories = [];
        this.loading = false;
        this.slowLoading = false;
        this.clearSlowLoadingTimer();
        this.error = formatApiError(error);
        this.notifyStudioReady();
        void this.router.navigateByUrl('/login');
      });
  }

  private armSlowLoadingTimer(): void {
    if (!this.isBrowser) {
      return;
    }

    this.clearSlowLoadingTimer();
    this.slowLoadingTimer = window.setTimeout(() => {
      if (this.loading) {
        this.slowLoading = true;
      }
    }, 4000);
  }

  private clearSlowLoadingTimer(): void {
    if (!this.slowLoadingTimer) {
      return;
    }
    window.clearTimeout(this.slowLoadingTimer);
    this.slowLoadingTimer = null;
  }

  private notifyStudioReady(): void {
    if (!this.isBrowser) {
      return;
    }

    window.dispatchEvent(new Event('auctorio:studio-ready'));
  }

  private resolveCurrentMeta(): StudioMeta {
    let current = this.route.firstChild;

    while (current?.firstChild) {
      current = current.firstChild;
    }

    return (
      (current?.snapshot.data['studioMeta'] as StudioMeta | undefined) ?? this.currentMeta
    );
  }

  private buildNavCategories(session: StudioSession | null): StudioNavCategory[] {
    if (!session) {
      return [];
    }

    const permissions = new Set(session.permissions);
    return STUDIO_NAV_CATEGORIES.map((category) => ({
      ...category,
      groups: category.groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => !item.requiredPermission || permissions.has(item.requiredPermission),
          ),
        }))
        .filter((group) => group.items.length > 0),
    })).filter((category) => category.groups.length > 0);
  }

  canAccess(permission: StudioPermission): boolean {
    return this.session?.permissions.includes(permission) ?? false;
  }
}
