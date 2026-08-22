import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import type { SocialChannel, SocialContentType, SocialEditorialStatus } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getTextProvider } from "../infrastructure/ai/text";
import { writeAudit } from "./audit";
import { buildAssetPublicUrl } from "./orchestration";

const prisma = getPrismaClient();

export const X_POST_LIMIT = 280;
export const X_THREAD_POST_LIMIT = 280;
export const INSTAGRAM_CAPTION_LIMIT = 2200;

export type SocialGenerateRequest = {
  projectId: string;
  versionId: string;
  channels: SocialChannel[];
  threadLength?: number;
  regenerate?: boolean;
};

export type GeneratedSocialPiece = {
  channel: SocialChannel;
  contentType: SocialContentType;
  body: string;
  title: string | null;
  hashtags: string[];
  mentions: string[];
};

// ────────────────────────────────────────────────────────────── Validation

export function extractHashtags(value: string): string[] {
  const matches = value.match(/#[\p{L}\p{N}_]{2,}/gu) ?? [];
  return Array.from(new Set(matches.map((tag) => tag.replace(/[.,!?;:()[\]]+$/, ""))));
}

export function validateSocialPiece(piece: GeneratedSocialPiece): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!piece.body.trim()) {
    errors.push("empty body");
  }
  if (piece.channel === "x" && piece.body.length > X_POST_LIMIT) {
    errors.push(`x post exceeds ${X_POST_LIMIT} characters (${piece.body.length})`);
  }
  if (piece.channel === "instagram" && piece.body.length > INSTAGRAM_CAPTION_LIMIT) {
    errors.push(`instagram caption exceeds ${INSTAGRAM_CAPTION_LIMIT} characters`);
  }
  return { valid: errors.length === 0, errors };
}

// ────────────────────────────────────────────────────────────── Prompt building

function toPlainText(html: string | null | undefined): string {
  if (!html) {
    return "";
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugForHashtags(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

type SocialPromptContext = {
  title: string;
  excerpt: string;
  bodyPlain: string;
  siteName: string;
  language: string;
  articleUrl: string | null;
};

export function buildSocialPrompt(
  channel: SocialChannel,
  contentType: SocialContentType,
  context: SocialPromptContext,
): { systemPrompt: string; userPrompt: string } {
  const locale = context.language === "en" ? "English" : "Spanish";
  const systemPrompts: Record<string, string> = {
    x: `You are a social media editor for ${context.siteName}. You write original, conversational X/Twitter copy in ${locale}.
Rules:
- Never invent facts, numbers or quotes that are not present in the article.
- Short, immediate, natural language. Use a hook.
- Return ONLY valid JSON with the shape {"post": string, "hashtags": string[]}.
- The post must not exceed 280 characters including the URL placeholder [URL].`,
    instagram: `You are a social media editor for ${context.siteName}. You write engaging Instagram captions in ${locale}.
Rules:
- Never invent facts, numbers or quotes that are not present in the article.
- Hook first, useful body, optional CTA, 4-8 hashtags.
- Return ONLY valid JSON with the shape {"caption": string, "hashtags": string[]}.
- The caption must not exceed 2200 characters.`,
  };

  const userPrompts: Record<string, string> = {
    x_post: [
      `Article title: ${context.title}`,
      `Article excerpt: ${context.excerpt}`,
      `Article summary: ${context.bodyPlain.slice(0, 900)}`,
      ``,
      `Write a single X post that promotes this article. End with "[URL]".`,
    ].join("\n"),
    x_thread: [
      `Article title: ${context.title}`,
      `Article: ${context.bodyPlain.slice(0, 1600)}`,
      ``,
      `Write a thread of 3 posts. Each post must be under 280 characters, be self-contained but ordered, and never invent facts.`,
      `Return ONLY valid JSON with the shape {"posts": [{"body": string}, {"body": string}, {"body": string}], "hashtags": string[]}.`,
      `The last post ends with "[URL]".`,
    ].join("\n"),
    instagram_caption: [
      `Article title: ${context.title}`,
      `Article excerpt: ${context.excerpt}`,
      `Article summary: ${context.bodyPlain.slice(0, 900)}`,
      ``,
      `Write an Instagram caption with a hook, a useful summary and a question as CTA. Include 5-7 hashtags inside the JSON hashtags array.`,
    ].join("\n"),
    instagram_story: [
      `Article title: ${context.title}`,
      ``,
      `Write a very short Instagram story overlay copy (max 60 characters) teasing the article. Return ONLY valid JSON: {"overlay": string}.`,
    ].join("\n"),
  };

  return {
    systemPrompt: systemPrompts[channel],
    userPrompt: userPrompts[contentType],
  };
}

// ────────────────────────────────────────────────────────────── JSON parsing

export function extractJsonObject(output: string): Record<string, unknown> | null {
  const trimmed = output.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      // fall through to substring extraction
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseGeneratedSocial(
  channel: SocialChannel,
  contentType: SocialContentType,
  output: string,
): GeneratedSocialPiece[] {
  const parsed = extractJsonObject(output);
  if (channel === "x") {
    if (contentType === "x_thread") {
      const posts = Array.isArray(parsed?.posts) ? parsed.posts : [];
      const hashtags = Array.isArray(parsed?.hashtags) ? parsed.hashtags.map(String) : [];
      return posts
        .map((raw, index): GeneratedSocialPiece | null => {
          const body = typeof raw === "object" && raw !== null ? String((raw as Record<string, unknown>).body ?? "").trim() : String(raw).trim();
          return body
            ? {
                channel: "x",
                contentType: "x_thread",
                body,
                title: null,
                hashtags: index === posts.length - 1 ? hashtags : [],
                mentions: [],
              }
            : null;
        })
        .filter((piece): piece is GeneratedSocialPiece => piece !== null);
    }
    const post = typeof parsed?.post === "string" ? parsed.post.trim() : output.trim();
    return post
      ? [
          {
            channel,
            contentType,
            body: post,
            title: null,
            hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.map(String) : [],
            mentions: [],
          },
        ]
      : [];
  }

  if (contentType === "instagram_story") {
    const overlay = typeof parsed?.overlay === "string" ? parsed.overlay.trim() : output.trim();
    return overlay
      ? [{ channel, contentType, body: overlay, title: null, hashtags: [], mentions: [] }]
      : [];
  }

  const caption = typeof parsed?.caption === "string" ? parsed.caption.trim() : output.trim();
  return caption
    ? [
        {
          channel,
          contentType,
          body: caption,
          title: null,
          hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.map(String) : extractHashtags(caption),
          mentions: [],
        },
      ]
    : [];
}

// ────────────────────────────────────────────────────────────── Generation flow

export async function createSocialGenerationJobs(tenantId: string, input: SocialGenerateRequest): Promise<{ jobId: string; socialContentIds: string[] }> {
  const version = await prisma.contentVersion.findFirst({
    where: { id: input.versionId, tenantId },
    include: { project: { include: { site: true } } },
  });
  if (!version) {
    throw new Error("version_not_found");
  }

  const requested: Array<{ channel: SocialChannel; contentType: SocialContentType; threadPosition?: number }> = [];
  for (const channel of input.channels) {
    if (channel === "x") {
      const threadLength = Math.max(1, Math.min(10, input.threadLength ?? 0));
      if (threadLength <= 1) {
        requested.push({ channel: "x", contentType: "x_post" });
      } else {
        for (let index = 0; index < threadLength; index += 1) {
          requested.push({ channel: "x", contentType: "x_thread", threadPosition: index });
        }
      }
    }
    if (channel === "instagram") {
      requested.push({ channel: "instagram", contentType: "instagram_caption" });
      requested.push({ channel: "instagram", contentType: "instagram_story" });
    }
  }

  if (requested.length === 0) {
    throw new Error("no_channels_requested");
  }

  const created = await prisma.socialContent.createMany({
    data: requested.map((piece) => ({
      tenantId,
      projectId: version.projectId,
      versionId: version.id,
      channel: piece.channel,
      contentType: piece.contentType,
      body: "",
      hashtags: Prisma.JsonNull,
      mentions: Prisma.JsonNull,
      mediaAssetIds: Prisma.JsonNull,
      generationStatus: "queued",
      editorialStatus: "draft",
      threadPosition: piece.threadPosition ?? null,
      metadata: Prisma.JsonNull,
    })),
  });

  if (created.count === 0) {
    throw new Error("social_creation_failed");
  }

  const jobId = crypto.randomUUID();
  const { enqueueSocialJob } = await import("../infrastructure/queue/producer");
  await enqueueSocialJob(jobId, {
    kind: "generate",
    jobId,
    tenantId,
    projectId: version.projectId,
    versionId: version.id,
    threadLength: input.threadLength ?? 1,
  });

  return { jobId, socialContentIds: [] };
}

export async function regenerateSocial(tenantId: string, socialContentId: string): Promise<{ jobId: string } | null> {
  const social = await prisma.socialContent.findFirst({ where: { id: socialContentId, tenantId } });
  if (!social) {
    return null;
  }
  await prisma.socialContent.update({
    where: { id: social.id },
    data: { generationStatus: "queued" },
  });
  const jobId = crypto.randomUUID();
  const { enqueueSocialJob } = await import("../infrastructure/queue/producer");
  await enqueueSocialJob(jobId, {
    kind: "generate",
    jobId,
    tenantId,
    projectId: social.projectId,
    versionId: social.versionId,
    regenerateIds: [social.id],
  });
  return { jobId };
}

export async function updateSocialContent(
  tenantId: string,
  socialContentId: string,
  input: {
    body?: string;
    hashtags?: string[];
    editorialStatus?: SocialEditorialStatus;
    mediaAssetIds?: string[];
  },
) {
  const social = await prisma.socialContent.findFirst({ where: { id: socialContentId, tenantId } });
  if (!social) {
    return null;
  }

  const updated = await prisma.socialContent.update({
    where: { id: social.id },
    data: {
      body: input.body?.trim() ?? undefined,
      hashtags: input.hashtags === undefined ? undefined : input.hashtags.length ? (input.hashtags as Prisma.InputJsonValue) : Prisma.JsonNull,
      editorialStatus: input.editorialStatus,
      mediaAssetIds: input.mediaAssetIds === undefined ? undefined : input.mediaAssetIds.length ? (input.mediaAssetIds as Prisma.InputJsonValue) : Prisma.JsonNull,
      characterCount: input.body ? input.body.trim().length : undefined,
    },
  });

  await writeAudit({
    tenantId,
    action: "social.updated",
    entityType: "social_content",
    entityId: social.id,
    actorType: "user",
  });

  return updated;
}

export async function listSocialContent(tenantId: string, input: { projectId?: string; versionId?: string; channel?: SocialChannel }) {
  return prisma.socialContent.findMany({
    where: {
      tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.versionId ? { versionId: input.versionId } : {}),
      ...(input.channel ? { channel: input.channel } : {}),
    },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
  });
}

// ────────────────────────────────────────────────────────────── Job handler

export type SocialGenerationJobData = {
  jobId: string;
  tenantId: string;
  projectId: string;
  versionId: string;
  threadLength?: number;
  regenerateIds?: string[];
};

export async function runSocialGenerationJob(data: SocialGenerationJobData) {
  const version = await prisma.contentVersion.findFirst({
    where: { id: data.versionId, tenantId: data.tenantId },
    include: { project: { include: { site: true } } },
  });
  if (!version) {
    throw new Error("version_not_found");
  }

  const pending = await prisma.socialContent.findMany({
    where: {
      tenantId: data.tenantId,
      versionId: version.id,
      ...(data.regenerateIds && data.regenerateIds.length > 0
        ? { id: { in: data.regenerateIds } }
        : { generationStatus: "queued" }),
    },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
  });

  if (pending.length === 0) {
    return { generated: 0 };
  }

  const context: SocialPromptContext = {
    title: version.title || version.project.title,
    excerpt: version.excerpt || "",
    bodyPlain: toPlainText(version.bodyHtml).slice(0, 4000),
    siteName: version.project.site.name,
    language: version.project.primaryLanguage,
    articleUrl: null,
  };

  const provider = getTextProvider();
  let generated = 0;

  for (const social of pending) {
    await prisma.socialContent.update({
      where: { id: social.id },
      data: { generationStatus: "processing" },
    });

    try {
      const prompt = buildSocialPrompt(social.channel, social.contentType, context);
      const result = await provider.generate({
        prompt: prompt.userPrompt,
        systemPrompt: prompt.systemPrompt,
        temperature: 0.7,
        maxTokens: 600,
      });

      const pieces = parseGeneratedSocial(social.channel, social.contentType, result.output);
      const piece = pieces[0];
      if (!piece) {
        throw new Error("social_parse_failed");
      }
      const validation = validateSocialPiece(piece);
      if (!validation.valid) {
        throw new Error(`social_validation_failed: ${validation.errors.join("; ")}`);
      }

      await prisma.socialContent.update({
        where: { id: social.id },
        data: {
          body: piece.body,
          hashtags: piece.hashtags.length ? (piece.hashtags as Prisma.InputJsonValue) : Prisma.JsonNull,
          mentions: piece.mentions.length ? (piece.mentions as Prisma.InputJsonValue) : Prisma.JsonNull,
          characterCount: piece.body.length,
          generationStatus: "done",
          editorialStatus: social.editorialStatus === "rejected" ? "draft" : social.editorialStatus,
          metadata: {
            provider: result.provider,
            model: result.model,
            generatedAt: new Date().toISOString(),
          } as Prisma.InputJsonObject,
        },
      });
      generated += 1;
    } catch (error) {
      await prisma.socialContent.update({
        where: { id: social.id },
        data: {
          generationStatus: "failed",
          metadata: { error: error instanceof Error ? error.message : String(error) } as Prisma.InputJsonObject,
        },
      });
    }
  }

  await writeAudit({
    tenantId: data.tenantId,
    action: "social.generated",
    entityType: "content_project",
    entityId: version.projectId,
    actorType: "automation",
    metadata: { versionId: version.id, generated },
  });

  return { generated };
}

export async function socialAssetUrlForVersion(
  versionId: string,
  tenantId: string,
): Promise<string | null> {
  const version = await prisma.contentVersion.findFirst({
    where: { id: versionId, tenantId },
    include: { contentImage: { include: { assetVariants: true } } },
  });
  if (!version?.contentImage?.storagePath) {
    return null;
  }
  const square = version.contentImage.assetVariants.find((variant) => variant.kind === "social_square");
  const target = square ?? version.contentImage.assetVariants.find((variant) => variant.kind === "original") ?? null;
  return buildAssetPublicUrl(target?.storagePath ?? version.contentImage.storagePath);
}
