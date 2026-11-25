import { STUDIO_NAV, activeNavItem, canSeeNavItem, sectionFor } from './studio-nav';

describe('studio nav (M5)', () => {
  it('lists every route exactly once', () => {
    const paths = STUDIO_NAV.flatMap((group) => group.items.map((item) => item.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('groups Artículos and Redes under Publicaciones and Oportunidades under Home', () => {
    const bar = STUDIO_NAV.filter((group) => !group.hidden);
    expect(bar.map((group) => group.label)).toEqual(['Home', 'Calendar', 'Publicaciones', 'Results', 'Advanced', 'Configuración']);
    expect(bar.find((group) => group.id === 'articles')?.items.map((item) => item.label)).toEqual(['Artículos', 'Redes']);
    expect(bar.find((group) => group.id === 'home')?.items.map((item) => item.label)).toContain('Oportunidades');
    expect(bar.filter((group) => group.end).map((group) => group.id)).toEqual(['advanced', 'settings']);
  });

  it('keeps the specialist tools under Advanced', () => {
    const advanced = STUDIO_NAV.find((group) => group.id === 'advanced')!;
    expect(advanced.items.map((item) => item.label)).toEqual([
      'Site Intelligence', 'Oportunidades SEO', 'Investigación SEO', 'Competidores', 'Fuentes', 'Inbox', 'Plan editorial', 'Cola de revisión', 'Biblioteca multimedia', 'Trabajos en segundo plano',
    ]);
  });

  it('lights up the area of deep links', () => {
    expect(activeNavItem('/studio/content/abc')?.group.id).toBe('articles');
    expect(activeNavItem('/studio/content/new')?.group.id).toBe('articles');
    expect(activeNavItem('/studio/results')?.group.id).toBe('results');
    expect(activeNavItem('/studio/social?tab=x')?.group.id).toBe('articles');
    expect(activeNavItem('/studio/opportunities?tab=quora')?.group.id).toBe('home');
    expect(activeNavItem('/studio/settings/social')?.group.id).toBe('settings');
  });

  it('selects the management view independently of the active social channel', () => {
    const path = '/studio/social';
    const sections = activeNavItem(path)?.item.sections;
    expect(sections?.map(({ label }) => label)).toEqual(['Borradores', 'Plantillas', 'Estadísticas']);
    expect(sectionFor(path, 'x', 'templates')).toBe('templates');
    expect(sectionFor(path, 'x', 'calendar')).toBe('');
  });

  it('matches the reference Settings hierarchy and preserves legacy paths', () => {
    const settings = STUDIO_NAV.find((group) => group.id === 'settings')!;
    const visible = (permissions: string[], platform = false) => settings.items
      .filter((item) => item.sidebar !== false && canSeeNavItem(item, permissions, platform)).map((item) => item.label);
    const base = ['Sitios', 'Escritura', 'Modo y ritmo', 'Conexiones', 'Descubrimiento web', 'Herramientas del asistente'];
    expect(visible([])).toEqual(base);
    expect(visible(['users.manage'])).toEqual([...base, 'Personas', 'Roles y permisos']);
    expect(visible(['roles.manage'])).toEqual([...base, 'Roles y permisos']);
    expect(visible(['workspace.manage'])).toEqual([...base, 'Salud del sistema']);
    expect(visible([], true)).toEqual([...base, 'Administración global']);
    expect(settings.items.filter((item) => !item.platformAdminOnly && item.sidebar !== false).flatMap((item) => item.sections ?? []).length).toBe(26);
    expect(STUDIO_NAV.find((group) => group.id === 'advanced')!.items.flatMap((item) => item.sections ?? []).length).toBe(24);
    expect(activeNavItem('/studio/admin/ai')?.item.platformAdminOnly).toBeTrue();
    expect(activeNavItem('/studio/admin/seo')?.item.sections?.map(({ label }) => label)).toContain('Proveedores SEO');
    expect(activeNavItem('/studio/settings/social')?.item.sidebar).toBeFalse();
    expect(sectionFor('/studio/operations', 'workers')).toBe('queues');
    expect(sectionFor('/studio/operations', 'cost')).toBe('costs');
    expect(sectionFor('/studio/sources', 'technical')).toBe('settings');
  });
});
