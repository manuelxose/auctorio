import type { StudioIconName } from '../components/ui/app-icon.component';

export type StudioNavItem = { label: string; path: string; icon: StudioIconName };
export type StudioNavGroup = { id: string; label: string; items: StudioNavItem[] };

/**
 * The Studio sidebar, one entry per implemented route (see app.routes.ts).
 * The copilot is not a route: the sidebar renders its launcher above these groups.
 */
export const STUDIO_NAV: StudioNavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { label: 'Overview', path: '/studio/overview', icon: 'overview' },
      { label: 'Inbox', path: '/studio/inbox', icon: 'inbox' },
      { label: 'Activity', path: '/studio/activity', icon: 'activity' },
    ],
  },
  {
    id: 'editorial',
    label: 'Editorial',
    items: [
      { label: 'Content', path: '/studio/content', icon: 'content' },
      { label: 'Editorial plan', path: '/studio/editorial-plan', icon: 'plan' },
      { label: 'Calendar', path: '/studio/calendar', icon: 'calendar' },
      { label: 'Editorial engine', path: '/studio/editorial-engine', icon: 'sparkles' },
      { label: 'Sources', path: '/studio/sources', icon: 'sources' },
      { label: 'Competitors', path: '/studio/competitors', icon: 'globe' },
      { label: 'Media', path: '/studio/media', icon: 'media' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { label: 'Competencies', path: '/studio/competencies', icon: 'competency' },
      { label: 'Site intelligence', path: '/studio/site-intelligence', icon: 'scan' },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    items: [
      { label: 'Autopilot', path: '/studio/automation', icon: 'automation' },
      { label: 'System health', path: '/studio/operations', icon: 'operations' },
    ],
  },
  {
    id: 'distribution',
    label: 'Distribution',
    items: [
      { label: 'Publications', path: '/studio/publications', icon: 'publications' },
      { label: 'Publishing', path: '/studio/publishing', icon: 'send' },
      { label: 'Connections', path: '/studio/connections', icon: 'connections' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { label: 'Notifications', path: '/studio/notifications', icon: 'bell' },
      { label: 'Settings', path: '/studio/settings/profile', icon: 'settings' },
    ],
  },
];

/** Longest nav path that prefixes the URL, so /studio/content/new still lights up Content. */
export function activeNavItem(url: string): { group: StudioNavGroup; item: StudioNavItem } | null {
  let best: { group: StudioNavGroup; item: StudioNavItem } | null = null;
  for (const group of STUDIO_NAV) {
    for (const item of group.items) {
      const base = item.path.startsWith('/studio/settings') ? '/studio/settings' : item.path;
      if ((url === base || url.startsWith(base + '/')) && (!best || base.length > best.item.path.length)) {
        best = { group, item };
      }
    }
  }
  return best;
}
