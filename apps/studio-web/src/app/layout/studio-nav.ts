import type { StudioIconName } from '../components/ui/app-icon.component';

export type StudioNavItem = { label: string; path: string; icon: StudioIconName };
/** A primary area (horizontal nav). Its items are the contextual sidebar's tools. */
export type StudioNavGroup = { id: string; label: string; icon: StudioIconName; items: StudioNavItem[] };

/**
 * Studio information architecture. Areas form the horizontal primary nav; the
 * selected area's items form the contextual sidebar, which also hosts the
 * assistant. Each route appears exactly once; user-level pages (Settings,
 * Profile) live in the account menu. Add a tool by adding one line to its area.
 */
export const STUDIO_NAV: StudioNavGroup[] = [
  {
    id: 'plan',
    label: 'Plan & Calendar',
    icon: 'plan',
    items: [
      { label: 'Editorial plan', path: '/studio/editorial-plan', icon: 'plan' },
      { label: 'Calendar', path: '/studio/calendar', icon: 'calendar' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Website Intelligence',
    icon: 'scan',
    items: [
      { label: 'Site intelligence', path: '/studio/site-intelligence', icon: 'scan' },
      { label: 'Sources', path: '/studio/sources', icon: 'sources' },
      { label: 'Competitors', path: '/studio/competitors', icon: 'globe' },
    ],
  },
  {
    id: 'production',
    label: 'Content Production',
    icon: 'content',
    items: [
      { label: 'Content', path: '/studio/content', icon: 'content' },
      { label: 'Media', path: '/studio/media', icon: 'media' },
      { label: 'Publications', path: '/studio/publications', icon: 'publications' },
      { label: 'Publishing', path: '/studio/publishing', icon: 'send' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: 'operations',
    items: [
      { label: 'Overview', path: '/studio/overview', icon: 'overview' },
      { label: 'Inbox', path: '/studio/inbox', icon: 'inbox' },
      { label: 'System health', path: '/studio/operations', icon: 'operations' },
      { label: 'Editorial engine', path: '/studio/editorial-engine', icon: 'sparkles' },
      { label: 'Activity', path: '/studio/activity', icon: 'activity' },
      { label: 'Autopilot', path: '/studio/automation', icon: 'automation' },
      { label: 'Connections', path: '/studio/connections', icon: 'connections' },
      { label: 'Notifications', path: '/studio/notifications', icon: 'bell' },
      { label: 'Assistant tools', path: '/studio/competencies', icon: 'competency' },
    ],
  },
];

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
