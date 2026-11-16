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
  /** One line: what the user does on this step. Shown in the step bar and the "Next step" footer. */
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
  /** Sits at the far end of the horizontal nav, apart from the guided flow. */
  end?: boolean;
  /** Position in the guided editorial process; areas without one sit outside the flow. */
  step?: number;
};

/**
 * Studio information architecture, in the order the work happens for the
 * active site: understand it, feed it, plan, produce, publish. Each route
 * appears exactly once and every capability has a single home; other pages
 * link to it. Home gathers what needs attention; Settings closes the bar,
 * outside the flow; Profile lives in the account menu.
 */
export const STUDIO_NAV: StudioNavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'overview',
    items: [
      { label: 'Overview', path: '/studio/overview', icon: 'overview', hint: 'See what needs you today and what the next step is.' },
      { label: 'Notifications', path: '/studio/notifications', icon: 'bell', hint: 'Read what happened and jump to the item.' },
      { label: 'Background jobs', path: '/studio/activity', icon: 'activity', hint: 'Follow running, queued and failed work.' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Understand the site',
    icon: 'scan',
    step: 1,
    items: [
      {
        label: 'Site intelligence',
        path: '/studio/site-intelligence',
        icon: 'scan',
        hint: 'Read the site, set its audience, pillars and clusters.',
        sections: [
          { id: 'profile', label: 'Profile & strategy' },
          { id: 'pillars', label: 'Pillars & gaps' },
          { id: 'seo', label: 'SEO signals' },
          { id: 'crawl', label: 'Pages & crawl' },
        ],
      },
      { label: 'Competitors', path: '/studio/competitors', icon: 'globe', hint: 'Compare coverage and send gaps to the plan.' },
    ],
  },
  {
    id: 'sources',
    label: 'Sources',
    icon: 'sources',
    step: 2,
    items: [
      {
        label: 'Sources',
        path: '/studio/sources',
        icon: 'sources',
        hint: 'Choose where stories and evidence come from.',
        sections: [
          { id: 'sources', label: 'Active sources' },
          { id: 'recommendations', label: 'Suggested for you' },
          { id: 'add', label: 'Add a source' },
          { id: 'evidence', label: 'Evidence' },
          { id: 'settings', label: 'Advanced' },
        ],
      },
      { label: 'Inbox', path: '/studio/inbox', icon: 'inbox', hint: 'Triage the stories your sources found.' },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    icon: 'plan',
    step: 3,
    items: [
      {
        label: 'Editorial plan',
        path: '/studio/editorial-plan',
        icon: 'plan',
        hint: 'Decide what to publish: generate, review and approve briefs.',
        sections: [
          { id: 'backlog', label: 'Backlog' },
          { id: 'pipeline', label: 'Pipeline' },
        ],
      },
    ],
  },
  {
    id: 'production',
    label: 'Produce',
    icon: 'content',
    step: 4,
    items: [
      { label: 'Content', path: '/studio/content', icon: 'content', hint: 'Write, edit and approve each article.' },
      { label: 'Review queue', path: '/studio/editorial-engine', icon: 'sparkles', hint: 'Check what autopilot generated before it goes out.' },
      { label: 'Media', path: '/studio/media', icon: 'media', hint: 'Review and fix the images of your articles.' },
    ],
  },
  {
    id: 'publish',
    label: 'Publish',
    icon: 'send',
    step: 5,
    items: [
      { label: 'Calendar', path: '/studio/calendar', icon: 'calendar', hint: 'Decide when each piece goes out: schedule and move dates.' },
      { label: 'Publications', path: '/studio/publications', icon: 'publications', hint: 'Follow every publication: publish now, retry, cancel or unpublish.' },
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
      { label: 'Sites', path: '/studio/settings/sites', icon: 'globe', heading: 'Workspace' },
      { label: 'People', path: '/studio/settings/team', icon: 'user', adminOnly: true },
      { label: 'Roles', path: '/studio/settings/roles', icon: 'lock', adminOnly: true },
      { label: 'Connections', path: '/studio/connections', icon: 'connections' },
      { label: 'Web discovery', path: '/studio/settings/discovery', icon: 'sources' },
      { label: 'Autopilot', path: '/studio/automation', icon: 'automation' },
      { label: 'Assistant tools', path: '/studio/competencies', icon: 'competency' },
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

/** Longest nav path that prefixes the URL, so /studio/content/new still lights up Content. */
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

export type GuidedStep ={ group: StudioNavGroup; item: StudioNavItem; number: string };

/** Numbered steps of the guided process, in order ("1.1", "1.2", "2.1"…). */
export const GUIDED_STEPS: GuidedStep[] = STUDIO_NAV.filter((group) => group.step && !group.hidden).flatMap((group) =>
  group.items.map((item, index) => ({ group, item, number: `${group.step}.${index + 1}` })),
);

/** The step the URL belongs to, or null outside the guided process. */
export function currentStep(url: string): GuidedStep | null {
  const match = activeNavItem(url);
  return GUIDED_STEPS.find((step) => step.item === match?.item) ?? null;
}

/** Step after the URL's one; from Overview the process starts at step 1.1; null on the last step or outside the flow. */
export function nextStep(url: string): GuidedStep | null {
  const match = activeNavItem(url);
  if (match?.item.path === '/studio/overview') return GUIDED_STEPS[0] ?? null;
  const index = GUIDED_STEPS.findIndex((step) => step.item === match?.item);
  return index >= 0 ? GUIDED_STEPS[index + 1] ?? null : null;
}
