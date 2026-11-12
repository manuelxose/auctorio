import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, PLATFORM_ID, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, filter, startWith } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { SeoService } from '../services/seo.service';
import { ThemeService } from '../services/theme.service';
import { StudioApiService } from '../services/studio-api.service';
import { SseService } from '../services/sse.service';
import { CopilotService } from '../services/copilot.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppPopoverComponent } from '../components/ui/app-popover.component';
import { CopilotPanelComponent } from '../components/copilot/copilot-panel.component';
import { CommandPaletteComponent } from './command-palette.component';
import { STUDIO_NAV, activeNavItem, type StudioNavGroup } from './studio-nav';
import type { StudioNotification, StudioSession, StudioSite } from '../models/studio.models';

const COLLAPSE_KEY = 'auctorio.studio.sidebar.collapsed';
const COPILOT_KEY = 'auctorio.studio.copilot.open';

/**
 * Studio frame: global top bar, horizontal primary nav (areas) and a contextual
 * left sidebar (the selected area's tools plus the assistant; a drawer on
 * phones). Pages render in the router outlet beside the sidebar.
 */
@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, AppIconComponent, AppPopoverComponent, CopilotPanelComponent, CommandPaletteComponent],
  template: `
    <div
      class="au-app au-shell"
      *ngIf="!loading; else bootState"
      [class.is-collapsed]="collapsed()"
      [class.has-copilot]="copilot.open()"
      [class.is-drawer-open]="drawerOpen()"
    >
      <a class="au-skip" href="#studio-main">Skip to content</a>

      <!-- Navigation A: global top bar -->
      <header class="au-top">
        <button
          #navToggle
          class="au-icon-button"
          type="button"
          (click)="toggleNav()"
          [attr.aria-expanded]="isPhone() ? drawerOpen() : !collapsed()"
          aria-controls="studio-sidebar"
          [attr.aria-label]="isPhone() ? 'Open navigation' : collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
        >
          <app-icon [name]="isPhone() ? 'menu' : 'panel-left'"></app-icon>
        </button>

        <a class="au-top__brand" routerLink="/studio/overview" aria-label="Auctorio, overview">
          <img src="/logo.svg" alt="" width="24" height="24" />
          <span>Auctorio</span>
        </a>

        <button
          class="au-top__site"
          type="button"
          #siteTrigger
          (click)="siteMenu.toggle(siteTrigger)"
          [attr.aria-expanded]="siteMenu.isOpen()"
          aria-haspopup="menu"
          [attr.aria-label]="'Site: ' + activeSiteName + '. Switch site'"
        >
          <span class="au-top__site-mark" aria-hidden="true">{{ siteInitials }}</span>
          <span class="au-top__site-name">{{ activeSiteName }}</span>
          <app-icon name="chevron-down"></app-icon>
        </button>
        <app-popover #siteMenu>
          <div class="au-menu" role="menu">
            <div class="au-menu__label">{{ session?.user?.displayName }} · {{ session?.role }}</div>
            <button
              class="au-menu__item"
              type="button"
              role="menuitemradio"
              *ngFor="let site of sites"
              [attr.aria-checked]="site.id === activeSiteId"
              [class.is-active]="site.id === activeSiteId"
              (click)="selectSite(site.id, siteMenu)"
            >
              <span class="au-top__site-mark" aria-hidden="true">{{ siteInitialsOf(site) }}</span>
              {{ site.name }}
              <span class="au-menu__meta">{{ site.role }}</span>
            </button>
            <div class="au-menu__sep"></div>
            <a class="au-menu__item" role="menuitem" routerLink="/studio/settings/sites" (click)="siteMenu.hide()">
              <app-icon name="settings"></app-icon>
              Manage sites
            </a>
          </div>
        </app-popover>

        <button class="au-top__search" type="button" (click)="openPalette()" aria-label="Search and go to (Ctrl+K)">
          <app-icon name="search"></app-icon>
          <span>Search</span>
          <kbd class="au-kbd">{{ shortcut }}</kbd>
        </button>

        <div class="au-top__actions">
          <a
            class="au-icon-button au-top__jobs"
            routerLink="/studio/activity"
            [attr.aria-label]="jobsLabel"
            [title]="jobsLabel"
          >
            <app-icon name="activity"></app-icon>
            <span class="au-top__count" *ngIf="activeJobs > 0" aria-hidden="true">{{ activeJobs > 99 ? '99+' : activeJobs }}</span>
            <span class="au-top__flag" *ngIf="failedJobs > 0 && activeJobs === 0" aria-hidden="true"></span>
          </a>
          <button
            class="au-icon-button au-top__jobs"
            type="button"
            #bellTrigger
            (click)="refreshNotificationSummary(); bellMenu.toggle(bellTrigger)"
            [attr.aria-expanded]="bellMenu.isOpen()"
            aria-haspopup="menu"
            [attr.aria-label]="unreadCount ? 'Notifications, ' + unreadCount + ' unread' : 'Notifications'"
            title="Notifications"
          >
            <app-icon name="bell"></app-icon>
            <span class="au-top__count" *ngIf="unreadCount > 0" aria-hidden="true">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
          </button>
          <app-popover #bellMenu>
            <div class="au-menu au-menu--wide" aria-label="Notifications preview">
              <div class="au-menu__label au-menu__label--split">
                Notifications
                <a class="au-link au-link--sm" routerLink="/studio/notifications" (click)="bellMenu.hide()">View all</a>
              </div>
              <button
                class="au-menu__item"
                type="button"
                *ngFor="let item of notificationPreview"
                [class.au-menu__item--unread]="!item.readAt"
                [routerLink]="notificationPath(item)"
                [queryParams]="notificationQuery(item)"
                (click)="openNotification(item, bellMenu)"
              >
                <span class="au-menu__item-text">
                  <span class="au-menu__item-title">{{ item.title }}</span>
                  <span class="au-menu__item-meta">{{ item.createdAt | date: 'short' }}</span>
                </span>
              </button>
              <div class="au-menu__empty" *ngIf="notificationPreview.length === 0">No notifications yet</div>
            </div>
          </app-popover>

          <div class="au-split">
            <a class="au-btn au-btn--primary" routerLink="/studio/content/new">
              <app-icon name="plus"></app-icon>
              <span class="au-split__label">New content</span>
            </a>
          </div>

          <div class="au-user" *ngIf="session">
            <button
              class="au-user__btn"
              type="button"
              #userTrigger
              (click)="userMenu.toggle(userTrigger)"
              [attr.aria-expanded]="userMenu.isOpen()"
              aria-haspopup="menu"
              [attr.aria-label]="'Account: ' + session.user.displayName"
            >
              <span class="au-avatar">{{ initials }}</span>
            </button>
            <app-popover #userMenu>
              <div class="au-menu">
                <div class="au-menu__label au-truncate">{{ session.user.displayName }} · {{ session.role }}</div>
                <div class="au-menu__label au-menu__label--plain au-truncate">{{ session.user.email }}</div>
                <a class="au-menu__item" routerLink="/studio/settings/profile" (click)="userMenu.hide()"><app-icon name="user"></app-icon>Profile</a>
                <a class="au-menu__item" routerLink="/studio/settings/sites" (click)="userMenu.hide()"><app-icon name="settings"></app-icon>Settings</a>
                <button class="au-menu__item" type="button" (click)="cycleTheme()">
                  <app-icon [name]="themeIcon"></app-icon>
                  Appearance
                  <span class="au-menu__meta">{{ themeLabel }}</span>
                </button>
                <div class="au-menu__sep"></div>
                <button class="au-menu__item is-danger" type="button" (click)="logout()"><app-icon name="logout"></app-icon>Log out</button>
              </div>
            </app-popover>
          </div>
        </div>
      </header>

      <!-- Primary navigation: areas -->
      <nav class="au-areas" aria-label="Areas">
        <ul class="au-areas__list">
          <li *ngFor="let area of nav">
            <a
              class="au-areas__item"
              [routerLink]="area.items[0].path"
              [class.is-active]="area.id === activeArea().id"
              [attr.aria-current]="area.id === activeArea().id ? 'page' : null"
            >
              <app-icon [name]="area.icon"></app-icon>
              <span>{{ area.label }}</span>
            </a>
          </li>
        </ul>
      </nav>

      <!-- Contextual sidebar: the area's tools, then the assistant -->
      <aside id="studio-sidebar" class="au-sb" aria-label="Studio sidebar" (keydown)="onSidebarKey($event)">
        <nav class="au-sb__nav" [attr.aria-label]="activeArea().label + ' tools'">
          <p class="au-sb__heading">{{ activeArea().label }}</p>
          <ul class="au-sb__list">
            <li *ngFor="let item of activeArea().items">
              <a class="au-sb__item" [routerLink]="item.path" routerLinkActive="is-active" ariaCurrentWhenActive="page">
                <app-icon [name]="item.icon"></app-icon>
                <span class="au-sb__label">{{ item.label }}</span>
              </a>
            </li>
          </ul>
        </nav>

        @if (copilot.open()) {
          <section id="studio-copilot" class="au-sb__assistant" aria-label="Assistant">
            <app-copilot-panel #panel (closed)="toggleCopilot(false)"></app-copilot-panel>
          </section>
        } @else {
          <button #copilotLauncher class="au-sb__item au-sb__copilot" type="button" (click)="toggleCopilot(true)" aria-controls="studio-copilot" aria-expanded="false">
            <app-icon name="message"></app-icon>
            <span class="au-sb__label">Assistant</span>
            <kbd class="au-kbd">{{ copilotShortcut }}</kbd>
          </button>
        }
      </aside>

      @if (drawerOpen()) {
        <div class="au-backdrop" (click)="closeDrawer()"></div>
      }

      <main id="studio-main" class="au-main" tabindex="-1">
        <div class="au-content">
          <router-outlet></router-outlet>
        </div>
      </main>

      @if (paletteOpen()) {
        <app-command-palette #palette (closed)="closePalette()"></app-command-palette>
      }
    </div>

    <ng-template #bootState>
      <div class="au-app au-boot">
        <span class="au-spinner" aria-label="Loading"></span>
      </div>
    </ng-template>
  `,
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly appContext = inject(AppContextService);
  private readonly themeService = inject(ThemeService);
  private readonly api = inject(StudioApiService);
  private readonly sse = inject(SseService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly copilot = inject(CopilotService);

  readonly nav = STUDIO_NAV;

  @ViewChild('navToggle') private navToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('copilotLauncher') private copilotLauncher?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private panel?: CopilotPanelComponent;
  @ViewChild('palette') private set paletteRef(palette: CommandPaletteComponent | undefined) {
    if (!palette) return;
    palette.actions.set([
      { id: 'copilot', label: 'Open copilot', group: 'Action', icon: 'message', run: () => this.toggleCopilot(true) },
      { id: 'new-content', label: 'New article', group: 'Action', icon: 'plus', run: () => void this.router.navigateByUrl('/studio/content/new') },
      { id: 'connect', label: 'Connect a site or account', group: 'Action', icon: 'plug', run: () => void this.router.navigateByUrl('/studio/connections/wizard') },
      { id: 'theme', label: 'Switch appearance', group: 'Action', icon: 'sun', run: () => this.cycleTheme() },
      ...this.sites.map((site) => ({ id: 'site-' + site.id, label: 'Switch to ' + site.name, group: 'Site', icon: 'globe' as const, run: () => void this.selectSite(site.id) })),
    ]);
    palette.focus();
  }

  private subscription: Subscription | null = null;
  private sseUnsubscribe: (() => void) | null = null;
  private sseSubscription: Subscription | null = null;
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;
  private notificationFallbackTimer: ReturnType<typeof setInterval> | null = null;
  private phoneQuery: MediaQueryList | null = null;
  private paletteReturnFocus: HTMLElement | null = null;

  session: StudioSession | null = null;
  sites: StudioSite[] = [];
  activeSiteId: string | null = null;
  loading = true;
  unreadCount = 0;
  notificationPreview: StudioNotification[] = [];
  activeJobs = 0;
  failedJobs = 0;

  /** User preference wins; without one, the sidebar starts collapsed below 1200px. */
  readonly collapsed = signal(false);
  readonly drawerOpen = signal(false);
  readonly isPhone = signal(false);
  readonly paletteOpen = signal(false);
  readonly location = signal<{ group: string; title: string }>({ group: 'Workspace', title: 'Overview' });
  /** Area of the current route; routes outside the nav (settings) keep the last one. */
  readonly activeArea = signal<StudioNavGroup>(STUDIO_NAV[0]);

  readonly shortcut = this.isMac() ? '⌘K' : 'Ctrl K';
  readonly copilotShortcut = this.isMac() ? '⌘J' : 'Ctrl J';

  get activeSiteName(): string {
    return this.sites.find((site) => site.id === this.activeSiteId)?.name ?? 'All sites';
  }

  get siteInitials(): string {
    return this.initialsOf(this.activeSiteName);
  }

  get initials(): string {
    const label = this.session?.user.displayName?.trim() || this.session?.user.email || 'AU';
    return this.initialsOf(label) || 'AU';
  }

  get jobsLabel(): string {
    if (this.activeJobs) return `Background activity, ${this.activeJobs} running`;
    if (this.failedJobs) return `Background activity, ${this.failedJobs} failed`;
    return 'Background activity';
  }

  get themeIcon(): 'sun' | 'moon' | 'monitor' {
    const preference = this.themeService.preference();
    return preference === 'light' ? 'sun' : preference === 'dark' ? 'moon' : 'monitor';
  }

  get themeLabel(): string {
    const preference = this.themeService.preference();
    return preference === 'light' ? 'Light' : preference === 'dark' ? 'Dark' : 'System';
  }

  ngOnInit(): void {
    this.restoreLayout();
    this.subscription = this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
      )
      .subscribe(() => {
        this.drawerOpen.set(false);
        this.location.set(this.resolveLocation());
        const match = activeNavItem(this.router.url.split(/[?#]/)[0]);
        if (match) this.activeArea.set(match.group);
      });

    void this.bootstrap();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.sseUnsubscribe?.();
    this.sseSubscription?.unsubscribe();
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    if (this.notificationFallbackTimer) clearInterval(this.notificationFallbackTimer);
    this.phoneQuery?.removeEventListener('change', this.onPhoneChange);
  }

  // ── Layout state ──────────────────────────────────────────────────────

  private restoreLayout(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const stored = localStorage.getItem(COLLAPSE_KEY);
    this.collapsed.set(stored === '1');
    this.phoneQuery = window.matchMedia('(max-width: 860px)');
    this.isPhone.set(this.phoneQuery.matches);
    this.phoneQuery.addEventListener('change', this.onPhoneChange);
    if (localStorage.getItem(COPILOT_KEY) !== '0' && window.matchMedia('(min-width: 861px)').matches) {
      this.copilot.toggle(true);
    }
  }

  private readonly onPhoneChange = (event: MediaQueryListEvent) => {
    this.isPhone.set(event.matches);
    this.drawerOpen.set(false);
  };

  toggleNav(): void {
    if (this.isPhone()) {
      this.drawerOpen.set(!this.drawerOpen());
      if (this.drawerOpen()) setTimeout(() => (document.querySelector('#studio-sidebar .au-sb__item') as HTMLElement | null)?.focus());
      return;
    }
    this.collapsed.set(!this.collapsed());
    localStorage.setItem(COLLAPSE_KEY, this.collapsed() ? '1' : '0');
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.navToggle?.nativeElement.focus();
  }

  toggleCopilot(force?: boolean): void {
    const wasOpen = this.copilot.open();
    this.copilot.toggle(force);
    if (isPlatformBrowser(this.platformId)) localStorage.setItem(COPILOT_KEY, this.copilot.open() ? '1' : '0');
    if (this.copilot.open() && !wasOpen) {
      this.collapsed.set(false);
      if (this.isPhone()) this.drawerOpen.set(true);
      setTimeout(() => this.panel?.focusInput());
    }
    if (!this.copilot.open() && wasOpen) setTimeout(() => this.copilotLauncher?.nativeElement.focus());
  }

  openPalette(): void {
    this.paletteReturnFocus = document.activeElement as HTMLElement | null;
    this.paletteOpen.set(true);
  }

  closePalette(): void {
    this.paletteOpen.set(false);
    this.paletteReturnFocus?.focus();
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKey(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.paletteOpen()) this.closePalette();
      else this.openPalette();
    } else if (mod && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      this.toggleCopilot();
    } else if (event.key === 'Escape' && !this.paletteOpen()) {
      if (this.drawerOpen()) this.closeDrawer();
    }
  }

  /** Arrow keys move between sidebar entries; Home/End jump to the ends. */
  onSidebarKey(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || (event.target as HTMLElement).closest('.au-sb__assistant')) return;
    const items = Array.from(document.querySelectorAll<HTMLElement>('#studio-sidebar .au-sb__nav .au-sb__item')).filter((el) => el.offsetParent !== null);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  private resolveLocation(): { group: string; title: string } {
    let snapshot: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    let title: string | undefined;
    while (snapshot) {
      title = (snapshot.data?.['studioMeta'] as { title?: string } | undefined)?.title ?? title;
      snapshot = snapshot.firstChild;
    }
    const url = this.router.url.split(/[?#]/)[0];
    const match = activeNavItem(url);
    return { group: match?.group.label ?? 'Studio', title: title ?? match?.item.label ?? 'Studio' };
  }

  private isMac(): boolean {
    return isPlatformBrowser(this.platformId) && /Mac|iPhone|iPad/.test(navigator.platform);
  }

  // ── Live counters ─────────────────────────────────────────────────────

  private watchLiveUpdates(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.sseUnsubscribe = this.sse.subscribe((event) => {
      if (event.type === 'notification.created' || event.type === 'notification.read') {
        this.refreshNotificationSummary();
      }
      if (event.type.startsWith('operation.') || event.type.startsWith('job.')) {
        this.refreshJobs();
      }
    });
    this.sseSubscription = this.sse.connection$.subscribe();
    this.refreshNotificationSummary();
    this.refreshJobs();
    // Fallback heartbeat keeps the counters accurate even when SSE is unavailable.
    this.notificationFallbackTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.refreshNotificationSummary();
        this.refreshJobs();
      }
    }, 45_000);
  }

  private refreshJobs(): void {
    this.api.listOperations({ page: 1, pageSize: 1 }).subscribe({
      next: (response) => {
        const counts = response.counts ?? {};
        this.activeJobs = (counts['running'] ?? 0) + (counts['queued'] ?? 0) + (counts['retrying'] ?? 0);
        this.failedJobs = counts['failed'] ?? 0;
      },
      error: () => undefined,
    });
  }

  refreshNotificationSummary(): void {
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    this.notificationTimer = setTimeout(() => {
      this.api.listNotifications({ page: 1, pageSize: 10 }).subscribe({
        next: (response) => {
          this.unreadCount = response.unread;
          this.notificationPreview = response.items;
        },
        error: () => undefined,
      });
    }, 250);
  }

  openNotification(item: StudioNotification, popover: AppPopoverComponent): void {
    popover.hide();
    if (!item.readAt) {
      this.api.markNotificationRead(item.id, true).subscribe({
        next: () => {
          this.unreadCount = Math.max(0, this.unreadCount - 1);
          this.notificationPreview = this.notificationPreview.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
        },
        error: () => undefined,
      });
    }
  }

  /** Router-safe path for a notification action URL (query string split off). */
  notificationPath(item: StudioNotification): string {
    const raw = item.actionUrl || '/studio/notifications';
    const path = raw.split('?')[0] || '/studio/notifications';
    return path.startsWith('/studio/') ? path : '/studio/notifications';
  }

  /** Query parameters so routerLink never URL-encodes them into the path. */
  notificationQuery(item: StudioNotification): Record<string, string> {
    const raw = item.actionUrl || '';
    const queryIndex = raw.indexOf('?');
    if (queryIndex < 0) return {};
    const params: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(raw.slice(queryIndex + 1))) {
      params[key] = value;
    }
    return params;
  }

  siteInitialsOf(site: StudioSite): string {
    return this.initialsOf(site.name);
  }

  private initialsOf(name: string): string {
    return (
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'AU'
    );
  }

  private async bootstrap(): Promise<void> {
    // The session lives in the browser; a server render shows the boot spinner only.
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const session = await this.appContext.ensureSession();
      this.session = session;
      this.sites = session?.sites ?? [];
      this.activeSiteId = session?.activeSiteId ?? this.sites[0]?.id ?? null;
      this.loading = false;
      this.watchLiveUpdates();
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
    } finally {
      this.dismissBootOverlay();
    }
  }

  private dismissBootOverlay(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.body.classList.remove('studio-boot-pending');
    window.dispatchEvent(new Event('auctorio:studio-ready'));
  }

  async selectSite(siteId: string, menu?: AppPopoverComponent): Promise<void> {
    menu?.hide();
    if (siteId === this.activeSiteId) return;
    const session = await this.appContext.switchSite(siteId);
    this.session = session;
    this.sites = session?.sites ?? [];
    this.activeSiteId = session?.activeSiteId ?? null;
  }

  cycleTheme(): void {
    this.themeService.cycle();
  }

  logout(): void {
    void this.appContext.logout().then(() => this.router.navigate(['/login']));
  }
}
