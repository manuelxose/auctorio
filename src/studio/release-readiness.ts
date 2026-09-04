import type { PublicationChannel } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getBooleanEnv, getEnv, isProductionEnv } from "../shared/utils/env";
import { normalizeAutomationMode } from "./automation-mode";
import { listWorkerHeartbeats } from "./worker-health";

const prisma = getPrismaClient();

export type ReleaseReadiness = {
  ready: boolean;
  blockers: string[];
  channel: PublicationChannel;
  mode: "manual" | "assisted" | "autopilot" | null;
};

/**
 * Single release boundary for every automatic publication.  Creation of a
 * schedule is intentionally not enough to publish: a row must pass this
 * check again immediately before it enters a queue.
 */
export async function getPublicationReleaseReadiness(publicationId: string): Promise<ReleaseReadiness> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { account: true, site: true, version: true },
  });
  if (!publication) {
    throw new Error("publication_not_found");
  }

  const blockers: string[] = [];
  const policy = await prisma.automationPolicy.findFirst({
    where: { tenantId: publication.tenantId, siteId: publication.siteId },
  });
  const mode = policy
    ? normalizeAutomationMode(policy.mode, policy)
    : null;

  // A human-triggered release is allowed in manual/assisted mode, but every
  // automatic release must originate from a healthy autopilot policy.
  if (!publication.manualOverride) {
    if (!policy) blockers.push("automation_policy_missing");
    else if (!policy.enabled || policy.state !== "active") blockers.push("automation_paused");
    else if (mode !== "autopilot" || !policy.autoPublish) blockers.push("autopilot_not_enabled");
    else if (policy.circuitOpen) blockers.push("publication_circuit_open");
  }

  if (!publication.manualOverride && !["approved", "published"].includes(publication.version.status)) {
    blockers.push("version_not_approved");
  }

  if (publication.channel === "website") {
    if (!publication.site) blockers.push("website_destination_missing");
    else if (!publication.site.publishingCredentialsRef || !getEnv(publication.site.publishingCredentialsRef, "").trim()) {
      blockers.push("website_credentials_missing");
    }
  } else {
    const account = publication.account;
    if (!account) blockers.push("social_account_missing");
    else {
      if (!account.enabled || account.status !== "active") blockers.push("social_account_inactive");
      if (account.connectionStatus && account.connectionStatus !== "connected") blockers.push("social_connection_unhealthy");
      const hasManagedCredential = account.provider === "ayrshare" && Boolean(account.providerProfileId);
      const hasDirectCredential = Boolean(account.credentialsCiphertext) || Boolean(account.credentialsRef && getEnv(account.credentialsRef, "").trim());
      if (!hasManagedCredential && !hasDirectCredential) blockers.push("social_credentials_missing");
    }
  }

  // Dry-run is useful for manual development, never as an automatic release.
  if (!publication.manualOverride && getBooleanEnv("PUBLISH_DRY_RUN", !isProductionEnv())) {
    blockers.push("publish_dry_run_enabled");
  }

  // Do not permit a production autopilot to feed a queue with no live
  // consumer. The scheduler itself is intentionally excluded: this check is
  // executed by it before enqueueing.
  if (!publication.manualOverride && isProductionEnv()) {
    const required = publication.channel === "website" ? ["publishing"] : ["social"];
    const heartbeats = await listWorkerHeartbeats();
    for (const worker of required) {
      if (!heartbeats.some((row) => row.name === worker && row.status === "running" && !row.stale)) {
        blockers.push(`worker_${worker}_unhealthy`);
      }
    }
  }

  return { ready: blockers.length === 0, blockers, channel: publication.channel, mode };
}

export async function assertPublicationReleaseReady(publicationId: string): Promise<void> {
  const readiness = await getPublicationReleaseReadiness(publicationId);
  if (!readiness.ready) {
    throw new Error(`release_blocked:${readiness.blockers.join(",")}`);
  }
}

export async function getTenantReleaseReadiness(tenantId: string) {
  const publications = await prisma.publication.findMany({
    where: { tenantId, status: { in: ["scheduled", "ready", "failed"] } },
    select: { id: true, channel: true, status: true, siteId: true, accountId: true },
    take: 100,
  });
  const items = await Promise.all(publications.map(async (publication) => ({
    ...publication,
    ...(await getPublicationReleaseReadiness(publication.id)),
  })));
  const policies = await prisma.automationPolicy.findMany({
    where: { tenantId },
    include: { site: true },
  });
  const accounts = await prisma.publishingAccount.findMany({ where: { tenantId } });
  const checks: Array<{ scope: string; ready: boolean; blockers: string[] }> = [];

  if (getBooleanEnv("PUBLISH_DRY_RUN", !isProductionEnv())) {
    checks.push({ scope: "environment", ready: false, blockers: ["publish_dry_run_enabled"] });
  }

  for (const policy of policies) {
    const blockers: string[] = [];
    const mode = normalizeAutomationMode(policy.mode, policy);
    if (mode !== "autopilot" || !policy.enabled || policy.state !== "active" || !policy.autoPublish) {
      blockers.push("autopilot_not_active");
    }
    if (policy.circuitOpen) blockers.push("publication_circuit_open");
    if (!policy.site) blockers.push("site_missing");
    else if (!policy.site.publishingCredentialsRef || !getEnv(policy.site.publishingCredentialsRef, "").trim()) {
      blockers.push("website_credentials_missing");
    }
    for (const [platform, wanted] of [["x", policy.xPostsPerDay], ["instagram", policy.instagramPostsPerDay]] as const) {
      if (wanted <= 0) continue;
      const account = accounts.find((row) => row.platform === platform && row.enabled && row.status === "active" && (!policy.siteId || row.siteId === policy.siteId));
      if (!account) {
        blockers.push(`${platform}_account_missing_or_inactive`);
        continue;
      }
      if (account.connectionStatus && account.connectionStatus !== "connected") blockers.push(`${platform}_connection_unhealthy`);
      const hasManagedCredential = account.provider === "ayrshare" && Boolean(account.providerProfileId);
      const hasDirectCredential = Boolean(account.credentialsCiphertext) || Boolean(account.credentialsRef && getEnv(account.credentialsRef, "").trim());
      if (!hasManagedCredential && !hasDirectCredential) blockers.push(`${platform}_credentials_missing`);
    }
    checks.push({ scope: `policy:${policy.id}`, ready: blockers.length === 0, blockers });
  }

  if (isProductionEnv()) {
    const heartbeats = await listWorkerHeartbeats();
    const required = ["control", "publishing", "social"];
    const blockers = required.filter((name) => !heartbeats.some((row) => row.name === name && row.status === "running" && !row.stale)).map((name) => `worker_${name}_unhealthy`);
    checks.push({ scope: "workers", ready: blockers.length === 0, blockers });
  }

  if (policies.length === 0) checks.push({ scope: "policies", ready: false, blockers: ["automation_policy_missing"] });
  return {
    checkedAt: new Date().toISOString(),
    ready: items.every((item) => item.ready) && checks.every((check) => check.ready),
    items,
    checks,
  };
}
