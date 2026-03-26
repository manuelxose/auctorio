import { Routes } from '@angular/router';
import {
  studioAuthGuard,
  studioPermissionGuard,
} from './guards/studio-auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'studio/login',
    loadComponent: () =>
      import('./pages/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'studio/ops-login',
    loadComponent: () =>
      import('./pages/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'studio',
    loadComponent: () =>
      import('./layout/studio-shell.component').then((m) => m.StudioShellComponent),
    canActivate: [studioAuthGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard-page.component').then((m) => m.DashboardPageComponent),
        data: {
          studioMeta: {
            section: 'Dashboard',
            title: 'Overview',
          },
        },
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('./pages/projects-page.component').then((m) => m.ProjectsPageComponent),
        data: {
          studioMeta: {
            section: 'Projects',
            title: 'All Projects',
          },
          projectCollectionView: 'projects',
        },
      },
      {
        path: 'projects/new',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/projects-page.component').then((m) => m.ProjectsPageComponent),
        data: {
          requiredPermission: 'projects.manage',
          studioMeta: {
            section: 'Projects',
            title: 'Create Project',
          },
          projectCollectionView: 'create',
        },
      },
      {
        path: 'projects/:id',
        loadComponent: () =>
          import('./pages/project-detail-page.component').then(
            (m) => m.ProjectDetailPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Projects',
            title: 'Project Overview',
          },
          projectWorkbenchView: 'overview',
        },
      },
      {
        path: 'editorial',
        redirectTo: 'editorial/pipeline',
        pathMatch: 'full',
      },
      {
        path: 'editorial/pipeline',
        loadComponent: () =>
          import('./pages/editorial-pipeline-page.component').then(
            (m) => m.EditorialPipelinePageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Pipeline',
          },
          projectCollectionView: 'pipeline',
        },
      },
      {
        path: 'editorial/calendar',
        loadComponent: () =>
          import('./pages/editorial-calendar-page.component').then(
            (m) => m.EditorialCalendarPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Calendar',
          },
        },
      },
      {
        path: 'editorial/briefs',
        loadComponent: () =>
          import('./pages/projects-page.component').then((m) => m.ProjectsPageComponent),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Briefs',
          },
          projectCollectionView: 'briefs',
        },
      },
      {
        path: 'editorial/briefs/:id',
        loadComponent: () =>
          import('./pages/project-detail-page.component').then(
            (m) => m.ProjectDetailPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Brief Editor',
          },
          projectWorkbenchView: 'brief',
        },
      },
      {
        path: 'editorial/articles',
        loadComponent: () =>
          import('./pages/projects-page.component').then((m) => m.ProjectsPageComponent),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Articles',
          },
          projectCollectionView: 'articles',
        },
      },
      {
        path: 'editorial/articles/:id',
        loadComponent: () =>
          import('./pages/project-detail-page.component').then(
            (m) => m.ProjectDetailPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Article Editor',
          },
          projectWorkbenchView: 'article',
        },
      },
      {
        path: 'editorial/versions',
        loadComponent: () =>
          import('./pages/editorial-versions-page.component').then(
            (m) => m.EditorialVersionsPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Versions',
          },
        },
      },
      {
        path: 'editorial/versions/:id',
        loadComponent: () =>
          import('./pages/version-compare-page.component').then(
            (m) => m.VersionComparePageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Version Detail',
          },
        },
      },
      {
        path: 'editorial/versions/:id/compare/:againstId',
        loadComponent: () =>
          import('./pages/version-compare-page.component').then(
            (m) => m.VersionComparePageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Editorial',
            title: 'Version Compare',
          },
        },
      },
      {
        path: 'assets/images',
        loadComponent: () =>
          import('./pages/image-generation-page.component').then(
            (m) => m.ImageGenerationPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Assets',
            title: 'Images',
          },
          imageWorkspaceView: 'assets',
        },
      },
      {
        path: 'assets/library',
        loadComponent: () =>
          import('./pages/media-library-page.component').then(
            (m) => m.MediaLibraryPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Assets',
            title: 'Media Library',
          },
        },
      },
      {
        path: 'ai',
        redirectTo: 'ai/text-generation',
        pathMatch: 'full',
      },
      {
        path: 'ai/text-generation',
        loadComponent: () =>
          import('./pages/text-generation-page.component').then(
            (m) => m.TextGenerationPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'AI Generation',
            title: 'Text Generation',
          },
        },
      },
      {
        path: 'ai/image-generation',
        loadComponent: () =>
          import('./pages/image-generation-page.component').then(
            (m) => m.ImageGenerationPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'AI Generation',
            title: 'Image Generation',
          },
          imageWorkspaceView: 'generation',
        },
      },
      {
        path: 'ai/prompts',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/prompt-library-page.component').then(
            (m) => m.PromptLibraryPageComponent,
          ),
        data: {
          requiredPermission: 'prompts.manage',
          studioMeta: {
            section: 'AI Generation',
            title: 'Prompt Library',
          },
        },
      },
      {
        path: 'review',
        redirectTo: 'review/qa',
        pathMatch: 'full',
      },
      {
        path: 'review/qa',
        loadComponent: () =>
          import('./pages/qa-queue-page.component').then((m) => m.QaQueuePageComponent),
        data: {
          studioMeta: {
            section: 'Review',
            title: 'QA Queue',
          },
        },
      },
      {
        path: 'review/editor',
        loadComponent: () =>
          import('./pages/editor-review-page.component').then(
            (m) => m.EditorReviewPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Review',
            title: 'Editor Review',
          },
        },
      },
      {
        path: 'publishing',
        redirectTo: 'publishing/history',
        pathMatch: 'full',
      },
      {
        path: 'publishing/destinations',
        loadComponent: () =>
          import('./pages/sites-page.component').then((m) => m.SitesPageComponent),
        data: {
          studioMeta: {
            section: 'Publishing',
            title: 'Destinations',
          },
        },
      },
      {
        path: 'publishing/scheduled',
        loadComponent: () =>
          import('./pages/scheduled-page.component').then(
            (m) => m.ScheduledPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Publishing',
            title: 'Scheduled',
          },
        },
      },
      {
        path: 'publishing/history',
        loadComponent: () =>
          import('./pages/deployments-page.component').then(
            (m) => m.DeploymentsPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Publishing',
            title: 'History',
          },
        },
      },
      {
        path: 'analytics',
        redirectTo: 'analytics/content-performance',
        pathMatch: 'full',
      },
      {
        path: 'analytics/content-performance',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/analytics-page.component').then((m) => m.AnalyticsPageComponent),
        data: {
          requiredPermission: 'analytics.read',
          studioMeta: {
            section: 'Analytics',
            title: 'Content Performance',
          },
          analyticsView: 'contentPerformance',
        },
      },
      {
        path: 'analytics/seo-metrics',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/analytics-page.component').then((m) => m.AnalyticsPageComponent),
        data: {
          requiredPermission: 'analytics.read',
          studioMeta: {
            section: 'Analytics',
            title: 'SEO Metrics',
          },
          analyticsView: 'seoMetrics',
        },
      },
      {
        path: 'automation',
        redirectTo: 'automation/jobs',
        pathMatch: 'full',
      },
      {
        path: 'automation/pipelines',
        loadComponent: () =>
          import('./pages/automation-pipelines-page.component').then(
            (m) => m.AutomationPipelinesPageComponent,
          ),
        data: {
          studioMeta: {
            section: 'Automation',
            title: 'Pipelines',
          },
        },
      },
      {
        path: 'automation/jobs',
        loadComponent: () =>
          import('./pages/logs-page.component').then((m) => m.LogsPageComponent),
        data: {
          studioMeta: {
            section: 'Automation',
            title: 'Jobs',
          },
        },
      },
      {
        path: 'integrations',
        redirectTo: 'integrations/cms',
        pathMatch: 'full',
      },
      {
        path: 'integrations/cms',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/integrations-page.component').then(
            (m) => m.IntegrationsPageComponent,
          ),
        data: {
          requiredPermission: 'integrations.manage',
          studioMeta: {
            section: 'Integrations',
            title: 'CMS',
          },
          integrationsView: 'cms',
        },
      },
      {
        path: 'integrations/webhooks',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/integrations-page.component').then(
            (m) => m.IntegrationsPageComponent,
          ),
        data: {
          requiredPermission: 'integrations.manage',
          studioMeta: {
            section: 'Integrations',
            title: 'Webhooks',
          },
          integrationsView: 'webhooks',
        },
      },
      {
        path: 'integrations/apis',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/integrations-page.component').then(
            (m) => m.IntegrationsPageComponent,
          ),
        data: {
          requiredPermission: 'integrations.manage',
          studioMeta: {
            section: 'Integrations',
            title: 'APIs',
          },
          integrationsView: 'apis',
        },
      },
      {
        path: 'settings',
        redirectTo: 'settings/workspace',
        pathMatch: 'full',
      },
      {
        path: 'settings/workspace',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/workspace-settings-page.component').then(
            (m) => m.WorkspaceSettingsPageComponent,
          ),
        data: {
          requiredPermission: 'workspace.manage',
          studioMeta: {
            section: 'Settings',
            title: 'Workspace',
          },
        },
      },
      {
        path: 'settings/users',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/users-page.component').then((m) => m.UsersPageComponent),
        data: {
          requiredPermission: 'users.manage',
          studioMeta: {
            section: 'Settings',
            title: 'Users',
          },
        },
      },
      {
        path: 'settings/roles',
        canActivate: [studioPermissionGuard],
        loadComponent: () =>
          import('./pages/roles-page.component').then((m) => m.RolesPageComponent),
        data: {
          requiredPermission: 'roles.manage',
          studioMeta: {
            section: 'Settings',
            title: 'Roles',
          },
        },
      },
      {
        path: 'channels',
        redirectTo: '/studio/publishing/destinations',
        pathMatch: 'full',
      },
      {
        path: 'channels/integrations',
        redirectTo: '/studio/publishing/destinations',
        pathMatch: 'full',
      },
      {
        path: 'channels/web',
        redirectTo: '/studio/publishing/destinations',
        pathMatch: 'full',
      },
      {
        path: 'channels/whatsapp',
        redirectTo: '/studio/publishing/destinations',
        pathMatch: 'full',
      },
      {
        path: 'channels/api',
        redirectTo: '/studio/publishing/destinations',
        pathMatch: 'full',
      },
      {
        path: 'deployments',
        redirectTo: '/studio/publishing/history',
        pathMatch: 'full',
      },
      {
        path: 'logs',
        redirectTo: '/studio/automation/jobs',
        pathMatch: 'full',
      },
      {
        path: 'analytics/usage',
        redirectTo: '/studio/analytics/content-performance',
        pathMatch: 'full',
      },
      {
        path: 'analytics/performance',
        redirectTo: '/studio/analytics/content-performance',
        pathMatch: 'full',
      },
      {
        path: 'analytics/metrics',
        redirectTo: '/studio/analytics/seo-metrics',
        pathMatch: 'full',
      },
      {
        path: 'bots',
        redirectTo: '/studio/projects',
        pathMatch: 'full',
      },
      {
        path: 'bots/create',
        redirectTo: '/studio/projects/new',
        pathMatch: 'full',
      },
      {
        path: 'conversations/live',
        redirectTo: '/studio/review/qa',
        pathMatch: 'full',
      },
      {
        path: 'conversations/history',
        redirectTo: '/studio/review/qa',
        pathMatch: 'full',
      },
      {
        path: 'conversations/search',
        redirectTo: '/studio/review/qa',
        pathMatch: 'full',
      },
      {
        path: 'knowledge/sources',
        redirectTo: '/studio/editorial/briefs',
        pathMatch: 'full',
      },
      {
        path: 'knowledge/documents',
        redirectTo: '/studio/editorial/briefs',
        pathMatch: 'full',
      },
      {
        path: 'knowledge/embeddings',
        redirectTo: '/studio/editorial/briefs',
        pathMatch: 'full',
      },
      {
        path: 'users/workspace',
        redirectTo: '/studio/settings/users',
        pathMatch: 'full',
      },
      {
        path: 'users/roles',
        redirectTo: '/studio/settings/roles',
        pathMatch: 'full',
      },
      {
        path: 'users/permissions',
        redirectTo: '/studio/settings/roles',
        pathMatch: 'full',
      },
      {
        path: 'sites',
        redirectTo: '/studio/publishing/destinations',
        pathMatch: 'full',
      },
      {
        path: '**',
        redirectTo: 'dashboard',
      },
    ],
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/public-shell.component').then((m) => m.PublicShellComponent),
    children: [
      {
        path: '',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/home-page.component').then((m) => m.HomePageComponent),
      },
      {
        path: 'use-cases',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/use-cases-page.component').then(
            (m) => m.UseCasesPageComponent,
          ),
      },
      {
        path: 'use-cases/:slug',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/use-case-detail-page.component').then(
            (m) => m.UseCaseDetailPageComponent,
          ),
      },
      {
        path: 'examples',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/examples-page.component').then(
            (m) => m.ExamplesPageComponent,
          ),
      },
      {
        path: 'gallery',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/gallery-page.component').then((m) => m.GalleryPageComponent),
      },
      {
        path: 'faq',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/faq-page.component').then((m) => m.FaqPageComponent),
      },
      {
        path: 'contact',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/contact-page.component').then((m) => m.ContactPageComponent),
      },
      {
        path: 'built-by-tecnoria',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/made-by-tecnoria-page.component').then(
            (m) => m.MadeByTecnoriaPageComponent,
          ),
      },
      {
        path: 'es',
        data: { locale: 'es' },
        loadComponent: () =>
          import('./pages/home-page.component').then((m) => m.HomePageComponent),
      },
      {
        path: 'es/casos-de-uso',
        data: { locale: 'es' },
        loadComponent: () =>
          import('./pages/use-cases-page.component').then(
            (m) => m.UseCasesPageComponent,
          ),
      },
      {
        path: 'es/casos-de-uso/:slug',
        data: { locale: 'es' },
        loadComponent: () =>
          import('./pages/use-case-detail-page.component').then(
            (m) => m.UseCaseDetailPageComponent,
          ),
      },
      {
        path: 'es/ejemplos',
        data: { locale: 'es' },
        loadComponent: () =>
          import('./pages/examples-page.component').then(
            (m) => m.ExamplesPageComponent,
          ),
      },
      {
        path: 'es/galeria',
        data: { locale: 'es' },
        loadComponent: () =>
          import('./pages/gallery-page.component').then((m) => m.GalleryPageComponent),
      },
      {
        path: 'es/faq',
        data: { locale: 'es' },
        loadComponent: () =>
          import('./pages/faq-page.component').then((m) => m.FaqPageComponent),
      },
      {
        path: 'es/contacto',
        data: { locale: 'es' },
        loadComponent: () =>
          import('./pages/contact-page.component').then((m) => m.ContactPageComponent),
      },
      {
        path: 'es/creado-por-tecnoria',
        data: { locale: 'es' },
        loadComponent: () =>
          import('./pages/made-by-tecnoria-page.component').then(
            (m) => m.MadeByTecnoriaPageComponent,
          ),
      },
      {
        path: '**',
        data: { locale: 'en' },
        loadComponent: () =>
          import('./pages/public-not-found-page.component').then(
            (m) => m.PublicNotFoundPageComponent,
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
