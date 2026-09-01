// Publication gates (Phase 4). The automation policy flags autoGenerate /
// autoApprove / autoSchedule / autoPublish are respected, and autoPublish
// additionally requires configurable quality gates. The gates never bypass
// the policy: a decision of auto_publish is only recorded (and acted on)
// when the policy allows it.

import type {
  EditorialQaReport,
  PublicationDecision,
  PublicationGateResult,
  PublicationGatesConfig,
} from "./types";

export const DEFAULT_PUBLICATION_GATES: PublicationGatesConfig = {
  minQaScore: 75,
  allowUnsupportedClaims: false,
  allowCopyrightWarning: false,
  minSourceGroups: 1,
  minSiteMatch: 0.5,
  requireHumanApproval: true,
};

export type GatesInput = {
  qa: EditorialQaReport;
  /** Raw config JSON from AutomationPolicy.qaGates. */
  configJson: Record<string, unknown> | null;
  policy: {
    autoGenerate: boolean;
    autoApprove: boolean;
    autoSchedule: boolean;
    autoPublish: boolean;
  };
  /** Distinct publisher groups behind the used facts. */
  sourceGroups: number;
  /** Site-fit score from the cluster (0..1, may be null). */
  siteFitScore: number | null;
  /** Whether a copyright warning is present. */
  copyrightWarning: boolean;
};

export function resolveGatesConfig(configJson: Record<string, unknown> | null): PublicationGatesConfig {
  const base: PublicationGatesConfig = { ...DEFAULT_PUBLICATION_GATES };
  if (!configJson || typeof configJson !== "object") {
    return base;
  }
  const autoPublish = (configJson.autoPublish ?? {}) as Record<string, unknown>;
  return {
    minQaScore: typeof autoPublish.minQaScore === "number" ? autoPublish.minQaScore : base.minQaScore,
    allowUnsupportedClaims:
      typeof autoPublish.allowUnsupportedClaims === "boolean" ? autoPublish.allowUnsupportedClaims : base.allowUnsupportedClaims,
    allowCopyrightWarning:
      typeof autoPublish.allowCopyrightWarning === "boolean" ? autoPublish.allowCopyrightWarning : base.allowCopyrightWarning,
    minSourceGroups: typeof autoPublish.minSourceGroups === "number" ? autoPublish.minSourceGroups : base.minSourceGroups,
    minSiteMatch: typeof autoPublish.minSiteMatch === "number" ? autoPublish.minSiteMatch : base.minSiteMatch,
    requireHumanApproval:
      typeof autoPublish.requireHumanApproval === "boolean" ? autoPublish.requireHumanApproval : base.requireHumanApproval,
  };
}

export function evaluatePublicationGates(input: GatesInput): PublicationDecision {
  const config = resolveGatesConfig(input.configJson);
  const gates: PublicationGateResult[] = [];
  const reasons: string[] = [];
  const { qa } = input;

  // Policy chain: autoPublish requires the full automation chain.
  if (!input.policy.autoGenerate) {
    gates.push({ key: "policy_auto_generate", label: "Policy: autoGenerate enabled", passed: false, detail: "autoGenerate is disabled on the automation policy." });
    reasons.push("policy.autoGenerate is disabled");
  } else {
    gates.push({ key: "policy_auto_generate", label: "Policy: autoGenerate enabled", passed: true, detail: "autoGenerate is enabled." });
  }
  if (!input.policy.autoApprove) {
    gates.push({ key: "policy_auto_approve", label: "Policy: autoApprove enabled", passed: false, detail: "autoApprove is disabled." });
    reasons.push("policy.autoApprove is disabled");
  } else {
    gates.push({ key: "policy_auto_approve", label: "Policy: autoApprove enabled", passed: true, detail: "autoApprove is enabled." });
  }
  if (!input.policy.autoSchedule) {
    gates.push({ key: "policy_auto_schedule", label: "Policy: autoSchedule enabled", passed: false, detail: "autoSchedule is disabled." });
    reasons.push("policy.autoSchedule is disabled");
  } else {
    gates.push({ key: "policy_auto_schedule", label: "Policy: autoSchedule enabled", passed: true, detail: "autoSchedule is enabled." });
  }
  if (!input.policy.autoPublish) {
    gates.push({ key: "policy_auto_publish", label: "Policy: autoPublish enabled", passed: false, detail: "autoPublish is disabled." });
    reasons.push("policy.autoPublish is disabled");
  } else {
    gates.push({ key: "policy_auto_publish", label: "Policy: autoPublish enabled", passed: true, detail: "autoPublish is enabled." });
  }

  // Quality gates.
  const qaScorePass = qa.score >= config.minQaScore;
  gates.push({
    key: "qa_score",
    label: `QA score ≥ ${config.minQaScore}`,
    passed: qaScorePass,
    detail: `QA score is ${qa.score}.`,
  });
  if (!qaScorePass) {
    reasons.push(`qa score ${qa.score} below threshold ${config.minQaScore}`);
  }

  const noCriticalPass = qa.criticalUnsupportedClaims.length === 0;
  gates.push({
    key: "no_critical_unsupported",
    label: "No critical unsupported claims",
    passed: noCriticalPass,
    detail: noCriticalPass ? "No critical unsupported factual claims." : `${qa.criticalUnsupportedClaims.length} critical unsupported claim(s).`,
  });
  if (!noCriticalPass) {
    reasons.push("critical unsupported factual claims present");
  }

  const copyrightPass = !input.copyrightWarning || config.allowCopyrightWarning;
  gates.push({
    key: "no_copyright_warning",
    label: "No copyright warning",
    passed: copyrightPass,
    detail: input.copyrightWarning ? "A copyright warning is present." : "No copyright warning.",
  });
  if (!copyrightPass) {
    reasons.push("copyright warning present");
  }

  const diversityPass = input.sourceGroups >= config.minSourceGroups;
  gates.push({
    key: "source_verification",
    label: `Minimum source verification (≥${config.minSourceGroups} group)`,
    passed: diversityPass,
    detail: `${input.sourceGroups} distinct publisher group(s) behind the facts.`,
  });
  if (!diversityPass) {
    reasons.push(`source diversity ${input.sourceGroups} below minimum ${config.minSourceGroups}`);
  }

  const siteMatch = input.siteFitScore ?? 0.5;
  const siteMatchPass = siteMatch >= config.minSiteMatch;
  gates.push({
    key: "site_match",
    label: `Site match ≥ ${config.minSiteMatch}`,
    passed: siteMatchPass,
    detail: `Site-fit score is ${siteMatch}.`,
  });
  if (!siteMatchPass) {
    reasons.push(`site match ${siteMatch} below threshold ${config.minSiteMatch}`);
  }

  const approvalGate = config.requireHumanApproval;
  gates.push({
    key: "human_approval",
    label: "Human approval required",
    passed: !approvalGate,
    detail: approvalGate ? "Configuration requires human approval before publication." : "Human approval not required.",
  });
  if (approvalGate) {
    reasons.push("configuration requires human approval");
  }

  // Decision ladder.
  //
  // The quality gates (QA score, source verification, site match) gate
  // AUTO-publishing: when automation is enabled they produce `hold` and
  // when the full policy chain is off every result goes to human `review`
  // with the gate evidence visible in Studio.
  let decision: PublicationDecision["decision"];
  const hardFails = !noCriticalPass || !copyrightPass;
  const qualityFails = !qaScorePass || !diversityPass || !siteMatchPass;
  const policyBlocks =
    !input.policy.autoGenerate || !input.policy.autoApprove || !input.policy.autoSchedule || !input.policy.autoPublish;

  if (hardFails) {
    decision = "reject";
  } else if (policyBlocks) {
    decision = "review";
  } else if (approvalGate) {
    decision = "review";
  } else if (qualityFails) {
    decision = "hold";
  } else {
    decision = "auto_publish";
  }

  return {
    decision,
    gates,
    config: { ...config },
    reasons,
  };
}
