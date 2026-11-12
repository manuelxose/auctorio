import { activityLabel, humanError, autopilotHeadline, difficultyLabel, planChip, setupSteps } from './overview-model';

const facts = { websiteConnected: false, siteAnalyzed: false, planReady: false, autopilotMode: null, automationEnabled: false, instagramConnected: false, xConnected: false, sourceCount: 0 } as const;

describe('overview model', () => {
  it('requires website, analysis, plan and mode before autopilot', () => {
    const steps = setupSteps({ ...facts });
    expect(steps.filter((s) => s.required).map((s) => s.id)).toEqual(['website', 'learn', 'plan', 'autopilot']);
    expect(autopilotHeadline(steps, { enabled: false, paused: false, pausedReason: null, mode: null }).text).toBe('4 setup steps left before autopilot can run');
  });

  it('reports autopilot running once every required step is done', () => {
    const steps = setupSteps({ ...facts, websiteConnected: true, siteAnalyzed: true, planReady: true, autopilotMode: 'autopilot', automationEnabled: true });
    expect(autopilotHeadline(steps, { enabled: true, paused: false, pausedReason: null, mode: 'autopilot' })).toEqual({ tone: 'ok', text: 'Running on autopilot. Nothing needs you right now' });
    expect(autopilotHeadline(steps, { enabled: true, paused: true, pausedReason: 'publish failures', mode: 'autopilot' }).text).toBe('Paused: publish failures');
  });

  it('bands keyword difficulty stored as 0–1 or 0–100', () => {
    expect(difficultyLabel(0.12)).toBe('Easy');
    expect(difficultyLabel(45)).toBe('Medium');
    expect(difficultyLabel(80)).toBe('Hard');
    expect(difficultyLabel(null)).toBeNull();
  });

  it('labels operations in plain words and flags failures', () => {
    expect(activityLabel('text_generation', 'succeeded')).toEqual({ icon: 'content', label: 'Wrote an article', failed: false });
    expect(activityLabel('publish', 'failed').label).toBe('Published (failed)');
    expect(activityLabel('custom_thing', 'running').label).toBe('Custom thing (in progress)');
  });

  it('derives the calendar chip of a planned topic', () => {
    const published = new Set(['best series']);
    expect(planChip({ status: 'approved', projectId: null }, published, 'Other')).toBe('Queued');
    expect(planChip({ status: 'proposed', projectId: null }, published, 'Other')).toBe('Needs approval');
    expect(planChip({ status: 'approved', projectId: 'p' }, published, 'Other')).toBe('Written');
    expect(planChip({ status: 'approved', projectId: 'p' }, published, 'Best series')).toBe('Published');
    expect(planChip({ status: 'rejected', projectId: null }, published, 'x')).toBeNull();
  });

  it('turns error codes into plain words', () => {
    expect(humanError('EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID')).toBe('the model returned a plan that could not be read');
    expect(humanError('PROVIDER_TIMEOUT')).toBe('provider timeout');
    expect(humanError('Socket closed')).toBe('Socket closed');
  });
});
