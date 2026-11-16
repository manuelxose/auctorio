export type AutomationMode = 'manual' | 'assisted' | 'autopilot';

/** Mirror of MODE_FLAGS in src/studio/automation-mode.ts (backend is authoritative; tests/studio-mode-contract keeps them equal). */
export const MODE_FLAGS: Record<AutomationMode, { enabled: boolean; autoGenerate: boolean; autoRepair: boolean; autoApprove: boolean; autoSchedule: boolean; autoPublish: boolean }> = {
  manual: { enabled: false, autoGenerate: false, autoRepair: false, autoApprove: false, autoSchedule: false, autoPublish: false },
  assisted: { enabled: true, autoGenerate: true, autoRepair: true, autoApprove: false, autoSchedule: false, autoPublish: false },
  autopilot: { enabled: true, autoGenerate: true, autoRepair: true, autoApprove: true, autoSchedule: true, autoPublish: true },
};
