import { STUDIO_NAV, activeNavItem, canSeeNavItem } from './studio-nav';

describe('studio nav (M5)', () => {
  it('lists every route exactly once', () => {
    const paths = STUDIO_NAV.flatMap((group) => group.items.map((item) => item.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('shows Home, Calendar, Articles, Results, then Advanced and Settings at the end', () => {
    const bar = STUDIO_NAV.filter((group) => !group.hidden);
    expect(bar.map((group) => group.label)).toEqual(['Home', 'Calendar', 'Articles', 'Results', 'Advanced', 'Settings']);
    expect(bar.filter((group) => group.end).map((group) => group.id)).toEqual(['advanced', 'settings']);
  });

  it('keeps the specialist tools under Advanced', () => {
    const advanced = STUDIO_NAV.find((group) => group.id === 'advanced')!;
    expect(advanced.items.map((item) => item.label)).toEqual([
      'Site intelligence', 'Competitors', 'Sources', 'Inbox', 'Plan backlog', 'Review queue', 'Media', 'Background jobs',
    ]);
  });

  it('lights up the area of deep links', () => {
    expect(activeNavItem('/studio/content/abc')?.group.id).toBe('articles');
    expect(activeNavItem('/studio/content/new')?.group.id).toBe('articles');
    expect(activeNavItem('/studio/results')?.group.id).toBe('results');
  });

  it('groups settings as business, articles and integrations; team and system only for admins', () => {
    const settings = STUDIO_NAV.find((group) => group.id === 'settings')!;
    expect(settings.items.filter((item) => item.heading).slice(0, 3).map((item) => item.heading)).toEqual(['Business & brand', 'Articles', 'Integrations']);
    const visible = (role: string, platform = false) =>
      settings.items.filter((item) => canSeeNavItem(item, role, platform)).map((item) => item.label);
    for (const role of ['viewer', 'editor']) {
      expect(visible(role)).toEqual(['Sites', 'Mode & rhythm', 'Connections', 'Web discovery', 'Assistant tools']);
    }
    expect(visible('admin')).toEqual(['Sites', 'Mode & rhythm', 'Connections', 'Web discovery', 'Assistant tools', 'People', 'Roles', 'System health']);
    expect(visible('admin', true)).toContain('AI providers');
    expect(visible('admin', true)).toContain('SEO providers');
  });
});
