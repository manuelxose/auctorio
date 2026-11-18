import type { StudioIconName } from '../components/ui/app-icon.component';

export type StudioNavItem = {
  label: string;
  path: string;
  icon: StudioIconName;
  platformAdminOnly?: boolean;
  /** Workspace admins only: team, roles and system internals. The API enforces the same rule. */
  adminOnly?: boolean;
  /** Small label shown above this item in the sidebar. */
  heading?: string;
  /** One line: what the user does here. Shown as the item's tooltip. */
  hint?: string;
  /** Sections of the page, listed under the item in the sidebar and opened with ?tab=<id>; the first is the default. */
  sections?: StudioNavSection[];
};
export type StudioNavSection = { id: string; label: string };
/** A primary area (horizontal nav). Its items are the contextual sidebar's tools. */
export type StudioNavGroup = {
  id: string;
  label: string;
  icon: StudioIconName;
  items: StudioNavItem[];
  /** Reached from the account menu, not the horizontal nav. */
  hidden?: boolean;
  /** Sits at the far end of the horizontal nav. */
  end?: boolean;
};

/**
 * Studio information architecture (M5): Home · Calendar · Articles · Results ·
 * Settings, with the specialist tools under Advanced. Each route appears
 * exactly once and every capability has a single home; other pages link to
 * it. Profile lives in the account menu.
 */
export const STUDIO_NAV: StudioNavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'overview',
    items: [
      { label: 'Overview', path: '/studio/overview', icon: 'overview', hint: 'See what needs you today and what the next step is.' },
      { label: 'Notifications', path: '/studio/notifications', icon: 'bell', hint: 'Read what happened and jump to the item.' },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: 'calendar',
    items: [{ label: 'Calendar', path: '/studio/calendar', icon: 'calendar', hint: 'The next 30 days: add keywords, move articles, review drafts.' }],
  },
  {
    id: 'articles',
    label: 'Articles',
    icon: 'content',
    items: [{ label: 'Articles', path: '/studio/content', icon: 'content', hint: 'Read, approve and publish each article.' }],
  },
  {
    id: 'results',
    label: 'Results',
    icon: 'publications',
    items: [{ label: 'Results', path: '/studio/results', icon: 'publications', hint: 'Every publication: publish now, retry, cancel or unpublish.' }],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: 'layers',
    end: true,
    items: [
      {
        label: 'Site intelligence',
        path: '/studio/site-intelligence',
        icon: 'scan',
        heading: 'Site',
        hint: 'Read the site, set its audience, pillars and clusters.',
        sections: [
          { id: 'profile', label: 'Profile & strategy' },
          { id: 'pillars', label: 'Pillars & gaps' },
          { id: 'seo', label: 'SEO signals' },
          { id: 'crawl', label: 'Pages & crawl' },
        ],
      },
      { label: 'Competitors', path: '/studio/competitors', icon: 'globe', hint: 'Compare coverage and send gaps to the plan.' },
      {
        label: 'Sources',
        path: '/studio/sources',
        icon: 'sources',
        heading: 'News',
        hint: 'Choose where stories and evidence come from.',
        sections: [
          { id: 'sources', label: 'Active sources' },
          { id: 'recommendations', label: 'Suggested for you' },
          { id: 'add', label: 'Add a source' },
          { id: 'evidence', label: 'Evidence' },
          { id: 'settings', label: 'Technical settings' },
        ],
      },
      { label: 'Inbox', path: '/studio/inbox', icon: 'inbox', hint: 'Triage the stories your sources found.' },
      {
        label: 'Plan backlog',
        path: '/studio/plan',
        icon: 'plan',
        heading: 'Production',
        hint: 'Generate plans and edit every brief in full.',
        sections: [
          { id: 'backlog', label: 'Backlog' },
          { id: 'pipeline', label: 'Pipeline' },
        ],
      },
      { label: 'Review queue', path: '/studio/review-queue', icon: 'sparkles', hint: 'Check what autopilot generated before it goes out.' },
      { label: 'Media', path: '/studio/media', icon: 'media', hint: 'Review and fix the images of your articles.' },
      { label: 'Background jobs', path: '/studio/activity', icon: 'activity', hint: 'Follow running, queued and failed work.' },
    ],
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'user',
    hidden: true,
    items: [{ label: 'Profile', path: '/studio/profile', icon: 'user' }],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    end: true,
    items: [
      { label: 'Sites', path: '/studio/settings/sites', icon: 'globe', heading: 'Business & brand' },
      { label: 'Writing', path: '/studio/settings/writing', icon: 'edit', heading: 'Articles', hint: 'Instructions, length and blocks of every future article.' },
      { label: 'Mode & rhythm', path: '/studio/automation', icon: 'automation' },
      { label: 'Connections', path: '/studio/connections', icon: 'connections', heading: 'Integrations' },
      { label: 'Social', path: '/studio/settings/social', icon: 'send' },
      { label: 'Web discovery', path: '/studio/settings/discovery', icon: 'sources' },
      { label: 'Assistant tools', path: '/studio/competencies', icon: 'competency' },
      { label: 'People', path: '/studio/settings/team', icon: 'user', heading: 'Workspace', adminOnly: true },
      { label: 'Roles', path: '/studio/settings/roles', icon: 'lock', adminOnly: true },
      {
        label: 'System health',
        path: '/studio/operations',
        icon: 'operations',
        heading: 'System',
        adminOnly: true,
        sections: [
          { id: 'overview', label: 'Overview' },
          { id: 'workers', label: 'Workers' },
          { id: 'queues', label: 'Queues' },
          { id: 'production', label: 'Production jobs' },
          { id: 'failures', label: 'Failures' },
          { id: 'cost', label: 'Cost controls' },
        ],
      },
      { label: 'Usage', path: '/studio/admin/overview', icon: 'overview', heading: 'All workspaces', platformAdminOnly: true },
      { label: 'Workspaces', path: '/studio/admin/workspaces', icon: 'globe', platformAdminOnly: true },
      { label: 'AI providers', path: '/studio/admin/ai', icon: 'sparkles', platformAdminOnly: true },
    ],
  },
];

/** Whether a member with this workspace role (and platform flag) sees the item. */
export function canSeeNavItem(item: StudioNavItem, role: string, isPlatformAdmin = false): boolean {
  return (!item.adminOnly || role === 'admin') && (!item.platformAdminOnly || isPlatformAdmin);
}

/** Longest nav path that prefixes the URL, so /studio/content/new still lights up Articles. */
export function activeNavItem(url: string): { group: StudioNavGroup; item: StudioNavItem } | null {
  let best: { group: StudioNavGroup; item: StudioNavItem } | null = null;
  for (const group of STUDIO_NAV) {
    for (const item of group.items) {
      const base = item.path;
      if ((url === base || url.startsWith(base + '/')) && (!best || base.length > best.item.path.length)) {
        best = { group, item };
      }
    }
  }
  return best;
}

/** The section ?tab= names on the page at `path`, else its first section. */
export function sectionFor(path: string, tab: string | null | undefined): string {
  const sections = STUDIO_NAV.flatMap((group) => group.items).find((item) => item.path === path)?.sections ?? [];
  return sections.find((section) => section.id === tab)?.id ?? sections[0]?.id ?? '';
}
