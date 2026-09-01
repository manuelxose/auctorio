// Per-tenant intelligence settings (Phase 3): enabled domains, provider
// precedence, AI-judge policy, level budgets. Configuration lives here so
// precedence rules never leak into business code.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { getEnv } from "../../shared/utils/env";
import { normalizePrecedence, type ProviderPrecedence } from "../enrichment/engine";
import { normalizeLevelPolicy, type LevelPolicy } from "./cost-control";
import type { AiJudgeConfig } from "./ai-judge";

const prisma = getPrismaClient();

export type IntelligenceSettings = {
  enabledDomains: string[];
  /** Empty list means "auto-detect from site profile". */
  domainsAuto: boolean;
  providerPrecedence: ProviderPrecedence;
  aiJudge: AiJudgeConfig;
  levelPolicy: LevelPolicy;
};

export const DEFAULT_ENABLED_DOMAINS: string[] = [];

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String).filter(Boolean);
}

export async function getIntelligenceSettings(tenantId: string): Promise<IntelligenceSettings> {
  const row = await prisma.intelligenceSettings.findUnique({ where: { tenantId } });
  const enabledDomains = row ? readStringList(row.enabledDomains) : DEFAULT_ENABLED_DOMAINS;

  const aiJudgeRaw = (row?.aiJudge ?? {}) as Record<string, unknown>;
  const aiJudge: AiJudgeConfig = {
    enabled:
      typeof aiJudgeRaw.enabled === "boolean"
        ? aiJudgeRaw.enabled
        : getEnv("AI_JUDGE_ENABLED", "false").toLowerCase() === "true",
    model:
      typeof aiJudgeRaw.model === "string" && aiJudgeRaw.model
        ? aiJudgeRaw.model
        : getEnv("INTELLIGENCE_JUDGE_MODEL", "") || null,
    maxCallsPerItem:
      typeof aiJudgeRaw.maxCallsPerItem === "number" ? aiJudgeRaw.maxCallsPerItem : 1,
  };

  return {
    enabledDomains,
    domainsAuto: enabledDomains.length === 0,
    providerPrecedence: normalizePrecedence(row?.providerPrecedence),
    aiJudge,
    levelPolicy: normalizeLevelPolicy(row?.levelPolicy),
  };
}

export type UpdateIntelligenceSettingsInput = {
  enabledDomains?: string[];
  providerPrecedence?: Partial<ProviderPrecedence>;
  aiJudge?: Partial<AiJudgeConfig>;
  levelPolicy?: Partial<LevelPolicy>;
};

export async function updateIntelligenceSettings(
  tenantId: string,
  input: UpdateIntelligenceSettingsInput,
): Promise<IntelligenceSettings> {
  const existing = await prisma.intelligenceSettings.findUnique({ where: { tenantId } });
  const current = await getIntelligenceSettings(tenantId);

  const providerPrecedence = input.providerPrecedence
    ? { ...current.providerPrecedence, ...input.providerPrecedence }
    : current.providerPrecedence;
  const aiJudge = input.aiJudge ? { ...current.aiJudge, ...input.aiJudge } : current.aiJudge;
  const levelPolicy = input.levelPolicy ? { ...current.levelPolicy, ...input.levelPolicy } : current.levelPolicy;
  const enabledDomains = input.enabledDomains ?? current.enabledDomains;

  if (existing) {
    await prisma.intelligenceSettings.update({
      where: { tenantId },
      data: {
        enabledDomains: enabledDomains as Prisma.InputJsonValue,
        providerPrecedence: providerPrecedence as Prisma.InputJsonValue,
        aiJudge: aiJudge as Prisma.InputJsonValue,
        levelPolicy: levelPolicy as Prisma.InputJsonValue,
      },
    });
  } else {
    await prisma.intelligenceSettings.create({
      data: {
        tenantId,
        enabledDomains: enabledDomains as Prisma.InputJsonValue,
        providerPrecedence: providerPrecedence as Prisma.InputJsonValue,
        aiJudge: aiJudge as Prisma.InputJsonValue,
        levelPolicy: levelPolicy as Prisma.InputJsonValue,
      },
    });
  }
  return getIntelligenceSettings(tenantId);
}

/** Auto-detect domains from a site editorial profile (entertainment cues). */
export function autoDetectDomains(profileTopics: string[], profileCategories: string[]): string[] {
  const haystack = [...profileTopics, ...profileCategories].map((entry) => entry.toLowerCase()).join(" ");
  const domains: string[] = [];
  if (
    /\b(movie|movies|film|films|cinema|serie|series|streaming|tv|television|pelicula|peliculas|estrenos)\b/.test(haystack)
  ) {
    domains.push("movie_tv");
  }
  return domains;
}

/** Resolve the effective domain list for a site. */
export function resolveDomainsForSite(
  settings: IntelligenceSettings,
  profileTopics: string[],
  profileCategories: string[],
): string[] {
  if (!settings.domainsAuto) {
    return settings.enabledDomains;
  }
  return autoDetectDomains(profileTopics, profileCategories);
}
