// Automation modes (Phase 6). A first-class, atomic mode replaces the fragile
// collection of independent boolean switches as the primary automation
// control. The legacy flags are preserved and derived from the mode so
// existing call sites keep working.
//
//   manual    — no autonomous generation, approval or publication.
//   assisted  — AI may generate, repair and rerun QA; human approval is
//               required before publication.
//   autopilot — the full pipeline runs automatically when the strict
//               autonomous quality gate passes.

export type AutomationMode = "manual" | "assisted" | "autopilot";

export const AUTOMATION_MODES: AutomationMode[] = ["manual", "assisted", "autopilot"];

export type AutomationFlagSet = {
  enabled: boolean;
  autoGenerate: boolean;
  autoRepair: boolean;
  autoApprove: boolean;
  autoSchedule: boolean;
  autoPublish: boolean;
};

/**
 * The canonical flag configuration for each mode. Selecting a mode must
 * atomically produce this internally consistent set — contradictory partial
 * states are never allowed.
 */
export const MODE_FLAGS: Record<AutomationMode, AutomationFlagSet> = {
  manual: {
    enabled: false,
    autoGenerate: false,
    autoRepair: false,
    autoApprove: false,
    autoSchedule: false,
    autoPublish: false,
  },
  assisted: {
    enabled: true,
    autoGenerate: true,
    autoRepair: true,
    autoApprove: false,
    // A scheduled row is executable by the scheduler. Assisted mode prepares
    // content for a human release and therefore must not create one.
    autoSchedule: false,
    autoPublish: false,
  },
  autopilot: {
    enabled: true,
    autoGenerate: true,
    autoRepair: true,
    autoApprove: true,
    autoSchedule: true,
    autoPublish: true,
  },
};

export function isAutomationMode(value: unknown): value is AutomationMode {
  return typeof value === "string" && (AUTOMATION_MODES as string[]).includes(value);
}

/**
 * Normalize an arbitrary stored mode value into a valid AutomationMode.
 * Unknown / legacy values are mapped to the closest semantics:
 * anything that used to auto-publish is `autopilot`, anything that used to
 * auto-generate is `assisted`, everything else is `manual`.
 */
export function normalizeAutomationMode(
  mode: unknown,
  flags?: {
    autoGenerate?: boolean | null;
    autoApprove?: boolean | null;
    autoSchedule?: boolean | null;
    autoPublish?: boolean | null;
  },
): AutomationMode {
  if (isAutomationMode(mode)) {
    return mode;
  }
  const autoPublish = flags?.autoPublish === true;
  const autoGenerate = flags?.autoGenerate === true || flags?.autoApprove === true || flags?.autoSchedule === true;
  if (autoPublish) {
    return "autopilot";
  }
  if (autoGenerate) {
    return "assisted";
  }
  return "manual";
}

/**
 * Derive the mode implied by a set of legacy flags. Mirrors the legacy
 * semantics so existing rows keep behaving identically after the mode column
 * is introduced.
 */
export function deriveModeFromFlags(
  autoGenerate: boolean,
  autoApprove: boolean,
  autoSchedule: boolean,
  autoPublish: boolean,
): AutomationMode {
  if (autoPublish) {
    return "autopilot";
  }
  if (autoGenerate || autoApprove || autoSchedule) {
    return "assisted";
  }
  return "manual";
}

export type AutomationModePayload = {
  mode: AutomationMode;
  flags: AutomationFlagSet;
  /** Extra fields only meaningful for autopilot. */
  autopilot?: {
    maxRepairAttempts: number;
    autonomousQaThresholds: Record<string, unknown> | null;
    sourceRequirements: Record<string, unknown> | null;
  };
};

/**
 * Build the atomic, internally consistent policy payload for a mode. The
 * caller applies every returned value in one update so a policy can never
 * persist a contradictory partial state.
 */
export function buildModePayload(
  mode: AutomationMode,
  overrides?: {
    maxRepairAttempts?: number;
    autonomousQaThresholds?: Record<string, unknown> | null;
    sourceRequirements?: Record<string, unknown> | null;
  },
): AutomationModePayload {
  const flags = { ...MODE_FLAGS[mode] };
  return {
    mode,
    flags,
    autopilot:
      mode === "autopilot"
        ? {
            maxRepairAttempts: overrides?.maxRepairAttempts ?? 4,
            autonomousQaThresholds: overrides?.autonomousQaThresholds ?? null,
            sourceRequirements: overrides?.sourceRequirements ?? null,
          }
        : undefined,
  };
}

/** Validate that a stored policy row is internally consistent with its mode. */
export function isConsistentPolicy(policy: {
  mode: string | null;
  enabled: boolean;
  autoGenerate: boolean;
  autoRepair: boolean;
  autoApprove: boolean;
  autoSchedule: boolean;
  autoPublish: boolean;
}): boolean {
  const normalized = normalizeAutomationMode(policy.mode, policy);
  const expected = MODE_FLAGS[normalized];
  return (
    policy.enabled === expected.enabled &&
    policy.autoGenerate === expected.autoGenerate &&
    policy.autoRepair === expected.autoRepair &&
    policy.autoApprove === expected.autoApprove &&
    policy.autoSchedule === expected.autoSchedule &&
    policy.autoPublish === expected.autoPublish
  );
}

/**
 * The safe autopilot configuration applied when a site selects AUTOPILOT.
 * Produces the full, consistent policy expected by the pipeline.
 */
export function safeAutopilotConfig(overrides?: {
  maxRepairAttempts?: number;
  autonomousQaThresholds?: Record<string, unknown>;
  sourceRequirements?: Record<string, unknown>;
}): {
  mode: "autopilot";
  enabled: boolean;
  state: "active";
  autoGenerate: boolean;
  autoRepair: boolean;
  autoApprove: boolean;
  autoSchedule: boolean;
  autoPublish: boolean;
  maxRepairAttempts: number;
  autonomousQaThresholds: Record<string, unknown> | null;
  sourceRequirements: Record<string, unknown> | null;
} {
  return {
    mode: "autopilot",
    enabled: true,
    state: "active",
    autoGenerate: true,
    autoRepair: true,
    autoApprove: true,
    autoSchedule: true,
    autoPublish: true,
    maxRepairAttempts: clampRepairAttempts(overrides?.maxRepairAttempts ?? 4),
    autonomousQaThresholds: overrides?.autonomousQaThresholds ?? null,
    sourceRequirements: overrides?.sourceRequirements ?? null,
  };
}

export function clampRepairAttempts(value: number): number {
  if (!Number.isFinite(value)) {
    return 4;
  }
  return Math.max(0, Math.min(10, Math.round(value)));
}
