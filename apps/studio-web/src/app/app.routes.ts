import { Routes } from '@angular/router';
import { studioAuthGuard, studioRoleGuard } from './guards/studio-guards';

/**
 * Simplified product routes. Old editorial surface routes redirect to the
 * equivalent new destinations.
 */
export const routes: Routes = [
  // ── Auth ────────────────────────────────────────────────────────────
  { path: 'login', loadComponent: () => import('./pages/login-page.component').then((m) => m.LoginPageComponent) },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/forgot-password-page.component').then((m) => m.ForgotPasswordPageComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset-password-page.component').then((m) => m.ResetPasswordPageComponent),
  },
  {
    path: 'accept-invite',
    loadComponent: () => import('./pages/accept-invite-page.component').then((m) => m.AcceptInvitePageComponent),
  },

  // ── Studio ──────────────────────────────────────────────────────────
  {
    path: 'studio',
    loadComponent: () => import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    canActivate: [studioAuthGuard],
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        loadComponent: () => import('./pages/overview-page.component').then((m) => m.OverviewPageComponent),
        data: { studioMeta: { section: 'Overview', title: 'Overview' } },
      },
      {
        path: 'content',
        loadComponent: () => import('./pages/content-list-page.component').then((m) => m.ContentListPageComponent),
        data: { studioMeta: { section: 'Content', title: 'Content' } },
      },
      {
        path: 'content/new',
        loadComponent: () => import('./pages/content-new-page.component').then((m) => m.ContentNewPageComponent),
        data: { studioMeta: { section: 'Content', title: 'New content' } },
      },
      {
        path: 'content/:id',
        loadComponent: () => import('./pages/content-workspace-page.component').then((m) => m.ContentWorkspacePageComponent),
        data: { studioMeta: { section: 'Content', title: 'Article' } },
      },
      {
        path: 'calendar',
        loadComponent: () => import('./pages/calendar-page.component').then((m) => m.CalendarPageComponent),
        data: { studioMeta: { section: 'Calendar', title: 'Calendar' } },
      },
      {
        path: 'editorial-plan',
        loadComponent: () => import('./pages/editorial-plan-page.component').then((m) => m.EditorialPlanPageComponent),
        data: { studioMeta: { section: 'Editorial Plan', title: 'Editorial Plan' } },
      },
      {
        path: 'site-intelligence',
        loadComponent: () => import('./pages/site-intelligence-page.component').then((m) => m.SiteIntelligencePageComponent),
        data: { studioMeta: { section: 'Site Intelligence', title: 'Site Intelligence' } },
      },
      {
        path: 'publications',
        loadComponent: () => import('./pages/publications-page.component').then((m) => m.PublicationsPageComponent),
        data: { studioMeta: { section: 'Publications', title: 'Publications' } },
      },
      {
        path: 'inbox',
        loadComponent: () => import('./pages/inbox-page.component').then((m) => m.InboxPageComponent),
        data: { studioMeta: { section: 'Inbox', title: 'Inbox' } },
      },
      {
        path: 'editorial-engine',
        loadComponent: () => import('./pages/editorial-engine-page.component').then((m) => m.EditorialEnginePageComponent),
        data: { studioMeta: { section: 'Editorial Engine', title: 'Editorial Engine' } },
      },
      {
        path: 'sources',
        loadComponent: () => import('./pages/sources-page.component').then((m) => m.SourcesPageComponent),
        data: { studioMeta: { section: 'Sources', title: 'Sources' } },
      },
      {
        path: 'automation',
        loadComponent: () => import('./pages/automation-page.component').then((m) => m.AutomationPageComponent),
        data: { studioMeta: { section: 'Automation', title: 'Automation' } },
      },
      {
        path: 'media',
        loadComponent: () => import('./pages/media-page.component').then((m) => m.MediaPageComponent),
        data: { studioMeta: { section: 'Media', title: 'Media' } },
      },
      {
        path: 'publishing',
        loadComponent: () => import('./pages/publishing-page.component').then((m) => m.PublishingPageComponent),
        data: { studioMeta: { section: 'Publishing', title: 'Publishing' } },
      },
      {
        path: 'connections',
        loadComponent: () => import('./pages/connections-page.component').then((m) => m.ConnectionsPageComponent),
        data: { studioMeta: { section: 'Connections', title: 'Connections' } },
      },
      {
        path: 'connections/wizard',
        loadComponent: () => import('./pages/connection-wizard-page.component').then((m) => m.ConnectionWizardPageComponent),
        data: { studioMeta: { section: 'Connections', title: 'Connect destination' } },
      },
      {
        path: 'connections/wizard/:id',
        loadComponent: () => import('./pages/connection-wizard-page.component').then((m) => m.ConnectionWizardPageComponent),
        data: { studioMeta: { section: 'Connections', title: 'Connect destination' } },
      },
      {
        path: 'activity',
        loadComponent: () => import('./pages/activity-page.component').then((m) => m.ActivityPageComponent),
        data: { studioMeta: { section: 'Activity', title: 'Background jobs' } },
      },
      {
        path: 'operations',
        loadComponent: () => import('./pages/operations-page.component').then((m) => m.OperationsPageComponent),
        data: { studioMeta: { section: 'Operations', title: 'System health' } },
      },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/notifications-page.component').then((m) => m.NotificationsPageComponent),
        data: { studioMeta: { section: 'Notifications', title: 'Notifications' } },
      },
      {
        path: 'settings',
        redirectTo: 'settings/profile',
        pathMatch: 'full',
      },
      {
        path: 'settings/:section',
        loadComponent: () => import('./pages/settings-page.component').then((m) => m.SettingsPageComponent),
        canActivate: [studioRoleGuard],
        data: { studioMeta: { section: 'Settings', title: 'Settings' } },
      },

      // ── Compatibility redirects (old surface → new destination) ─────
      { path: 'dashboard', redirectTo: 'overview', pathMatch: 'prefix' },
      { path: 'projects', redirectTo: 'content', pathMatch: 'prefix' },
      { path: 'editorial', redirectTo: 'content', pathMatch: 'prefix' },
      { path: 'ai', redirectTo: 'content', pathMatch: 'prefix' },
      { path: 'assets', redirectTo: 'media', pathMatch: 'prefix' },
      { path: 'review', redirectTo: 'content', pathMatch: 'prefix' },
      { path: 'publishing/scheduled', redirectTo: 'calendar', pathMatch: 'prefix' },
      { path: 'integrations', redirectTo: 'sources', pathMatch: 'prefix' },
      { path: 'analytics', redirectTo: 'overview', pathMatch: 'prefix' },
    ],
  },
  {
    path: 'studio/login',
    redirectTo: '/login',
    pathMatch: 'full',
  },
  {
    path: 'studio/ops-login',
    redirectTo: '/login',
    pathMatch: 'full',
  },

  // ── Public marketing site ───────────────────────────────────────────
  {
    path: '',
    loadComponent: () => import('./layout/public-shell.component').then((m) => m.PublicShellComponent),
    children: [
      { path: '', loadComponent: () => import('./pages/home-page.component').then((m) => m.HomePageComponent) },
      {
        path: 'use-cases',
        loadComponent: () => import('./pages/use-cases-page.component').then((m) => m.UseCasesPageComponent),
      },
      {
        path: 'use-cases/:slug',
        loadComponent: () => import('./pages/use-case-detail-page.component').then((m) => m.UseCaseDetailPageComponent),
      },
      {
        path: 'examples',
        loadComponent: () => import('./pages/examples-page.component').then((m) => m.ExamplesPageComponent),
      },
      {
        path: 'gallery',
        loadComponent: () => import('./pages/gallery-page.component').then((m) => m.GalleryPageComponent),
      },
      { path: 'faq', loadComponent: () => import('./pages/faq-page.component').then((m) => m.FaqPageComponent) },
      {
        path: 'contact',
        loadComponent: () => import('./pages/contact-page.component').then((m) => m.ContactPageComponent),
      },
      {
        path: 'built-by-tecnoria',
        loadComponent: () => import('./pages/made-by-tecnoria-page.component').then((m) => m.MadeByTecnoriaPageComponent),
      },
      { path: 'es', loadComponent: () => import('./pages/home-page.component').then((m) => m.HomePageComponent), data: { locale: 'es' } },
      {
        path: 'es/casos-de-uso',
        loadComponent: () => import('./pages/use-cases-page.component').then((m) => m.UseCasesPageComponent),
        data: { locale: 'es' },
      },
      {
        path: 'es/casos-de-uso/:slug',
        loadComponent: () => import('./pages/use-case-detail-page.component').then((m) => m.UseCaseDetailPageComponent),
        data: { locale: 'es' },
      },
      {
        path: 'es/ejemplos',
        loadComponent: () => import('./pages/examples-page.component').then((m) => m.ExamplesPageComponent),
        data: { locale: 'es' },
      },
      {
        path: 'es/galeria',
        loadComponent: () => import('./pages/gallery-page.component').then((m) => m.GalleryPageComponent),
        data: { locale: 'es' },
      },
      { path: 'es/faq', loadComponent: () => import('./pages/faq-page.component').then((m) => m.FaqPageComponent), data: { locale: 'es' } },
      {
        path: 'es/contacto',
        loadComponent: () => import('./pages/contact-page.component').then((m) => m.ContactPageComponent),
        data: { locale: 'es' },
      },
      {
        path: 'es/creado-por-tecnoria',
        loadComponent: () => import('./pages/made-by-tecnoria-page.component').then((m) => m.MadeByTecnoriaPageComponent),
        data: { locale: 'es' },
      },
      { path: '**', loadComponent: () => import('./pages/public-not-found-page.component').then((m) => m.PublicNotFoundPageComponent) },
    ],
  },
];
