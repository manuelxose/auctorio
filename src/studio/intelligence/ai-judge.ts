// AI judge (Level 4) — the only place LLM calls may happen in intelligence.
//
// Invoked exclusively for high-value ambiguous candidates and only when
// enabled. Uses the smallest capable model (configurable, never hardcoded).
// The judge never fabricates facts: it only resolves ambiguity that
// deterministic signals could not.

import { getTextProvider, type TextProvider } from "../../infrastructure/ai/text";
import { SOURCE_DATA_RULES, wrapUntrustedContent } from "../prompt-injection";

export type AiJudgeConfig = {
  enabled: boolean;
  /** Model name for the judge; empty → the provider default (small). */
  model?: string | null;
  /** Max judge calls per item (default 1). */
  maxCallsPerItem?: number;
};

export type JudgeInput = {
  question: "merge" | "split";
  itemTitle: string;
  candidateTitles: string[];
  entityNames: string[];
  context: string;
};

export type JudgeVerdict = {
  decision: "merge" | "split" | "unsure";
  confidence: number;
  reasoning: string;
};

export interface AiJudge {
  readonly enabled: boolean;
  judge(input: JudgeInput): Promise<JudgeVerdict>;
}

export class DisabledAiJudge implements AiJudge {
  readonly enabled = false;
  async judge(): Promise<JudgeVerdict> {
    throw new Error("ai_judge_disabled");
  }
}

export class TextAiJudge implements AiJudge {
  readonly enabled = true;
  constructor(
    private readonly provider: TextProvider,
    private readonly model: string | null,
  ) {}

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const untrusted = wrapUntrustedContent(
      "candidate-data",
      [
        `item title: ${input.itemTitle}`,
        "candidate headlines:",
        ...input.candidateTitles.map((title) => `- ${title}`),
        `entities: ${input.entityNames.join(", ") || "(none)"}`,
        `context: ${input.context}`,
      ].join("\n"),
    );
    const prompt = [
      `Question: should this source item be ${input.question === "merge" ? "merged into" : "split from"} the story cluster? Examine the source data block below.`,
      untrusted,
      "Answer with strict JSON: {\"decision\":\"merge|split|unsure\",\"confidence\":0..1,\"reasoning\":\"one short sentence\"}",
    ].join("\n");

    const result = await this.provider.generate({
      prompt,
      systemPrompt: [
        "You resolve story-clustering ambiguity for an editorial pipeline. Be conservative: merge only when the items clearly describe the same story. Never invent facts.",
        SOURCE_DATA_RULES,
      ].join("\n\n"),
      ...(this.model ? { model: this.model } : {}),
      temperature: 0,
      maxTokens: 120,
      responseFormat: { type: "json_object" },
    });

    let parsed: Partial<JudgeVerdict> = {};
    try {
      parsed = JSON.parse(result.output) as Partial<JudgeVerdict>;
    } catch {
      return { decision: "unsure", confidence: 0, reasoning: "unparseable judge output" };
    }
    const decision = parsed.decision === "merge" || parsed.decision === "split" ? parsed.decision : "unsure";
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    return {
      decision,
      confidence,
      reasoning: String(parsed.reasoning ?? "").slice(0, 500),
    };
  }
}

export function createAiJudge(config: AiJudgeConfig): AiJudge {
  if (!config.enabled) {
    return new DisabledAiJudge();
  }
  return new TextAiJudge(getTextProvider(), config.model ?? null);
}

let aiJudgeFactory: ((config: AiJudgeConfig) => AiJudge) | null = null;

/** Override judge construction (tests/simulations inject deterministic
 *  judges without touching the text provider). */
export function setAiJudgeFactory(factory: ((config: AiJudgeConfig) => AiJudge) | null): void {
  aiJudgeFactory = factory;
}

export function getAiJudge(config: AiJudgeConfig): AiJudge {
  if (aiJudgeFactory) {
    return aiJudgeFactory(config);
  }
  return createAiJudge(config);
}
