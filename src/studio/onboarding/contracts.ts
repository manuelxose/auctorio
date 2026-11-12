/**
 * Shared contract for website editorial onboarding. The orchestrator runs these
 * steps in order inside one durable operation; each subsystem registers its own
 * handler so parallel modules (sources, competitors, ...) stay decoupled.
 * A step without a registered handler is recorded as "skipped", never as done.
 */
export const ONBOARDING_STEPS = ["index", "profile", "sources", "competitors", "strategy", "first_plan_offer"] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export type OnboardingStepContext = {
  tenantId: string;
  siteId: string;
  userId: string | null;
  operationId: string;
};

export type OnboardingStepResult = {
  /** Human-readable outcome shown in the onboarding timeline. */
  summary: string;
  counts?: Record<string, number>;
};

export type OnboardingStepHandler = (context: OnboardingStepContext) => Promise<OnboardingStepResult>;

const handlers = new Map<OnboardingStepId, OnboardingStepHandler>();

export function registerOnboardingStep(id: OnboardingStepId, handler: OnboardingStepHandler): void {
  handlers.set(id, handler);
}

export function getOnboardingStep(id: OnboardingStepId): OnboardingStepHandler | undefined {
  return handlers.get(id);
}
