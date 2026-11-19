import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import type { SocialChannel, SocialContentType, SocialEditorialStatus } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getTextProvider } from "../infrastructure/ai/text";
import { writeAudit } from "./audit";
import { buildAssetPublicUrl } from "./orchestration";
import { getSiteSocialSettings, nextSocialSlot } from "./social-settings";
import { renderSlideImages, type SlideText } from "./social-slides";
import { formatXThread, X_POST_LIMIT, xArticleText, xWeightedLength } from "./social-x";

const prisma = getPrismaClient();

export { X_POST_LIMIT } from "./social-x";
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
  slides?: SlideText[];
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
  if (piece.contentType === "x_post" && xWeightedLength(piece.body) > X_POST_LIMIT) {
    errors.push(`x post exceeds ${X_POST_LIMIT} characters (${xWeightedLength(piece.body)})`);
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
  category?: string;
  brandVoice?: string;
  threadLength?: number;
};

const CATEGORY_HINTS: Record<string, string> = {
  educational: "Educational: teach one clear, practical idea from the article step by step.",
  philosophical: "Philosophical: a reflective angle that makes the reader rethink the topic.",
  myths: "Myths vs facts: bust common misconceptions the article clears up.",
  storytelling: "Storytelling: tell it as a short story with a beginning, tension and payoff.",
};

/** Deterministic pick so regenerations of one article keep the same angle. */
export function pickSocialCategory(categories: string[], seed: string): string {
  if (categories.length === 0) return "educational";
  const hash = crypto.createHash("sha1").update(seed).digest().readUInt32BE(0);
  return categories[hash % categories.length];
}

export function buildSocialPrompt(
  channel: SocialChannel,
  contentType: SocialContentType,
  context: SocialPromptContext,
): { systemPrompt: string; userPrompt: string } {
  const locale = context.language === "en" ? "English" : "Spanish";
  const voice = context.brandVoice ? `\nBrand voice and tone to respect: ${context.brandVoice}` : "";
  const slidesShape = `{"caption": string, "hashtags": string[], "slides": [{"headline": string, "body": string}]}`;
  const slidesTask = [
    `Article title: ${context.title}`,
    `Article excerpt: ${context.excerpt}`,
    `Article: ${context.bodyPlain.slice(0, 2400)}`,
    ``,
    `Angle: ${CATEGORY_HINTS[context.category ?? "educational"] ?? CATEGORY_HINTS.educational}`,
    `Write a carousel of 4-7 slides. Slide 1 is a scroll-stopping headline (max 60 characters) with a short body. Middle slides: headline max 50 characters, body max 180 characters. Do NOT add a closing brand slide; it is added automatically.`,
  ];
  const systemPrompts: Record<string, string> = {
    x: `You are a social media editor for ${context.siteName}. You write original, conversational X/Twitter copy in ${locale}.
Rules:
- Never invent facts, numbers or quotes that are not present in the article.
- Short, immediate, natural language. Use a hook.
- Include at most one relevant hashtag in the copy.
- Output only the JSON shape requested below. Do not write URLs or post numbering.`,
    instagram: `You are a social media editor for ${context.siteName}. You write engaging Instagram captions in ${locale}.
Rules:
- Never invent facts, numbers or quotes that are not present in the article.
- Hook first, useful body, optional CTA, 4-8 hashtags.
- Return ONLY valid JSON with the shape {"caption": string, "hashtags": string[]}.
- The caption must not exceed 2200 characters.
- For carousels return ONLY valid JSON with the shape ${slidesShape}.${voice}`,
    facebook: `You are a social media editor for ${context.siteName}. You write Facebook Page posts in ${locale}.
Rules:
- Never invent facts, numbers or quotes that are not present in the article.
- Conversational hook, 2-4 short paragraphs, a question to spark comments, 0-3 hashtags.
- Return ONLY valid JSON with the shape ${slidesShape}.${voice}`,
  };
  systemPrompts.x += voice;

  const userPrompts: Record<string, string> = {
    x_post: [
      `Article title: ${context.title}`,
      `Article excerpt: ${context.excerpt}`,
      `Article summary: ${context.bodyPlain.slice(0, 900)}`,
      `Angle: ${CATEGORY_HINTS[context.category ?? "educational"] ?? CATEGORY_HINTS.educational}`,
      ``,
      `Write one X post under 250 characters to leave room for the article link. Return {"post": string, "hashtags": string[]}.`,
    ].join("\n"),
    x_thread: [
      `Article title: ${context.title}`,
      `Article: ${context.bodyPlain.slice(0, 1600)}`,
      `Angle: ${CATEGORY_HINTS[context.category ?? "educational"] ?? CATEGORY_HINTS.educational}`,
      ``,
      `Write a thread of ${context.threadLength ?? 3} posts under 240 characters each. Open with a concrete hook. Develop one idea per post in order and end with a reason to read the article.`,
      `Return {"posts": [{"body": string}], "hashtags": string[]}.`,
    ].join("\n"),
    instagram_caption: [
      `Article title: ${context.title}`,
      `Article excerpt: ${context.excerpt}`,
      `Article summary: ${context.bodyPlain.slice(0, 900)}`,
      ``,
      `Write an Instagram caption with a hook, a useful summary and a question as CTA. Include 5-7 hashtags inside the JSON hashtags array.`,
    ].join("\n"),
    instagram_carousel: [...slidesTask, `Caption: hook, useful summary, a question as CTA; 5-7 hashtags in the hashtags array.`].join("\n"),
    facebook_post: [...slidesTask, `Caption: the Facebook post text (max 1500 characters).`].join("\n"),
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
          const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).body : raw;
          const body = typeof value === "string" ? value.trim() : "";
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
  const slides =
    contentType === "instagram_carousel" || contentType === "facebook_post"
      ? (Array.isArray(parsed?.slides) ? parsed.slides : [])
          .map((raw) => {
            const slide = (raw ?? {}) as Record<string, unknown>;
            return { headline: String(slide.headline ?? "").trim(), body: String(slide.body ?? "").trim() };
          })
          .filter((slide) => slide.headline)
          .slice(0, 9)
      : undefined;
  return caption
    ? [
        {
          channel,
          contentType,
          body: caption,
          title: null,
          hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.map(String) : extractHashtags(caption),
          mentions: [],
          ...(slides ? { slides } : {}),
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
  if (!version || version.projectId !== input.projectId) {
    throw new Error("version_not_found");
  }

  const threadLength = input.threadLength ?? 1;
  if (!Number.isInteger(threadLength) || threadLength < 1 || threadLength > 10) {
    throw new Error("invalid_x_thread_length");
  }
  const requested: Array<{ channel: SocialChannel; contentType: SocialContentType }> = [];
  for (const channel of new Set(input.channels)) {
    if (channel === "x") {
      requested.push({ channel, contentType: threadLength === 1 ? "x_post" : "x_thread" });
    }
    if (channel === "instagram") {
      requested.push({ channel: "instagram", contentType: "instagram_carousel" });
      requested.push({ channel: "instagram", contentType: "instagram_story" });
    }
    if (channel === "facebook") {
      requested.push({ channel: "facebook", contentType: "facebook_post" });
    }
  }

  if (requested.length === 0) {
    throw new Error("no_channels_requested");
  }

  const socialContentIds = requested.map(() => crypto.randomUUID());
  const created = await prisma.socialContent.createMany({
    data: requested.map((piece, index) => ({
      id: socialContentIds[index],
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
      metadata: piece.contentType === "x_thread" ? { threadLength } : Prisma.JsonNull,
    })),
  });

  if (created.count === 0) {
    throw new Error("social_creation_failed");
  }

  const jobId = crypto.randomUUID();
  const { enqueueSocialJob } = await import("../infrastructure/queue/producer");
  const { createOperation } = await import("./operations");
  const operation = await createOperation({
    tenantId,
    siteId: version.project.siteId,
    type: "social_generation",
    initiatorUserId: null,
    entityType: "content_version",
    entityId: version.id,
    queueName: "queue_social",
    jobKey: jobId,
  });
  await enqueueSocialJob(jobId, {
    kind: "generate",
    jobId,
    tenantId,
    operationId: operation.id,
    projectId: version.projectId,
    versionId: version.id,
    threadLength,
    socialContentIds,
  });

  return { jobId, socialContentIds };
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
  const { createOperation } = await import("./operations");
  const operation = await createOperation({
    tenantId,
    siteId: null,
    type: "social_generation",
    initiatorUserId: null,
    entityType: "social_content",
    entityId: social.id,
    queueName: "queue_social",
    jobKey: jobId,
  });
  await enqueueSocialJob(jobId, {
    kind: "generate",
    jobId,
    tenantId,
    operationId: operation.id,
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

  if (social.channel === "x" && (input.body !== undefined || input.editorialStatus === "approved")) {
    const body = (input.body ?? social.body).trim();
    if (input.editorialStatus === "approved" && social.generationStatus !== "done") {
      throw new Error("Espera a que termine la generación para aprobar el post.");
    }
    if (!body) throw new Error("El texto de X no puede estar vacío.");
    if (social.contentType === "x_thread" && social.threadPosition === null) {
      if (formatXThread(body).length < 2) throw new Error("Separa al menos dos posts con una línea en blanco.");
    } else if (xWeightedLength(body) > X_POST_LIMIT) {
      throw new Error("El texto del post de X supera el límite de 280 caracteres.");
    }
  }

  const updated = await prisma.socialContent.update({
    where: { id: social.id },
    data: {
      body: input.body?.trim() ?? undefined,
      hashtags: input.hashtags === undefined ? undefined : input.hashtags.length ? (input.hashtags as Prisma.InputJsonValue) : Prisma.JsonNull,
      editorialStatus: input.editorialStatus,
      mediaAssetIds: input.mediaAssetIds === undefined ? undefined : input.mediaAssetIds.length ? (input.mediaAssetIds as Prisma.InputJsonValue) : Prisma.JsonNull,
      characterCount: input.body === undefined ? undefined : social.channel === "x" ? xWeightedLength(input.body.trim()) : input.body.trim().length,
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

/**
 * An approved post gets a delivery record at the site's next slot: `scheduled`
 * (the publication scheduler fires it), or `ready` in manual mode (a human posts it).
 * Thread replies ride on their head post, so only position 0 is scheduled.
 */
export async function scheduleApprovedSocial(tenantId: string, socialContentId: string, now: Date = new Date()) {
  const social = await prisma.socialContent.findFirst({
    where: { id: socialContentId, tenantId, editorialStatus: "approved", generationStatus: "done", OR: [{ threadPosition: null }, { threadPosition: 0 }] },
    include: { project: { select: { siteId: true } } },
  });
  if (!social) return null;
  const siteId = social.project.siteId;
  const settings = await getSiteSocialSettings(tenantId, siteId);
  const account = await prisma.publishingAccount.findFirst({
    where: { tenantId, platform: social.channel, enabled: true, OR: [{ siteId }, { siteId: null }] },
    orderBy: [{ siteId: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    select: { id: true },
  });
  // Without an account the scheduler could only fail; manual posting needs none.
  if (!account && settings.workflow !== "manual") return null;
  const { createPublication } = await import("./publication");
  return createPublication({
    tenantId,
    projectId: social.projectId,
    versionId: social.versionId,
    channel: social.channel,
    accountId: account?.id ?? null,
    siteId,
    socialContentId: social.id,
    scheduledFor: nextSocialSlot(settings, now),
    ...(settings.workflow === "manual" ? { status: "ready" as const } : {}),
  });
}

export async function listSiteSocialContent(tenantId: string, siteId: string, channel?: SocialChannel, postId?: string | null) {
  const items = await prisma.socialContent.findMany({
    where: { tenantId, project: { siteId }, OR: [{ threadPosition: null }, { threadPosition: 0 }], ...(channel ? { channel } : {}), ...(postId ? { id: postId } : {}) },
    include: {
      project: { select: { title: true } },
      publications: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, scheduledFor: true, externalUrl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return items.map(({ project, publications, ...item }) => ({ ...item, projectTitle: project.title, publication: publications[0] ?? null }));
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
  socialContentIds?: string[];
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
        : { generationStatus: "queued", ...(data.socialContentIds ? { id: { in: data.socialContentIds } } : {}) }),
    },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
  });

  if (pending.length === 0) {
    return { generated: 0 };
  }

  const site = version.project.site;
  const settings = await getSiteSocialSettings(data.tenantId, site.id);
  const intelligence = await prisma.siteIntelligenceProfile.findFirst({ where: { siteId: site.id }, select: { editorialTone: true } });
  const brandVoice = [site.brandVoice ? JSON.stringify(site.brandVoice).slice(0, 600) : "", intelligence?.editorialTone ?? ""].filter(Boolean).join(" | ");
  const cover = await prisma.contentVersion.findFirst({
    where: { id: version.id },
    select: { contentImage: { select: { storagePath: true } } },
  });
  const context: SocialPromptContext = {
    category: pickSocialCategory(settings.categories, version.id),
    brandVoice: brandVoice || undefined,
    title: version.title || version.project.title,
    excerpt: version.excerpt || "",
    bodyPlain: toPlainText(version.bodyHtml).slice(0, 4000),
    siteName: version.project.site.name,
    language: version.project.primaryLanguage,
    articleUrl: site.baseUrl ?? null,
  };

  const provider = getTextProvider("social");
  const [articleUrl, xImageUrl] = pending.some((social) => social.channel === "x")
    ? await Promise.all([
        findPublishedArticleUrl(data.tenantId, version.projectId),
        socialAssetUrlForVersion(version.id, data.tenantId),
      ])
    : [null, null];
  let generated = 0;

  for (const social of pending) {
    await prisma.socialContent.update({
      where: { id: social.id },
      data: { generationStatus: "processing" },
    });

    const savedLength = (social.metadata as { threadLength?: number } | null)?.threadLength;
    const threadLength = data.threadLength ?? savedLength ?? 3;
    try {
      const prompt = buildSocialPrompt(social.channel, social.contentType, { ...context, threadLength });
      const result = await provider.generate({
        prompt: prompt.userPrompt,
        systemPrompt: prompt.systemPrompt,
        temperature: 0.7,
        maxTokens: social.contentType === "instagram_carousel" || social.contentType === "facebook_post" || social.contentType === "x_thread" ? 1800 : 600,
      });

      const pieces = parseGeneratedSocial(social.channel, social.contentType, result.output);
      const piece = pieces[social.threadPosition ?? 0];
      if (!piece) {
        throw new Error("social_parse_failed");
      }
      if (piece.contentType === "x_thread" && social.threadPosition === null) {
        if (pieces.length < 2) throw new Error("x_thread_requires_two_posts");
        piece.body = xArticleText(pieces.map(({ body }) => body).join("\n\n"), articleUrl);
        piece.hashtags = pieces.at(-1)?.hashtags ?? [];
        formatXThread(piece.body);
      } else if (piece.contentType === "x_post") {
        piece.body = xArticleText(piece.body, articleUrl);
      }
      const validation = validateSocialPiece(piece);
      if (!validation.valid) {
        throw new Error(`social_validation_failed: ${validation.errors.join("; ")}`);
      }

      let slides: Array<SlideText & { imageUrl: string | null; storagePath: string }> | undefined;
      if (piece.slides) {
        if (piece.slides.length < 1) throw new Error("social_slides_missing");
        // Closing slide is ours, not the model's: brand + article link.
        const all = [...piece.slides, { headline: site.name, body: context.articleUrl ?? "" }];
        const rendered = await renderSlideImages({
          tenantId: data.tenantId,
          socialContentId: social.id,
          slides: all,
          style: {
            fontFamily: settings.fontFamily,
            highlightStyle: settings.highlightStyle,
            imageStyle: settings.imageStyle,
            showBrandMark: settings.showBrandMark,
            brandName: site.name,
            accent: brandAccent(site.brandVoice),
          },
          backgroundStoragePath: cover?.contentImage?.storagePath ?? null,
        });
        slides = all.map((slide, index) => ({ ...slide, ...rendered[index] }));
      }
      // approve/manual leave a draft waiting for a human; auto approves straight away.
      const editorialStatus = settings.workflow === "auto" ? "approved" : social.editorialStatus === "rejected" ? "draft" : social.editorialStatus;
      await prisma.socialContent.update({
        where: { id: social.id },
        data: {
          body: piece.body,
          hashtags: piece.hashtags.length ? (piece.hashtags as Prisma.InputJsonValue) : Prisma.JsonNull,
          mentions: piece.mentions.length ? (piece.mentions as Prisma.InputJsonValue) : Prisma.JsonNull,
          characterCount: piece.channel === "x" ? xWeightedLength(piece.body) : piece.body.length,
          generationStatus: "done",
          editorialStatus,
          mediaAssetIds: slides ? (slides.map((slide) => slide.storagePath) as Prisma.InputJsonValue) : Prisma.JsonNull,
          metadata: {
            provider: result.provider,
            model: result.model,
            generatedAt: new Date().toISOString(),
            category: context.category,
            workflow: settings.workflow,
            ...(piece.contentType === "x_thread" ? { threadLength } : {}),
            ...(piece.channel === "x" && xImageUrl ? { imageUrl: xImageUrl } : {}),
            ...(slides ? { slides } : {}),
          } as Prisma.InputJsonObject,
        },
      });
      if (editorialStatus === "approved") await scheduleApprovedSocial(data.tenantId, social.id);
      generated += 1;
    } catch (error) {
      await prisma.socialContent.update({
        where: { id: social.id },
        data: {
          generationStatus: "failed",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            ...(social.contentType === "x_thread" ? { threadLength } : {}),
          },
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

function brandAccent(brandVoice: unknown): string {
  const value = (brandVoice as { primaryColor?: unknown; accentColor?: unknown } | null) ?? {};
  const color = String(value.accentColor ?? value.primaryColor ?? "");
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#f5b301";
}

export async function findPublishedArticleUrl(tenantId: string, projectId: string): Promise<string | null> {
  const article = await prisma.publication.findFirst({
    where: { tenantId, projectId, channel: "website", status: "published", externalUrl: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { externalUrl: true },
  });
  return article?.externalUrl ?? null;
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
