import type { StudioIconName } from '../components/ui/app-icon.component';

/** Plain-language rules behind the Overview: setup checklist, activity labels and topic badges. */

export type SetupStepId = 'website' | 'learn' | 'plan' | 'autopilot' | 'instagram' | 'x' | 'sources';
export type SetupStep = { id: SetupStepId; label: string; detail: string; done: boolean; required: boolean };

export type SetupFacts = {
  websiteConnected: boolean;
  siteAnalyzed: boolean;
  planReady: boolean;
  autopilotMode: 'manual' | 'assisted' | 'autopilot' | null;
  automationEnabled: boolean;
  instagramConnected: boolean;
  xConnected: boolean;
  sourceCount: number;
};

export function setupSteps(f: SetupFacts): SetupStep[] {
  return [
    { id: 'website', required: true, done: f.websiteConnected, label: 'Connect your website', detail: f.websiteConnected ? 'Articles can be published to it' : 'Paste the address; Auctorio reads it and checks it with a test draft' },
    { id: 'learn', required: true, done: f.siteAnalyzed, label: 'Learn about your site', detail: f.siteAnalyzed ? 'Topics, audience and tone are known' : 'Reads your pages to find topics, audience and tone' },
    { id: 'plan', required: true, done: f.planReady, label: 'Plan the next 30 days', detail: f.planReady ? 'Topics are scheduled' : 'One topic per day, with keyword and the reason it was picked' },
    {
      id: 'autopilot',
      required: true,
      done: f.automationEnabled && f.autopilotMode !== null,
      label: 'Choose how much runs on its own',
      detail: f.automationEnabled && f.autopilotMode ? modeSummary(f.autopilotMode) : 'Write only, write and wait for your approval, or publish on its own',
    },
    { id: 'instagram', required: false, done: f.instagramConnected, label: 'Connect Instagram', detail: 'Each article can become a post' },
    { id: 'x', required: false, done: f.xConnected, label: 'Connect X', detail: 'Share each article as a post' },
    { id: 'sources', required: false, done: f.sourceCount > 0, label: 'Add news sources', detail: f.sourceCount > 0 ? `${f.sourceCount} source${f.sourceCount === 1 ? '' : 's'} feeding the inbox` : 'Feeds and sites the inbox watches for stories' },
  ];
}

export function modeSummary(mode: 'manual' | 'assisted' | 'autopilot'): string {
  return mode === 'autopilot' ? 'Writes and publishes on schedule' : mode === 'assisted' ? 'Writes on schedule, waits for your approval' : 'Writes only when you ask';
}

/** Overall line under the page title. */
export function autopilotHeadline(steps: SetupStep[], state: { enabled: boolean; paused: boolean; pausedReason: string | null; mode: string | null }): { tone: 'ok' | 'warn' | 'idle'; text: string } {
  const missing = steps.filter((step) => step.required && !step.done).length;
  if (missing > 0) return { tone: 'idle', text: `${missing} setup step${missing === 1 ? '' : 's'} left before autopilot can run` };
  if (state.paused) return { tone: 'warn', text: `Paused${state.pausedReason ? `: ${state.pausedReason}` : ''}` };
  if (!state.enabled) return { tone: 'idle', text: 'Automation is off. Articles are written when you ask' };
  if (state.mode === 'autopilot') return { tone: 'ok', text: 'Running on autopilot. Nothing needs you right now' };
  return { tone: 'ok', text: 'Running. New articles wait for your approval' };
}

export function difficultyLabel(score: number | null | undefined): 'Easy' | 'Medium' | 'Hard' | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const value = score <= 1 ? score * 100 : score; // stored as 0–1 or 0–100
  return value < 30 ? 'Easy' : value < 60 ? 'Medium' : 'Hard';
}

const OPERATION_LABELS: Record<string, { icon: StudioIconName; label: string }> = {
  text_generation: { icon: 'content', label: 'Wrote an article' },
  image_generation: { icon: 'media', label: 'Created images' },
  publish: { icon: 'publications', label: 'Published' },
  site_index: { icon: 'scan', label: 'Read your site' },
  editorial_plan_generation: { icon: 'plan', label: 'Planned upcoming topics' },
  connection_verification: { icon: 'connections', label: 'Checked a destination' },
  discovery: { icon: 'sources', label: 'Looked for new stories' },
  quality_repair: { icon: 'refresh', label: 'Fixed quality issues' },
};

export function activityLabel(type: string, status: string): { icon: StudioIconName; label: string; failed: boolean } {
  const known = OPERATION_LABELS[type] ?? { icon: 'activity' as StudioIconName, label: type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) };
  const failed = status === 'failed' || status === 'partial';
  const running = status === 'running' || status === 'queued' || status === 'retrying';
  return { icon: failed ? 'warning' : known.icon, label: failed ? `${known.label} (failed)` : running ? `${known.label} (in progress)` : known.label, failed };
}

export type PlanChip = 'Published' | 'Written' | 'Queued' | 'Needs approval';

/** Status chip for a planned topic in the calendar strip; null hides rejected or cancelled topics. */
export function planChip(item: { status: string; projectId: string | null }, publishedTitles: Set<string>, title: string): PlanChip | null {
  if (item.status === 'rejected' || item.status === 'canceled' || item.status === 'cancelled') return null;
  if (publishedTitles.has(title.trim().toLowerCase())) return 'Published';
  if (item.projectId) return 'Written';
  if (item.status === 'proposed') return 'Needs approval';
  return 'Queued';
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const ERROR_TEXT: Record<string, string> = {
  EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID: 'the model returned a plan that could not be read',
  'This operation was aborted': 'the model took too long to answer',
};

/** Error codes such as SOME_CODE become plain words; free text is kept as it is. */
export function humanError(summary: string | null | undefined): string {
  const text = (summary ?? '').trim();
  if (!text) return '';
  if (ERROR_TEXT[text]) return ERROR_TEXT[text];
  return /^[A-Z0-9_]+$/.test(text) ? text.toLowerCase().replace(/_/g, ' ') : text;
}
