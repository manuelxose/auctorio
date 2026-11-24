import { CommonModule, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { SseService } from '../services/sse.service';
import { AppIconComponent, type StudioIconName } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { NotificationPreference, NotificationSeverity, StudioNotification } from '../models/studio.models';

registerLocaleData(localeEs);

const CATEGORY_TABS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Todas las categorías' },
  { id: 'system', label: 'Sistema' },
  { id: 'publication', label: 'Publicaciones' },
  { id: 'connection', label: 'Conexiones' },
  { id: 'generation', label: 'Generación' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'automation', label: 'Automatización' },
];

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.css',
})
export class NotificationsPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly toast = inject(ToastService);
  private readonly sse = inject(SseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private sseUnsubscribe: (() => void) | null = null;
  private sseSubscription: Subscription | null = null;
  private listRequest?: Subscription;
  private categorySubscription?: Subscription;

  readonly tabs = CATEGORY_TABS;
  readonly severity: Record<NotificationSeverity, {label: string; icon: StudioIconName}> = {
    info: {label: 'Información', icon: 'info'},
    success: {label: 'Completado', icon: 'circle-check'},
    warning: {label: 'Aviso', icon: 'warning'},
    error: {label: 'Error', icon: 'circle-x'},
  };
  readonly savingPreferences = new Set<string>();
  preferencesLoading = true;
  preferencesError = false;
  markingAll = false;
  hasLoaded = false;
  activeCategory = 'all';
  unreadOnly = false;
  archived = false;
  page = 1;
  pageSize = 50;
  total = 0;
  unread = 0;
  counts: Record<string, number> = {};
  items: StudioNotification[] = [];
  preferences: NotificationPreference[] = [];
  loading = true;
  loadError = '';

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  ngOnInit(): void {
    this.categorySubscription = this.route.queryParamMap.subscribe((params) => {
      const category = params.get('category');
      this.activeCategory = this.tabs.find((tab) => tab.id === category)?.id ?? 'all';
      this.page = 1;
      this.load();
    });
    this.loadPreferences();
    this.sseUnsubscribe = this.sse.subscribe((event) => {
      if (event.type === 'notification.created' || event.type === 'notification.read') {
        this.refreshSilently();
      }
    });
    this.sseSubscription = this.sse.connection$.subscribe();
  }

  ngOnDestroy(): void {
    this.sseUnsubscribe?.();
    this.sseSubscription?.unsubscribe();
    this.categorySubscription?.unsubscribe();
    this.listRequest?.unsubscribe();
  }

  load(silent = false): void {
    this.listRequest?.unsubscribe();
    if (!silent) {
      this.loading = true;
      this.loadError = '';
    }
    this.listRequest = this.api.listNotifications({
      page: this.page,
      pageSize: this.pageSize,
      unreadOnly: this.unreadOnly,
      category: this.activeCategory,
      archived: this.archived,
    }).subscribe({
      next: (response) => {
        this.items = response.items;
        this.total = response.total;
        this.unread = response.unread;
        this.counts = response.counts;
        this.loading = false;
        this.hasLoaded = true;
        this.loadError = '';
        if (this.page > this.totalPages) this.goPage(this.totalPages);
      },
      error: () => {
        this.loading = false;
        if (!silent) this.loadError = 'No se pudieron cargar las notificaciones.';
      },
    });
  }

  private refreshSilently(): void {
    this.load(!this.loading && !this.loadError);
  }

  loadPreferences(): void {
    this.preferencesLoading = true;
    this.preferencesError = false;
    this.api.getNotificationPreferences().subscribe({
      next: (response) => {
        this.preferences = response.preferences;
        this.preferencesLoading = false;
      },
      error: () => {
        this.preferencesError = true;
        this.preferencesLoading = false;
      },
    });
  }

  selectCategory(category: string): void {
    if (category === this.activeCategory) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: category === 'all' ? null : category },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  showUnread(): void {
    if (this.activeCategory === 'all') {
      this.setUnreadOnly(true);
    } else {
      this.unreadOnly = true;
      this.archived = false;
      this.selectCategory('all');
    }
  }

  setUnreadOnly(value: boolean): void {
    if (!this.archived && this.unreadOnly === value) return;
    this.unreadOnly = value;
    this.archived = false;
    this.page = 1;
    this.load();
  }

  setArchived(value: boolean): void {
    if (this.archived === value) return;
    this.archived = value;
    this.unreadOnly = false;
    this.page = 1;
    this.load();
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  toggleRead(item: StudioNotification): void {
    this.api.markNotificationRead(item.id, !item.readAt).subscribe({
      next: () => this.refreshSilently(),
      error: () => this.toast.error('No se pudo actualizar la notificación.'),
    });
  }

  /** Opening the action marks the notification read so it leaves the unread view. */
  openAction(item: StudioNotification): void {
    if (!item.readAt) {
      this.api.markNotificationRead(item.id, true).subscribe({
        next: () => this.refreshSilently(),
        error: () => undefined,
      });
    }
  }

  toggleArchive(item: StudioNotification): void {
    this.api.archiveNotification(item.id, !item.archivedAt).subscribe({
      next: () => this.refreshSilently(),
      error: () => this.toast.error('No se pudo cambiar el estado de archivo.'),
    });
  }

  markAll(): void {
    this.markingAll = true;
    this.api.markAllNotificationsRead(this.activeCategory === 'all' ? undefined : this.activeCategory).subscribe({
      next: () => {
        this.markingAll = false;
        this.toast.success('Notificaciones marcadas como leídas.');
        this.refreshSilently();
      },
      error: () => {
        this.markingAll = false;
        this.toast.error('No se pudieron marcar las notificaciones como leídas.');
      },
    });
  }

  togglePreference(preference: NotificationPreference, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.savingPreferences.add(preference.category);
    this.api.setNotificationPreference(preference.category, input.checked).subscribe({
      next: (updated) => {
        this.preferences = this.preferences.map((entry) => (entry.category === updated.category ? updated : entry));
        this.savingPreferences.delete(preference.category);
      },
      error: () => {
        input.checked = preference.enabled;
        this.savingPreferences.delete(preference.category);
        this.toast.error('No se pudo guardar la preferencia.');
      },
    });
  }

  categoryLabel(category: string): string {
    const tab = this.tabs.find((entry) => entry.id === category);
    return tab?.label ?? (category === 'operations' ? 'Operaciones' : category);
  }

  actionLabel(category: string): string {
    switch (category) {
      case 'publication': return 'Ver publicaciones';
      case 'connection': return 'Ver conexiones';
      case 'automation': return 'Ver automatización';
      case 'editorial': return 'Ver plan editorial';
      default: return 'Ver detalle';
    }
  }

  /** Router-safe path portion of an action URL (query string split off). */
  linkPath(actionUrl: string): string {
    const path = actionUrl.split('?')[0] || '/studio/notifications';
    return path.startsWith('/studio/') ? path : '/studio/notifications';
  }

  /** Query parameters extracted from an action URL so routerLink does not URL-encode them. */
  linkQuery(actionUrl: string): Record<string, string> {
    const queryIndex = actionUrl.indexOf('?');
    if (queryIndex < 0) {
      return {};
    }
    const params: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(actionUrl.slice(queryIndex + 1))) {
      params[key] = value;
    }
    return params;
  }
}
