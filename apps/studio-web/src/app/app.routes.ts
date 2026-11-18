import { Routes } from '@angular/router';
import { studioAuthGuard, studioRoleGuard } from './guards/studio-guards';

/**
 * Simplified product routes. Old editorial surface routes redirect to the
 * equivalent new destinations.
 */
export const routes: Routes = [
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
        path: 'plan',
        loadComponent: () => import('./pages/editorial-plan-page.component').then((m) => m.EditorialPlanPageComponent),
        data: { studioMeta: { section: 'Advanced', title: 'Plan backlog' } },
      },
      {
        path: 'competencies',
        loadComponent: () => import('./pages/competencies-page.component').then((m) => m.CompetenciesPageComponent),
        data: { studioMeta: { section: 'Competencies', title: 'Competencies' } },
      },
      {
        path: 'site-intelligence',
        loadComponent: () => import('./pages/site-intelligence-page.component').then((m) => m.SiteIntelligencePageComponent),
        data: { studioMeta: { section: 'Site Intelligence', title: 'Site Intelligence' } },
      },
      {
        path: 'results',
        loadComponent: () => import('./pages/publications-page.component').then((m) => m.PublicationsPageComponent),
        data: { studioMeta: { section: 'Results', title: 'Results' } },
      },
      {
        path: 'inbox',
        loadComponent: () => import('./pages/inbox-page.component').then((m) => m.InboxPageComponent),
        data: { studioMeta: { section: 'Inbox', title: 'Inbox' } },
      },
      {
        path: 'review-queue',
        loadComponent: () => import('./pages/editorial-engine-page.component').then((m) => m.EditorialEnginePageComponent),
        data: { studioMeta: { section: 'Advanced', title: 'Review queue' } },
      },
      {
        path: 'sources',
        loadComponent: () => import('./pages/sources-page.component').then((m) => m.SourcesPageComponent),
        data: { studioMeta: { section: 'Sources', title: 'Sources' } },
      },
      { path: 'competitors', loadComponent: () => import('./pages/competitors-page.component').then((m) => m.CompetitorsPageComponent), data: { studioMeta: { section: 'Competitors', title: 'Competitors' } } },
      {
        path: 'automation',
        loadComponent: () => import('./pages/automation-page.component').then((m) => m.AutomationPageComponent),
        data: { studioMeta: { section: 'Settings', title: 'Mode & rhythm' } },
      },
      {
        path: 'media',
        loadComponent: () => import('./pages/media-page.component').then((m) => m.MediaPageComponent),
        data: { studioMeta: { section: 'Media', title: 'Media' } },
      },
      {
        path: 'settings/social',
        loadComponent: () => import('./pages/social-page.component').then((m) => m.SocialPageComponent),
        data: { studioMeta: { section: 'Settings', title: 'Social' } },
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
        canActivate: [studioRoleGuard],
        data: { requiredRole: 'admin', studioMeta: { section: 'Operations', title: 'System health' } },
      },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/notifications-page.component').then((m) => m.NotificationsPageComponent),
        data: { studioMeta: { section: 'Notifications', title: 'Notifications' } },
      },
      {
        path: 'profile',
        loadComponent: () => import('./pages/profile-page.component').then((m) => m.ProfilePageComponent),
        data: { studioMeta: { section: 'Account', title: 'Profile' } },
      },
      { path: 'settings', redirectTo: 'settings/sites', pathMatch: 'full' },
      { path: 'settings/profile', redirectTo: 'profile', pathMatch: 'full' },
      { path: 'admin', redirectTo: 'admin/overview', pathMatch: 'full' },
      {
        path: 'admin/:section',
        loadComponent: () => import('./pages/admin-page.component').then((m) => m.AdminPageComponent),
        data: { studioMeta: { section: 'Admin', title: 'Admin' } },
      },
      {
        path: 'settings/writing',
        loadComponent: () => import('./pages/writing-settings-page.component').then((m) => m.WritingSettingsPageComponent),
        data: { studioMeta: { section: 'Settings', title: 'Writing' } },
      },
      {
        path: 'settings/:section',
        loadComponent: () => import('./pages/settings-page.component').then((m) => m.SettingsPageComponent),
        canActivate: [studioRoleGuard],
        data: { adminSections: ['team', 'roles'], studioMeta: { section: 'Settings', title: 'Settings' } },
      },

      // ── Compatibility redirects (old surface → new destination) ─────
      // M5: the calendar is the main screen; query params (?id=, ?projectId=) carry over.
      { path: 'editorial-plan', redirectTo: 'calendar', pathMatch: 'full' },
      { path: 'editorial-engine', redirectTo: '/studio/calendar?chip=review', pathMatch: 'full' },
      { path: 'publications', redirectTo: 'results', pathMatch: 'full' },
      { path: 'dashboard', redirectTo: 'overview', pathMatch: 'prefix' },
      { path: 'projects', redirectTo: 'content', pathMatch: 'prefix' },
      { path: 'editorial', redirectTo: 'content', pathMatch: 'prefix' },
      { path: 'ai', redirectTo: 'content', pathMatch: 'prefix' },
      { path: 'assets', redirectTo: 'media', pathMatch: 'prefix' },
      { path: 'review', redirectTo: 'content', pathMatch: 'prefix' },
      { path: 'publishing/scheduled', redirectTo: 'calendar', pathMatch: 'prefix' },
      // Publishing was a read-only subset of Publications (queue, published) and Connections (destinations).
      { path: 'publishing', redirectTo: 'results', pathMatch: 'full' },
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
      { path: 'gallery', redirectTo: '/examples', pathMatch: 'full' },
      { path: 'contact', redirectTo: '/waitlist', pathMatch: 'full' },
      { path: 'faq', loadComponent: () => import('./pages/faq-page.component').then((m) => m.FaqPageComponent) },
      {
        path: 'waitlist',
        loadComponent: () => import('./pages/contact-page.component').then((m) => m.ContactPageComponent),
      },
      { path: 'built-by-tecnoria', redirectTo: '/', pathMatch: 'full' },
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
      { path: 'es/galeria', redirectTo: '/es/ejemplos', pathMatch: 'full' },
      { path: 'es/contacto', redirectTo: '/es/lista-de-espera', pathMatch: 'full' },
      {
        path: 'blog',
        loadComponent: () => import('./pages/blog-page.component').then((m) => m.BlogPageComponent),
      },
      {
        path: 'blog/:slug',
        loadComponent: () => import('./pages/article-page.component').then((m) => m.ArticlePageComponent),
      },
      {
        path: 'es/blog',
        loadComponent: () => import('./pages/blog-page.component').then((m) => m.BlogPageComponent),
        data: { locale: 'es' },
      },
      {
        path: 'es/blog/:slug',
        loadComponent: () => import('./pages/article-page.component').then((m) => m.ArticlePageComponent),
        data: { locale: 'es' },
      },
      { path: 'es/faq', loadComponent: () => import('./pages/faq-page.component').then((m) => m.FaqPageComponent), data: { locale: 'es' } },
      {
        path: 'es/lista-de-espera',
        loadComponent: () => import('./pages/contact-page.component').then((m) => m.ContactPageComponent),
        data: { locale: 'es' },
      },
      { path: 'es/creado-por-tecnoria', redirectTo: '/es', pathMatch: 'full' },
      { path: '**', loadComponent: () => import('./pages/public-not-found-page.component').then((m) => m.PublicNotFoundPageComponent) },
    ],
  },
];
