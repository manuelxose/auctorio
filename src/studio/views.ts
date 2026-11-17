import { buildReviewGate, countQaFailures, countQaWarnings, countWordsFromHtml, isHeroImageReady } from "./review";
import { buildAssetPublicUrl } from "./orchestration";
import { getProjectById, isWebsiteDelivery, mapWebsiteDelivery } from "./repository";
import type { PublicationExecutionState, StudioProjectDetailView, VersionSummary } from "./types";

export type ProjectRecord = NonNullable<Awaited<ReturnType<typeof getProjectById>>>;
export type ProjectVersionRecord = ProjectRecord["versions"][number];

export function mapQaState(
  status: ProjectVersionRecord["status"],
): VersionSummary["qaState"] {
  switch (status) {
    case "qa_failed":
      return "failed";
    case "qa_passed":
      return "passed";
    case "approved":
      return "approved";
    case "published":
      return "published";
    default:
      return "not_ready";
  }
}

/** Website deliveries of the project, newest first (the execution history the views show). */
function websiteDeliveries(project: ProjectRecord) {
  return project.publications
    .filter(isWebsiteDelivery)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function latestDeliveryFor(project: ProjectRecord, versionId: string): PublicationExecutionState | null {
  const delivery = websiteDeliveries(project).find((publication) => publication.versionId === versionId);
  return delivery ? mapWebsiteDelivery(delivery) : null;
}

export function readPromptFields(version: ProjectVersionRecord) {
  const promptPresetVersion =
    version.contentText?.promptPresetVersion ?? version.contentImage?.promptPresetVersion ?? null;

  return {
    promptPresetVersionId: promptPresetVersion?.id ?? null,
    promptVersionLabel: promptPresetVersion
      ? `v${promptPresetVersion.versionNumber}`
      : version.contentText?.promptVersion ?? null,
    promptPresetName: promptPresetVersion?.preset.name ?? null,
    promptPresetKey: promptPresetVersion?.preset.key ?? null,
  };
}

export async function toVersionSummary(version: ProjectVersionRecord, project: ProjectRecord): Promise<VersionSummary> {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    title: version.title,
    excerpt: version.excerpt,
    seoTitle: version.seoTitle,
    seoDescription: version.seoDescription,
    feedback: version.feedback,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    approvedAt: version.approvedAt,
    approvedBy: version.approvedBy,
    publishedAt: version.publishedAt,
    qaState: mapQaState(version.status),
    hasAsset: isHeroImageReady(version.contentImage),
    assetUrl: await buildAssetPublicUrl(version.contentImage?.storagePath),
    image: version.contentImage
      ? {
          id: version.contentImage.id,
          status: version.contentImage.status,
          error: version.contentImage.error,
        }
      : null,
    ...readPromptFields(version),
    wordCount: countWordsFromHtml(version.bodyHtml),
    qaFailureCount: countQaFailures(version.qaReport),
    qaWarningCount: countQaWarnings(version.qaReport),
    derivativeCount: version.derivatives.length,
    repairAttempts: version.repairAttempts,
    autonomousGatePassed: version.autonomousGatePassed,
    autonomousGateReport: version.autonomousGateReport,
    latestPublicationJob: latestDeliveryFor(project, version.id),
    qaReport: version.qaReport,
  };
}

export function buildProjectReviewGate(project: ProjectRecord) {
  const latestVersionRecord = project.versions[0] ?? null;
  const latestImage = latestVersionRecord?.contentImage ?? null;
  const heroReady = isHeroImageReady(latestImage);

  return buildReviewGate({
    projectStatus: project.status,
    versionCount: project.versions.length,
    latestVersion: latestVersionRecord
      ? {
          status: latestVersionRecord.status,
          title: latestVersionRecord.title,
          excerpt: latestVersionRecord.excerpt,
          seoTitle: latestVersionRecord.seoTitle,
          seoDescription: latestVersionRecord.seoDescription,
          feedback: latestVersionRecord.feedback,
          bodyHtml: latestVersionRecord.bodyHtml,
          qaReport: latestVersionRecord.qaReport,
          hasAsset: heroReady,
        }
      : null,
  });
}

export async function toProjectDetail(project: ProjectRecord): Promise<StudioProjectDetailView> {
  const latestVersionRecord = project.versions[0] ?? null;
  const latestVersion = latestVersionRecord ? await toVersionSummary(latestVersionRecord, project) : null;
  const latestAssetUrl = await buildAssetPublicUrl(latestVersionRecord?.contentImage?.storagePath);
  const versions = await Promise.all(
    project.versions.map(async (version) => ({
      ...(await toVersionSummary(version, project)),
      bodyHtml: version.bodyHtml,
    })),
  );

  return {
    id: project.id,
    siteId: project.siteId,
    title: project.title,
    brief: project.brief,
    goal: project.goal,
    status: project.status,
    primaryLanguage: project.primaryLanguage,
    automationMode: project.automationMode,
    automationSubstate: project.automationSubstate,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    versionCount: project.versions.length,
    socialCount: project.socialContents.length,
    reviewGate: buildProjectReviewGate(project),
    metadata: project.metadata,
    origin: project.origin,
    deletedAt: project.deletedAt,
    deletionReason: project.deletionReason,
    sourceItem: project.sourceItem
      ? {
          id: project.sourceItem.id,
          title: project.sourceItem.title,
          canonicalUrl: project.sourceItem.canonicalUrl,
          source: project.sourceItem.source,
        }
      : null,
    cluster: project.cluster
      ? {
          id: project.cluster.id,
          headline: project.cluster.headline,
          sourceCount: project.cluster.sourceCount,
        }
      : null,
    campaign: project.campaign ? { id: project.campaign.id, name: project.campaign.name } : null,
    site: {
      id: project.site.id,
      key: project.site.key,
      name: project.site.name,
      type: project.site.type,
      locale: project.site.locale,
      baseUrl: project.site.baseUrl,
      brandVoice: project.site.brandVoice,
      seoRules: project.site.seoRules,
      taxonomyMap: project.site.taxonomyMap,
      publishingCredentialsRef: project.site.publishingCredentialsRef,
    },
    topic: project.topic
      ? {
          id: project.topic.id,
          title: project.topic.title,
        }
      : null,
    latestVersion: latestVersionRecord && latestVersion
      ? {
          ...latestVersion,
          bodyHtml: latestVersionRecord.bodyHtml,
          derivatives: latestVersionRecord.derivatives.map((derivative) => ({
            id: derivative.id,
            type: derivative.type,
            title: derivative.title,
            body: derivative.body,
            status: derivative.status,
            createdAt: derivative.createdAt,
            updatedAt: derivative.updatedAt,
          })),
          assetVariants: await Promise.all(
            (latestVersionRecord.contentImage?.assetVariants ?? []).map(async (variant) => ({
              id: variant.id,
              kind: variant.kind,
              storagePath: variant.storagePath,
              mimeType: variant.mimeType,
              width: variant.width,
              height: variant.height,
              createdAt: variant.createdAt,
              updatedAt: variant.updatedAt,
              publicUrl: await buildAssetPublicUrl(variant.storagePath),
            })),
          ),
        }
      : null,
    latestAssetUrl,
    versions,
    socialContents: project.socialContents.map((social) => ({
      id: social.id,
      channel: social.channel,
      contentType: social.contentType,
      body: social.body,
      hashtags: social.hashtags,
      characterCount: social.characterCount,
      generationStatus: social.generationStatus,
      editorialStatus: social.editorialStatus,
      threadPosition: social.threadPosition,
      createdAt: social.createdAt,
      updatedAt: social.updatedAt,
    })),
    publications: project.publications.map((publication) => ({
      id: publication.id,
      channel: publication.channel,
      status: publication.status,
      scheduledFor: publication.scheduledFor,
      publishedAt: publication.publishedAt,
      externalId: publication.externalId,
      externalUrl: publication.externalUrl,
      lastError: publication.lastError,
      failureClass: publication.failureClass,
      failureReason: publication.failureReason,
      retryCount: publication.retryCount,
      manualOverride: publication.manualOverride,
      account: publication.account,
      site: publication.site,
      attempts: publication.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        error: attempt.error,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
      })),
    })),
    latestPublicationJob: websiteDeliveries(project)[0] ? mapWebsiteDelivery(websiteDeliveries(project)[0]) : null,
    publicationJobs: websiteDeliveries(project).map(mapWebsiteDelivery),
  };
}
