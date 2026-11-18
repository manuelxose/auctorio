import crypto from "node:crypto";
import { Prisma, type ContentProject, type DerivativeType, type Site } from "@prisma/client";
import { enqueueImageJob } from "../infrastructure/queue/producer";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getContentTypeFromPath } from "../shared/utils/mime";
import { getPublicBaseUrl } from "../shared/utils/env";
import { attachImageToVersion, createQueuedImage, ensureProjectTopic, findVersionByImageId, findVersionByTextId, getContentImageById, getContentTextById, replaceDerivatives, updateProjectStatus, updateVersionFromText, updateVersionQa } from "./repository";
import { runVersionQaV2 } from "./qa";
import { INLINE_IMAGE_MIN, filledInlineSlots, h2Headings, headingIndexForSlot, inlineAlt, inlineFigureHtml, inlineImageHash, insertInlineFigure, parseInlineImageHash } from "./inline-images";
import { resolveBrandSettings, resolveVisualSettings } from "./editorial-engine/structure";
import { crawlBrand, withCrawledBrand } from "./brand-colors";
import { INFOGRAPHIC_PROMPT_PREFIX, infographicSection } from "./editorial-engine/visuals";
import { createOperation } from "./operations";
import type { GeneratedDerivative, StudioVersionDerivation } from "./types";

const prisma = getPrismaClient();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown, key: string): number | null {
  const record = asRecord(value);
  const entry = record[key];
  return typeof entry === "number" && Number.isFinite(entry) ? entry : null;
}

function readString(value: unknown, key: string): string | null {
  const record = asRecord(value);
  const entry = record[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function toHtml(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block, index) => {
      if (block.startsWith("# ")) {
        return `<h1>${block.slice(2).trim()}</h1>`;
      }
      if (block.startsWith("## ")) {
        return `<h2>${block.slice(3).trim()}</h2>`;
      }
      if (index === 0) {
        return `<p>${block}</p>`;
      }
      return `<p>${block}</p>`;
    })
    .join("\n");
}

export function stripLeadingDuplicateTitle(html: string, title: string): string {
  const match = html.match(/^([^<]*)(.*)$/s);
  if (!match || !match[1].trim()) {
    return html;
  }
  const prefix = match[1].trim();
  if (prefix.length < 20 || prefix.length > 220) {
    return html;
  }
  const normalized = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const titleNorm = normalized(title);
  const prefixNorm = normalized(prefix);
  if (!titleNorm || !prefixNorm) {
    return html;
  }
  if (titleNorm.includes(prefixNorm) || prefixNorm.includes(titleNorm)) {
    return match[2].trimStart();
  }
  return html;
}

function deriveVersion(text: string, project: ContentProject): StudioVersionDerivation {
  const normalized = text.trim();
  let html = /<h\d|<p|<ul|<ol/i.test(normalized) ? normalized : toHtml(normalized);
  html = stripLeadingDuplicateTitle(html, project.title);
  const plain = stripHtml(html);
  const title = project.title.trim() || plain.split(/[.!?\n]/)[0] || "Contenido generado";

  return {
    title: truncate(title, 70),
    excerpt: truncate(plain, 220),
    bodyHtml: html,
    seoTitle: truncate(title, 60),
    seoDescription: truncate(plain, 155),
  };
}

function makeDerivative(type: DerivativeType, title: string, body: string): GeneratedDerivative {
  return { type, title, body };
}

function buildDerivatives(derived: StudioVersionDerivation, site: Site): GeneratedDerivative[] {
  const plain = stripHtml(derived.bodyHtml);
  return [
    makeDerivative(
      "newsletter_subject",
      "Newsletter subject",
      truncate(`${derived.title} | ${site.name}`, 70),
    ),
    makeDerivative(
      "newsletter_intro",
      "Newsletter intro",
      truncate(`${derived.excerpt} Lee la pieza completa en ${site.name}.`, 220),
    ),
    makeDerivative(
      "social_post",
      "Social post",
      truncate(`${derived.title}\n\n${derived.excerpt}\n\n#${site.key} #contentstudio`, 280),
    ),
    makeDerivative(
      "social_caption",
      "Social caption",
      truncate(`${derived.excerpt} ${site.name}`, 200),
    ),
    makeDerivative(
      "social_thread",
      "Social thread",
      truncate(`${derived.title}: ${plain}`, 500),
    ),
  ];
}

export async function buildAssetPublicUrl(relativePath: string | null | undefined): Promise<string | null> {
  if (!relativePath) {
    return null;
  }
  return `${getPublicBaseUrl()}/assets/${relativePath.replace(/^\/+/, "")}`;
}

/** True while the project's latest version is still being written: a second run would fork a parallel version. */
export async function isProjectGenerationInFlight(tenantId: string, projectId: string): Promise<boolean> {
  const activeJob = await prisma.productionJob.findFirst({ where: { tenantId, projectId, status: { in: ["queued", "running"] }, updatedAt: { gte: new Date(Date.now() - 30 * 60_000) } }, select: { id: true } });
  if (activeJob) return true;
  const latest = await prisma.contentVersion.findFirst({
    where: { tenantId, projectId },
    orderBy: { versionNumber: "desc" },
    select: { contentText: { select: { status: true, updatedAt: true } } },
  });
  const text = latest?.contentText;
  // A text untouched for 30 min is a lost job, not a live one: let the user regenerate.
  const fresh = Boolean(text && Date.now() - text.updatedAt.getTime() < 30 * 60_000);
  return fresh && (text?.status === "queued" || text?.status === "processing");
}

export async function requestImageGenerationForVersion(
  tenantId: string,
  versionId: string,
  promptPresetVersionId?: string | null,
) {
  const version = await prisma.contentVersion.findFirst({
    where: { id: versionId, tenantId },
    include: { project: { include: { site: true } }, contentText: true },
  });
  if (!version) {
    throw new Error("version_or_topic_not_found");
  }
  // Production-pipeline projects are created without a topic; images hang off one.
  const topicId = version.project.topicId ?? (await ensureProjectTopic(tenantId, version.project.id, version.project.title, version.project.brief ?? ""));

  const textId = version.contentTextId ?? null;
  const contentImage = await createQueuedImage(tenantId, topicId, textId);
  await attachImageToVersion(version.id, contentImage.id);
  const imageJob = await prisma.job.create({
    data: {
      tenantId,
      type: "image",
      status: "queued",
    },
  });

  const projectMetadata =
    version.project.metadata && typeof version.project.metadata === "object" && !Array.isArray(version.project.metadata)
      ? (version.project.metadata as Record<string, unknown>)
      : {};

  const operation = await createOperation({
    tenantId,
    siteId: version.project.siteId,
    type: "image_generation",
    initiatorUserId: null,
    entityType: "content_version",
    entityId: version.id,
    queueName: "queue_image",
    jobKey: imageJob.id,
    metadata: { mode: textId ? "contextual" : "independent" },
  });

  await enqueueImageJob(imageJob.id, {
    jobId: imageJob.id,
    tenantId,
    operationId: operation.id,
    topicId,
    contentImageId: contentImage.id,
    mode: textId ? "contextual" : "independent",
    textId: textId ?? undefined,
    options: {
      ...projectMetadata,
      site_id: version.project.siteId,
      goal: version.project.goal,
      site_name: version.project.site?.name ?? undefined,
      promptPresetVersionId: promptPresetVersionId ?? undefined,
      ...(await visualImageOptions(version.project.siteId, "cover")),
    },
  });

  return contentImage.id;
}

/** Site visuals settings for one image job: its style and the site's image instructions (M6). */
async function visualImageOptions(siteId: string, role: "cover" | "body"): Promise<Record<string, string>> {
  const settings = await prisma.sitePlanningSettings.findUnique({ where: { siteId }, select: { articleTargets: true } });
  const visuals = resolveVisualSettings(settings?.articleTargets);
  // Brand palette (Settings › Branding, else crawled from the site) so images match the cards and the site.
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { tenantId: true, baseUrl: true } });
  const brand = withCrawledBrand(resolveBrandSettings(settings?.articleTargets), site ? await crawlBrand(site.tenantId, site.baseUrl) : null);
  const palette = [brand.primaryColor, brand.secondaryColor].filter(Boolean).join(", ");
  return { image_style: role === "cover" ? visuals.coverStyle : visuals.bodyStyle, image_instructions: visuals.imageInstructions, ...(palette ? { brand_colors: palette } : {}) };
}

/**
 * «Use only my media library» (M6): fills the missing inline slots with finished images of the same site, best
 * word overlap between their prompt and the section first, never one already in the body. Returns the slots filled.
 */
async function fillSlotsFromLibrary(
  tenantId: string,
  version: { id: string; bodyHtml: string | null; title: string | null; project: { siteId: string; title: string; metadata: unknown } },
  slots: number[],
): Promise<number> {
  const library = await prisma.contentImage.findMany({
    where: { tenantId, status: "done", storagePath: { not: null }, topic: { projects: { some: { siteId: version.project.siteId } } } },
    include: { assetVariants: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  let body = version.bodyHtml ?? "";
  const headings = h2Headings(body);
  const keyword = readString(version.project.metadata, "primaryKeyword");
  const words = (value: string) => new Set(value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\W+/).filter((word) => word.length > 3));
  let filled = 0;
  for (const slot of slots) {
    const section = headings[headingIndexForSlot(slot, headings.length)] ?? version.title ?? version.project.title;
    const wanted = words(`${section} ${keyword ?? ""}`);
    const ranked = library
      .filter((image) => !body.includes(image.id))
      .map((image) => ({ image, score: [...words(image.prompt ?? "")].filter((word) => wanted.has(word)).length }))
      .sort((a, b) => b.score - a.score);
    const pick = ranked[0]?.image;
    if (!pick) break;
    const variant = pick.assetVariants.find((item) => item.kind === "hero") ?? pick.assetVariants.find((item) => item.kind === "original");
    const src = await buildAssetPublicUrl(variant?.storagePath ?? pick.storagePath);
    if (!src) continue;
    body = insertInlineFigure(body, inlineFigureHtml(src, inlineAlt(section, keyword), slot, pick.id), slot);
    filled++;
  }
  if (filled > 0) await prisma.contentVersion.update({ where: { id: version.id }, data: { bodyHtml: body } });
  return filled;
}

export async function syncTextResultToStudio(tenantId: string, contentTextId: string) {
  const contentText = await getContentTextById(tenantId, contentTextId);
  if (!contentText?.output) {
    return;
  }

  const version = await findVersionByTextId(tenantId, contentTextId);
  if (!version) {
    return;
  }

  const derived = deriveVersion(contentText.output, version.project);
  await updateVersionFromText(tenantId, version.id, derived, "ai_generated");
  await replaceDerivatives(
    tenantId,
    version.project.id,
    version.id,
    buildDerivatives(derived, version.project.site),
  );
  await updateProjectStatus(tenantId, version.project.id, "ai_generated");

  if (version.project.origin === "auto") {
    await prisma.contentProject.update({
      where: { id: version.project.id },
      data: { automationSubstate: "waiting_for_image" },
    });
  }

  if (!version.contentImageId) {
    await requestImageGenerationForVersion(tenantId, version.id);
  }
  try {
    await requestInlineImagesForVersion(tenantId, version.id);
  } catch (error) {
    // The text is saved; missing inline images show up in QA and can be generated from the Media tab.
    console.warn("[orchestration] inline image request failed", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Queues the in-body images the version still lacks (INLINE_IMAGE_MIN in total).
 * Idempotent: images already in the body or still in flight count.
 */
export async function requestInlineImagesForVersion(tenantId: string, versionId: string): Promise<string[]> {
  const version = await prisma.contentVersion.findFirst({
    where: { id: versionId, tenantId },
    include: { project: { include: { site: true } } },
  });
  if (!version) {
    throw new Error("version_or_topic_not_found");
  }
  const topicId = version.project.topicId ?? (await ensureProjectTopic(tenantId, version.project.id, version.project.title, version.project.brief ?? ""));
  const body = version.bodyHtml ?? "";
  const inFlight = await prisma.contentImage.findMany({
    where: { tenantId, dedupeHash: { startsWith: `inline:${versionId}:` }, status: { in: ["queued", "processing"] } },
    select: { dedupeHash: true },
  });
  const taken = new Set([
    ...filledInlineSlots(body),
    ...inFlight.map((image) => parseInlineImageHash(image.dedupeHash)?.slot).filter((slot): slot is number => slot !== undefined),
  ]);
  let missing = INLINE_IMAGE_MIN - (body.match(/<img[^>]*>/gi) ?? []).length - inFlight.length;
  const headings = h2Headings(body);
  const textId = version.contentTextId ?? null;
  const mode = textId ? "contextual" : "independent";
  const projectMetadata = asRecord(version.project.metadata);
  const ids: string[] = [];
  const style = await visualImageOptions(version.project.siteId, "body");
  if (style.image_style === "media_library") {
    const free = Array.from({ length: INLINE_IMAGE_MIN * 2 }, (_, slot) => slot).filter((slot) => !taken.has(slot)).slice(0, Math.max(0, missing));
    await fillSlotsFromLibrary(tenantId, version, free);
    return ids;
  }
  const settings = await prisma.sitePlanningSettings.findUnique({ where: { siteId: version.project.siteId }, select: { articleTargets: true } });
  // One infographic per article, only for a section with steps or a comparison, and only if none is in the body yet.
  const infographic = resolveVisualSettings(settings?.articleTargets).infographic && !/data-auctorio-infographic/.test(body) ? infographicSection(body) : null;
  let infographicQueued = false;
  for (let slot = 0; missing > 0 && slot < INLINE_IMAGE_MIN * 2; slot++) {
    if (taken.has(slot)) continue;
    missing--;
    const section = headings[headingIndexForSlot(slot, headings.length)] ?? version.title ?? version.project.title;
    const asInfographic = Boolean(infographic) && !infographicQueued && headingIndexForSlot(slot, headings.length) === infographic!.index;
    if (asInfographic) infographicQueued = true;
    const image = await prisma.contentImage.create({
      data: { tenantId, topicId, textId, status: "queued", dedupeHash: inlineImageHash(versionId, slot, crypto.randomUUID()) },
    });
    const imageJob = await prisma.job.create({ data: { tenantId, type: "image", status: "queued" } });
    const operation = await createOperation({
      tenantId,
      siteId: version.project.siteId,
      type: "image_generation",
      initiatorUserId: null,
      entityType: "content_version",
      entityId: version.id,
      queueName: "queue_image",
      jobKey: imageJob.id,
      metadata: { mode, role: "inline", slot },
    });
    await enqueueImageJob(imageJob.id, {
      jobId: imageJob.id,
      tenantId,
      operationId: operation.id,
      topicId,
      contentImageId: image.id,
      mode,
      textId: textId ?? undefined,
      options: {
        ...projectMetadata,
        site_id: version.project.siteId,
        goal: version.project.goal,
        site_name: version.project.site?.name ?? undefined,
        image_role: asInfographic ? "infographic" : "inline",
        section,
        ...style,
        ...(asInfographic ? { section_text: infographic!.text, language: version.project.primaryLanguage === "en" ? "en" : "es" } : {}),
      },
    });
    ids.push(image.id);
  }
  return ids;
}

/** Pre-approval statuses: QA may still be (re)computed. Never pull an approved, queued or published piece back. */
const QA_REFRESHABLE_STATUSES: string[] = ["draft", "ai_generated", "qa_failed", "qa_passed", "in_review"];

/** Places a finished inline image in its version's body and refreshes QA while the piece is still in review. */
export async function syncInlineImageToVersion(tenantId: string, contentImageId: string): Promise<void> {
  const image = await prisma.contentImage.findFirst({ where: { id: contentImageId, tenantId }, include: { assetVariants: true } });
  const ref = parseInlineImageHash(image?.dedupeHash);
  if (!image || !ref || (image.status !== "done" && image.status !== "failed")) {
    return;
  }
  const version = await prisma.contentVersion.findFirst({
    where: { id: ref.versionId, tenantId },
    include: { project: true, contentImage: true },
  });
  if (!version) {
    return;
  }
  if (image.status === "failed") {
    // A permanently failed inline image still settles the version: QA then reports the real image count.
    const heroDone = version.contentImage?.status === "done" || version.contentImage?.status === "failed";
    if (version.contentImageId && heroDone && QA_REFRESHABLE_STATUSES.includes(version.project.status)) {
      await syncImageResultToStudio(tenantId, version.contentImageId);
    }
    return;
  }
  const variant = image.assetVariants.find((item) => item.kind === "hero") ?? image.assetVariants.find((item) => item.kind === "original");
  const src = await buildAssetPublicUrl(variant?.storagePath ?? image.storagePath);
  if (!src) {
    return;
  }
  const body = version.bodyHtml ?? "";
  const headings = h2Headings(body);
  const alt = inlineAlt(headings[headingIndexForSlot(ref.slot, headings.length)] ?? version.title ?? "", readString(version.project.metadata, "primaryKeyword"));
  const infographic = image.prompt?.startsWith(INFOGRAPHIC_PROMPT_PREFIX) ?? false;
  const next = insertInlineFigure(body, inlineFigureHtml(src, alt, ref.slot, image.id, infographic), ref.slot);
  if (next === body) {
    return;
  }
  await prisma.contentVersion.update({ where: { id: version.id }, data: { bodyHtml: next } });
  // Never pull an approved, scheduled or published piece back into review.
  const heroSettled = version.contentImage?.status === "done" || version.contentImage?.status === "failed";
  if (version.contentImageId && heroSettled && QA_REFRESHABLE_STATUSES.includes(version.project.status)) {
    await syncImageResultToStudio(tenantId, version.contentImageId);
  }
}

export async function syncImageResultToStudio(tenantId: string, contentImageId: string) {
  const image = await getContentImageById(tenantId, contentImageId);
  if (!image) {
    return;
  }

  const version = await findVersionByImageId(tenantId, contentImageId);
  if (!version) {
    return;
  }
  // Inline images still rendering would make image_presence report a false failure;
  // the last one to land (or fail) re-runs this.
  const inlinePending = await prisma.contentImage.count({
    where: { tenantId, dedupeHash: { startsWith: `inline:${version.id}:` }, status: { in: ["queued", "processing"] } },
  });
  if (inlinePending > 0) {
    return;
  }

  const isAuto = version.project.origin === "auto";
  if (isAuto) {
    await prisma.contentProject.update({
      where: { id: version.project.id },
      data: { automationSubstate: "qa_checking" },
    });
  }

  const qaReport = runVersionQaV2(
    {
      title: version.title,
      excerpt: version.excerpt,
      bodyHtml: version.bodyHtml,
      seoTitle: version.seoTitle,
      seoDescription: version.seoDescription,
    },
    {
      imageReady: image.status === "done" && Boolean(image.storagePath) && image.assetVariants.some((variant) => variant.kind === "hero"),
      metadata: asRecord(version.project.metadata),
      siteType: version.project.site?.type ?? null,
      recommendedWordCountMin: readNumber(version.project.metadata, "recommendedWordCountMin"),
      recommendedWordCountMax: readNumber(version.project.metadata, "recommendedWordCountMax"),
      cannibalizationRisk: readString(version.project.metadata, "cannibalizationRisk"),
    },
  );

  await updateVersionQa(
    version.id,
    qaReport.passed ? "qa_passed" : "qa_failed",
    qaReport as unknown as Prisma.JsonObject,
  );
  await updateProjectStatus(
    tenantId,
    version.project.id,
    qaReport.passed ? "in_review" : "qa_failed",
  );

  if (isAuto) {
    await prisma.contentProject.update({
      where: { id: version.project.id },
      data: { automationSubstate: qaReport.passed ? "qa_passed" : "qa_failed" },
    });
  }
}

export async function retryImageGeneration(tenantId: string, contentImageId: string) {
  const image = await prisma.contentImage.findFirst({
    where: { id: contentImageId, tenantId },
  });
  if (!image) {
    throw new Error("image_not_found");
  }
  if (image.status === "processing" || image.status === "queued") {
    throw new Error("image_already_in_flight");
  }
  if (image.status !== "failed" && image.status !== "retryable") {
    throw new Error("image_not_retryable");
  }

  const topic = await prisma.topic.findFirst({
    where: { id: image.topicId, tenantId },
  });
  if (!topic) {
    throw new Error("topic_not_found");
  }

  const version = await findVersionByImageId(tenantId, contentImageId);

  await prisma.contentImage.update({
    where: { id: contentImageId },
    data: { status: "queued", error: null },
  });

  const imageJob = await prisma.job.create({
    data: {
      tenantId,
      type: "image",
      status: "queued",
    },
  });

  const operation = await createOperation({
    tenantId,
    siteId: version?.project.siteId ?? null,
    type: "image_generation",
    initiatorUserId: null,
    entityType: "content_image",
    entityId: contentImageId,
    queueName: "queue_image",
    jobKey: imageJob.id,
  });

  await enqueueImageJob(imageJob.id, {
    jobId: imageJob.id,
    tenantId,
    operationId: operation.id,
    topicId: topic.id,
    contentImageId,
    mode: image.textId ? "contextual" : "independent",
    textId: image.textId ?? undefined,
    options: {
      site_id: version?.project.siteId ?? undefined,
      goal: version?.project.goal ?? undefined,
      promptPresetVersionId: image.promptPresetVersionId ?? undefined,
    },
  });

  return imageJob.id;
}
