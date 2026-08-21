import { Prisma, type ContentProject, type DerivativeType, type Site } from "@prisma/client";
import { enqueueImageJob, enqueuePublishingJob, enqueueTextJob } from "../infrastructure/queue/producer";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getContentTypeFromPath } from "../shared/utils/mime";
import { getPublicBaseUrl } from "../shared/utils/env";
import { attachImageToVersion, createQueuedImage, createQueuedText, createVersion, ensureProjectTopic, findVersionByImageId, findVersionByTextId, getContentImageById, getContentTextById, replaceDerivatives, updateProjectStatus, updateVersionFromText, updateVersionQa } from "./repository";
import { runVersionQa } from "./qa";
import type { GeneratedDerivative, StudioVersionDerivation } from "./types";

const prisma = getPrismaClient();

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

function deriveVersion(text: string, project: ContentProject): StudioVersionDerivation {
  const normalized = text.trim();
  const html = /<h\d|<p|<ul|<ol/i.test(normalized) ? normalized : toHtml(normalized);
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

export async function startProjectGeneration(
  projectId: string,
  tenantId: string,
  feedback?: string | null,
  promptPresetVersionId?: string | null,
) {
  const project = await prisma.contentProject.findFirst({
    where: { id: projectId, tenantId },
    include: { site: true },
  });
  if (!project) {
    throw new Error("project_not_found");
  }

  const topicId = await ensureProjectTopic(tenantId, projectId, project.title, project.brief);
  await prisma.fact.create({
    data: {
      tenantId,
      topicId,
      sourceType: "manual",
      content: feedback?.trim() ? `${project.brief}\n\nFeedback de revision:\n${feedback.trim()}` : project.brief,
      contentHash: `${projectId}:${Date.now()}`,
      metadata: {
        project_id: projectId,
        goal: project.goal,
      },
    },
  });

  const contentText = await createQueuedText(
    tenantId,
    topicId,
    project.primaryLanguage === "en" ? "en" : "es",
  );
  const version = await createVersion(tenantId, projectId, contentText.id, feedback);
  const textJob = await prisma.job.create({
    data: {
      tenantId,
      type: "text",
      status: "queued",
    },
  });

  await enqueueTextJob(textJob.id, {
    jobId: textJob.id,
    tenantId,
    topicId,
    contentTextId: contentText.id,
    type: "seo",
    language: project.primaryLanguage === "en" ? "en" : "es",
    options: {
      goal: project.goal,
      site_id: project.siteId,
      site_name: project.site.name,
      brand_voice: project.site.brandVoice ?? {},
      seo_rules: project.site.seoRules ?? {},
      metadata: project.metadata ?? {},
      revision_feedback: feedback ?? undefined,
      promptPresetVersionId: promptPresetVersionId ?? undefined,
    },
  });

  await updateProjectStatus(tenantId, projectId, "draft");

  return { versionId: version.id, contentTextId: contentText.id, jobId: textJob.id };
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
  if (!version || !version.project.topicId) {
    throw new Error("version_or_topic_not_found");
  }

  const textId = version.contentTextId ?? null;
  const contentImage = await createQueuedImage(tenantId, version.project.topicId, textId);
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

  await enqueueImageJob(imageJob.id, {
    jobId: imageJob.id,
    tenantId,
    topicId: version.project.topicId,
    contentImageId: contentImage.id,
    mode: textId ? "contextual" : "independent",
    textId: textId ?? undefined,
    options: {
      ...projectMetadata,
      site_id: version.project.siteId,
      goal: version.project.goal,
      site_name: version.project.site?.name ?? undefined,
      promptPresetVersionId: promptPresetVersionId ?? undefined,
    },
  });

  return contentImage.id;
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

  if (!version.contentImageId) {
    await requestImageGenerationForVersion(tenantId, version.id);
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

  const qaReport = runVersionQa(
    {
      title: version.title,
      excerpt: version.excerpt,
      bodyHtml: version.bodyHtml,
      seoTitle: version.seoTitle,
      seoDescription: version.seoDescription,
    },
    image.status === "done" &&
      Boolean(image.storagePath) &&
      image.assetVariants.some((variant) => variant.kind === "hero"),
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
}

export async function queuePublication(publicationJobId: string) {
  await enqueuePublishingJob(publicationJobId, {
    publicationJobId,
  });
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

  await enqueueImageJob(imageJob.id, {
    jobId: imageJob.id,
    tenantId,
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
