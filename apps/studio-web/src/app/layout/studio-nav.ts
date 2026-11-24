import type { StudioIconName } from '../components/ui/app-icon.component';

export type StudioNavItem = {
  label: string;
  path: string;
  icon: StudioIconName;
  platformAdminOnly?: boolean;
  sidebar?: false;
  /** At least one of these effective workspace permissions is required. */
  permissions?: readonly string[];
  /** Small label shown above this item in the sidebar. */
  heading?: string;
  /** One line: what the user does here. Shown as the item's tooltip. */
  hint?: string;
  /** Sections of the page listed under the item. The first is the default. */
  sections?: StudioNavSection[];
};
export type StudioNavSection = { id: string; label: string; queryParam?: 'view'; path?: string; aliases?: readonly string[] };
export const SOCIAL_SECTIONS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'x', label: 'X' },
] satisfies Array<{ id: 'instagram' | 'x'; label: string }>;

export const SOCIAL_VIEWS = [
  { id: 'drafts', label: 'Borradores', queryParam: 'view' },
  { id: 'templates', label: 'Plantillas', queryParam: 'view' },
  { id: 'stats', label: 'Estadísticas', queryParam: 'view' },
] as const satisfies readonly StudioNavSection[];

export const OPPORTUNITY_SECTIONS = [
  { id: 'reddit', label: 'Reddit' },
  { id: 'quora', label: 'Quora' },
] as const;

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
 * Studio information architecture: Home · Calendar · Publicaciones · Results ·
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
      { label: 'Oportunidades', path: '/studio/opportunities', icon: 'message', sections: [...OPPORTUNITY_SECTIONS] },
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
    label: 'Publicaciones',
    icon: 'content',
    items: [
      { label: 'Artículos', path: '/studio/content', icon: 'content', hint: 'Consulta, aprueba y publica los artículos de la web.' },
      { label: 'Redes', path: '/studio/social', icon: 'share', sections: [...SOCIAL_VIEWS], hint: 'Consulta y programa publicaciones de Instagram y X.' },
    ],
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
        label: 'Site Intelligence', path: '/studio/site-intelligence', icon: 'scan', heading: 'Conocimiento del sitio',
        sections: [
          { id: 'profile', label: 'Perfil y estrategia' },
          { id: 'pillars', label: 'Pilares y brechas' },
          { id: 'seo', label: 'Señales SEO' },
          { id: 'crawl', label: 'Páginas y rastreo' },
        ],
      },
      {
        label: 'Competidores', path: '/studio/competitors', icon: 'globe', heading: 'Investigación',
        sections: [
          { id: 'shortlist', label: 'Competidores' },
          { id: 'coverage', label: 'Cobertura temática' },
          { id: 'opportunities', label: 'Oportunidades' },
        ],
      },
      {
        label: 'Fuentes', path: '/studio/sources', icon: 'sources',
        sections: [
          { id: 'sources', label: 'Fuentes activas', aliases: ['active'] },
          { id: 'recommendations', label: 'Recomendadas', aliases: ['recommended'] },
          { id: 'add', label: 'Añadir fuente' },
          { id: 'evidence', label: 'Evidencias' },
          { id: 'settings', label: 'Diagnósticos y paquetes', aliases: ['technical'] },
        ],
      },
      {
        label: 'Inbox', path: '/studio/inbox', icon: 'inbox',
        sections: [{ id: 'inbox', label: 'Historias', aliases: ['stories'] }, { id: 'clusters', label: 'Clústeres' }],
      },
      {
        label: 'Plan editorial', path: '/studio/plan', icon: 'plan', heading: 'Producción',
        sections: [{ id: 'backlog', label: 'Backlog' }, { id: 'pipeline', label: 'Pipeline' }],
      },
      {
        label: 'Cola de revisión', path: '/studio/review-queue', icon: 'sparkles',
        sections: [{ id: 'pending', label: 'Pendientes' }, { id: 'history', label: 'Historial' }],
      },
      {
        label: 'Biblioteca multimedia', path: '/studio/media', icon: 'media',
        sections: [{ id: 'all', label: 'Todos los recursos' }, { id: 'failed', label: 'Con errores' }, { id: 'unused', label: 'Sin utilizar' }],
      },
      {
        label: 'Trabajos en segundo plano', path: '/studio/activity', icon: 'activity', heading: 'Operaciones',
        sections: [{ id: 'active', label: 'En curso' }, { id: 'history', label: 'Historial' }, { id: 'failed', label: 'Fallidos' }],
      },
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
    label: 'Configuración',
    icon: 'settings',
    end: true,
    items: [
      {
        label: 'Sitios', path: '/studio/settings/sites', icon: 'globe', heading: 'Negocio y contenido',
        sections: [{ id: 'list', label: 'Sitios y destinos' }, { id: 'defaults', label: 'Identidad del sitio' }],
      },
      {
        label: 'Escritura', path: '/studio/settings/writing', icon: 'edit',
        sections: [
          { id: 'rules', label: 'Instrucciones' },
          { id: 'structure', label: 'Estructura y enlaces' },
          { id: 'visuals', label: 'Visuales' },
          { id: 'ctas', label: 'Llamadas a la acción' },
          { id: 'business', label: 'Negocio y ofertas' },
          { id: 'brand', label: 'Marca y aviso' },
        ],
      },
      {
        label: 'Modo y ritmo', path: '/studio/automation', icon: 'automation', heading: 'Automatización e integraciones',
        sections: [{ id: 'mode', label: 'Modos de trabajo' }, { id: 'plan', label: 'Plan del mes' }, { id: 'schedule', label: 'Calendario y volumen' }, { id: 'safety', label: 'Seguridad y recuperación' }],
      },
      {
        label: 'Conexiones', path: '/studio/connections', icon: 'connections',
        sections: [{ id: 'dest', label: 'Destinos' }, { id: 'status', label: 'Verificación y credenciales' }],
      },
      {
        label: 'Descubrimiento web', path: '/studio/settings/discovery', icon: 'sources',
        sections: [{ id: 'policy', label: 'Política' }, { id: 'quality', label: 'Calidad y límites' }],
      },
      {
        label: 'Herramientas del asistente', path: '/studio/competencies', icon: 'competency',
        sections: [{ id: 'tools', label: 'Competencias' }, { id: 'runs', label: 'Ejecuciones' }],
      },
      {
        label: 'Personas', path: '/studio/settings/team', icon: 'user', heading: 'Equipo y seguridad', permissions: ['users.manage'],
        sections: [{ id: 'members', label: 'Miembros' }, { id: 'invites', label: 'Invitaciones' }],
      },
      {
        label: 'Roles y permisos', path: '/studio/settings/roles', icon: 'lock', heading: 'Equipo y seguridad', permissions: ['roles.manage', 'users.manage'],
        sections: [{ id: 'library', label: 'Roles del workspace' }, { id: 'matrix', label: 'Matriz de permisos' }, { id: 'simulate', label: 'Simular acceso' }],
      },
      {
        label: 'Salud del sistema', path: '/studio/operations', icon: 'operations', heading: 'Administración', permissions: ['workspace.manage'],
        sections: [
          { id: 'overview', label: 'Estado general', aliases: ['production', 'failures', 'audit'] },
          { id: 'queues', label: 'Workers y colas', aliases: ['workers'] },
          { id: 'costs', label: 'Presupuestos y costes', aliases: ['cost'] },
        ],
      },
      {
        label: 'Administración global', path: '/studio/admin', icon: 'settings', heading: 'Administración', platformAdminOnly: true,
        sections: [
          { id: 'tenants', label: 'Workspaces', path: '/studio/admin/workspaces' },
          { id: 'providers', label: 'Proveedores IA', path: '/studio/admin/ai' },
          { id: 'seo', label: 'Proveedores SEO', path: '/studio/admin/seo' },
          { id: 'usage', label: 'Uso global', path: '/studio/admin/overview' },
        ],
      },
      { label: 'Ajustes de redes', path: '/studio/settings/social', icon: 'share', sidebar: false },
    ],
  },
];

export function canSeeNavItem(item: StudioNavItem, permissions: readonly string[], isPlatformAdmin = false): boolean {
  return (!item.permissions || item.permissions.some((permission) => permissions.includes(permission))) &&
    (!item.platformAdminOnly || isPlatformAdmin);
}

/** Longest nav path that prefixes the URL, so /studio/content/new still lights up Articles. */
export function activeNavItem(url: string): { group: StudioNavGroup; item: StudioNavItem } | null {
  const path = url.split(/[?#]/, 1)[0];
  let best: { group: StudioNavGroup; item: StudioNavItem } | null = null;
  for (const group of STUDIO_NAV) {
    for (const item of group.items) {
      const base = item.path;
      if ((path === base || path.startsWith(base + '/')) && (!best || base.length > best.item.path.length)) {
        best = { group, item };
      }
    }
  }
  return best;
}

export function sectionFor(path: string, tab: string | null | undefined, view?: string | null): string {
  const sections = STUDIO_NAV.flatMap((group) => group.items).find((item) => item.path === path)?.sections ?? [];
  return sections.find((section) => section.queryParam === 'view' && section.id === view)?.id
    ?? sections.find((section) => !section.queryParam && (section.id === tab || (tab && section.aliases?.includes(tab))))?.id
    ?? sections.find((section) => !section.queryParam)?.id ?? '';
}
