import type { StudioPermission } from '../models/studio.models';

export type StudioMeta = {
  section: string;
  title: string;
};

export type StudioNavItem = {
  label: string;
  path: string;
  requiredPermission?: StudioPermission;
};

export type StudioNavGroup = {
  label: string;
  items: StudioNavItem[];
};

export type StudioNavCategory = {
  category: string;
  groups: StudioNavGroup[];
};

export const STUDIO_NAV_CATEGORIES: StudioNavCategory[] = [
  {
    category: 'Dashboard',
    groups: [
      {
        label: 'Overview',
        items: [
          {
            label: 'Overview',
            path: '/studio/dashboard',
          },
        ],
      },
    ],
  },
  {
    category: 'Operations',
    groups: [
      {
        label: 'Projects',
        items: [
          {
            label: 'All Projects',
            path: '/studio/projects',
          },
          {
            label: 'Create Project',
            path: '/studio/projects/new',
            requiredPermission: 'projects.manage',
          },
        ],
      },
      {
        label: 'Editorial',
        items: [
          {
            label: 'Pipeline',
            path: '/studio/editorial/pipeline',
          },
          {
            label: 'Calendar',
            path: '/studio/editorial/calendar',
          },
          {
            label: 'Briefs',
            path: '/studio/editorial/briefs',
          },
          {
            label: 'Articles',
            path: '/studio/editorial/articles',
          },
          {
            label: 'Versions',
            path: '/studio/editorial/versions',
          },
        ],
      },
      {
        label: 'Assets',
        items: [
          {
            label: 'Images',
            path: '/studio/assets/images',
          },
          {
            label: 'Media Library',
            path: '/studio/assets/library',
          },
        ],
      },
      {
        label: 'AI Generation',
        items: [
          {
            label: 'Text Generation',
            path: '/studio/ai/text-generation',
          },
          {
            label: 'Image Generation',
            path: '/studio/ai/image-generation',
          },
          {
            label: 'Prompt Library',
            path: '/studio/ai/prompts',
            requiredPermission: 'prompts.manage',
          },
        ],
      },
    ],
  },
  {
    category: 'Control',
    groups: [
      {
        label: 'Review',
        items: [
          {
            label: 'QA Queue',
            path: '/studio/review/qa',
          },
          {
            label: 'Editor Review',
            path: '/studio/review/editor',
          },
        ],
      },
      {
        label: 'Publishing',
        items: [
          {
            label: 'Destinations',
            path: '/studio/publishing/destinations',
          },
          {
            label: 'Scheduled',
            path: '/studio/publishing/scheduled',
          },
          {
            label: 'History',
            path: '/studio/publishing/history',
          },
        ],
      },
      {
        label: 'Analytics',
        items: [
          {
            label: 'Content Performance',
            path: '/studio/analytics/content-performance',
            requiredPermission: 'analytics.read',
          },
          {
            label: 'SEO Metrics',
            path: '/studio/analytics/seo-metrics',
            requiredPermission: 'analytics.read',
          },
        ],
      },
      {
        label: 'Automation',
        items: [
          {
            label: 'Pipelines',
            path: '/studio/automation/pipelines',
          },
          {
            label: 'Jobs',
            path: '/studio/automation/jobs',
          },
        ],
      },
      {
        label: 'Integrations',
        items: [
          {
            label: 'CMS',
            path: '/studio/integrations/cms',
            requiredPermission: 'integrations.manage',
          },
          {
            label: 'Webhooks',
            path: '/studio/integrations/webhooks',
            requiredPermission: 'integrations.manage',
          },
          {
            label: 'APIs',
            path: '/studio/integrations/apis',
            requiredPermission: 'integrations.manage',
          },
        ],
      },
    ],
  },
  {
    category: 'Governance',
    groups: [
      {
        label: 'Settings',
        items: [
          {
            label: 'Workspace',
            path: '/studio/settings/workspace',
          },
          {
            label: 'Users',
            path: '/studio/settings/users',
            requiredPermission: 'users.manage',
          },
          {
            label: 'Roles',
            path: '/studio/settings/roles',
            requiredPermission: 'roles.manage',
          },
        ],
      },
    ],
  },
];
