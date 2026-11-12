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
import { STUDIO_NAV, activeNavItem } from './studio-nav';
import type { StudioNotification, StudioSession, StudioSite } from '../models/studio.models';

const COLLAPSE_KEY = 'auctorio.studio.sidebar.collapsed';
const GROUPS_KEY = 'auctorio.studio.sidebar.closedGroups';
const COPILOT_KEY = 'auctorio.studio.copilot.open';

/**
 * Studio frame: global top bar (Navigation A), grouped left sidebar
 * (Navigation B, collapsible, drawer on phones) and the copilot panel docked
 * on the right. Pages render in the router outlet between them.
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
      [class.is-copilot-wide]="copilot.wide()"
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

        <nav class="au-crumbs" aria-label="Location">
          <span class="au-crumbs__group">{{ location().group }}</span>
          <app-icon name="chevron-right"></app-icon>
          <span class="au-crumbs__page" aria-current="page">{{ location().title }}</span>
        </nav>

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
            <button
              class="au-split__caret"
              type="button"
              #createTrigger
              (click)="createMenu.toggle(createTrigger)"
              [attr.aria-expanded]="createMenu.isOpen()"
              aria-haspopup="menu"
              aria-label="More creation options"
            >
              <app-icon name="chevron-down"></app-icon>
            </button>
          </div>
          <app-popover #createMenu>
            <div class="au-menu">
              <a class="au-menu__item" routerLink="/studio/content/new" (click)="createMenu.hide()"><app-icon name="plus"></app-icon>New article</a>
              <a class="au-menu__item" routerLink="/studio/editorial-plan" (click)="createMenu.hide()"><app-icon name="plan"></app-icon>Generate editorial plan</a>
              <a class="au-menu__item" routerLink="/studio/sources" (click)="createMenu.hide()"><app-icon name="sources"></app-icon>Add source</a>
              <a class="au-menu__item" routerLink="/studio/connections/wizard" (click)="createMenu.hide()"><app-icon name="plug"></app-icon>Connect a site or account</a>
            </div>
          </app-popover>

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

      <!-- Navigation B: sidebar -->
      <aside id="studio-sidebar" class="au-sb" aria-label="Studio navigation" (keydown)="onSidebarKey($event)">
        <button
          #copilotLauncher
          class="au-sb__item au-sb__copilot"
          type="button"
          (click)="toggleCopilot()"
          [class.is-active]="copilot.open()"
          [attr.aria-pressed]="copilot.open()"
          aria-controls="studio-copilot"
          data-tip="Copilot"
        >
          <app-icon name="message"></app-icon>
          <span class="au-sb__label">Copilot</span>
          <kbd class="au-kbd au-sb__label">{{ copilotShortcut }}</kbd>
        </button>

        <nav class="au-sb__nav">
          <section class="au-sb__group" *ngFor="let group of nav">
            <button
              class="au-sb__heading"
              type="button"
              (click)="toggleGroup(group.id)"
              [attr.aria-expanded]="!closedGroups().has(group.id)"
              [attr.aria-controls]="'sb-' + group.id"
            >
              <span>{{ group.label }}</span>
              <app-icon [name]="closedGroups().has(group.id) ? 'chevron-right' : 'chevron-down'"></app-icon>
            </button>
            <ul [id]="'sb-' + group.id" class="au-sb__list" [hidden]="closedGroups().has(group.id) && !collapsed()">
              <li *ngFor="let item of group.items">
                <a
                  class="au-sb__item"
                  [routerLink]="item.path"
                  routerLinkActive="is-active"
                  [routerLinkActiveOptions]="{ exact: false }"
                  ariaCurrentWhenActive="page"
                  [attr.data-tip]="item.label"
                  [attr.aria-label]="collapsed() ? item.label : null"
                >
                  <app-icon [name]="item.icon"></app-icon>
                  <span class="au-sb__label">{{ item.label }}</span>
                </a>
              </li>
            </ul>
          </section>
        </nav>
      </aside>

      @if (drawerOpen()) {
        <div class="au-backdrop" (click)="closeDrawer()"></div>
      }

      <main id="studio-main" class="au-main" tabindex="-1">
        <div class="au-content">
          <router-outlet></router-outlet>
        </div>
      </main>

      @if (copilot.open()) {
        <div class="au-backdrop au-backdrop--copilot" (click)="toggleCopilot(false)"></div>
      }
      <aside id="studio-copilot" class="au-copilot" [hidden]="!copilot.open()" aria-label="Copilot">
        <app-copilot-panel #panel (closed)="toggleCopilot(false)"></app-copilot-panel>
      </aside>

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
  readonly closedGroups = signal<Set<string>>(new Set());
  readonly location = signal<{ group: string; title: string }>({ group: 'Workspace', title: 'Overview' });

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
    this.collapsed.set(stored === null ? window.matchMedia('(max-width: 1199px)').matches : stored === '1');
    try {
      this.closedGroups.set(new Set(JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]') as string[]));
    } catch {
      this.closedGroups.set(new Set());
    }
    this.phoneQuery = window.matchMedia('(max-width: 860px)');
    this.isPhone.set(this.phoneQuery.matches);
    this.phoneQuery.addEventListener('change', this.onPhoneChange);
    if (localStorage.getItem(COPILOT_KEY) === '1' && window.matchMedia('(min-width: 1200px)').matches) {
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

  toggleGroup(id: string): void {
    if (this.collapsed() && !this.isPhone()) return;
    const next = new Set(this.closedGroups());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.closedGroups.set(next);
    localStorage.setItem(GROUPS_KEY, JSON.stringify([...next]));
  }

  toggleCopilot(force?: boolean): void {
    const wasOpen = this.copilot.open();
    this.copilot.toggle(force);
    this.drawerOpen.set(false);
    if (isPlatformBrowser(this.platformId)) localStorage.setItem(COPILOT_KEY, this.copilot.open() ? '1' : '0');
    if (this.copilot.open() && !wasOpen) this.panel?.focusInput();
    // On phones the launcher sits in the closed drawer, so focus returns to the menu button.
    if (!this.copilot.open() && wasOpen) (this.isPhone() ? this.navToggle : this.copilotLauncher)?.nativeElement.focus();
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
      else if (this.copilot.open() && !document.querySelector('.au-pop')) this.toggleCopilot(false);
    }
  }

  /** Arrow keys move between sidebar entries; Home/End jump to the ends. */
  onSidebarKey(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(document.querySelectorAll<HTMLElement>('#studio-sidebar .au-sb__item')).filter((el) => el.offsetParent !== null);
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
