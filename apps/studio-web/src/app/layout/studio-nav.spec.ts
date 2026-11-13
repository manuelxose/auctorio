import { GUIDED_STEPS, STUDIO_NAV, currentStep, nextStep } from './studio-nav';

describe('studio nav guided process', () => {
  it('lists every route exactly once', () => {
    const paths = STUDIO_NAV.flatMap((group) => group.items.map((item) => item.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('numbers the steps in process order', () => {
    expect(GUIDED_STEPS.map((step) => `${step.number} ${step.item.label}`)).toEqual([
      '1.1 Site intelligence',
      '1.2 Competitors',
      '2.1 Sources',
      '2.2 Inbox',
      '3.1 Editorial plan',
      '4.1 Content',
      '4.2 Review queue',
      '4.3 Media',
      '5.1 Calendar',
      '5.2 Publications',
    ]);
  });

  it('chains each step to the next, across areas', () => {
    expect(nextStep('/studio/overview')?.item.label).toBe('Site intelligence');
    expect(nextStep('/studio/competitors')?.item.label).toBe('Sources');
    expect(nextStep('/studio/editorial-plan')?.item.label).toBe('Content');
    expect(nextStep('/studio/content/abc')?.item.label).toBe('Review queue');
    expect(nextStep('/studio/media')?.item.label).toBe('Calendar');
    expect(nextStep('/studio/publications')).toBeNull();
  });

  it('keeps settings outside the flow', () => {
    expect(currentStep('/studio/settings/sites')).toBeNull();
    expect(nextStep('/studio/connections')).toBeNull();
  });
});
