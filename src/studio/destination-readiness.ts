import { getPrismaClient } from "../infrastructure/db/prisma";

/**
 * Read-only destination readiness (Site + ConnectorInstallation + last Publication).
 * Unknown never becomes success: an active installation is only "ready" once a
 * capability verification was recorded. Secrets are never selected for output.
 */
export type DestinationReadiness = "not_verified" | "ready" | "error";

export interface InstallationReadinessInput {
  id: string;
  displayName: string | null;
  verifiedAt: Date | null;
  lastError: string | null;
  siteId: string | null;
  site: { name: string } | null;
  configured?: boolean;
  capabilities?: unknown;
  lastPublishedAt?: Date | null;
}

type Tri = boolean | null;

export function installationReadiness(i: Pick<InstallationReadinessInput, "verifiedAt" | "lastError">): DestinationReadiness {
  if (i.lastError) return "error";
  return i.verifiedAt ? "ready" : "not_verified";
}

/** Outcome of a persisted probe: true=passed, false=failed, null=never ran / not supported. */
function probeOutcome(capabilities: unknown, probe: string): Tri {
  const list = (capabilities as { verification?: { probes?: Array<{ probe?: string; outcome?: string }> } } | null)?.verification?.probes;
  const hit = Array.isArray(list) ? list.find((p) => p?.probe === probe) : undefined;
  return hit?.outcome === "passed" ? true : hit?.outcome === "failed" ? false : null;
}

export function installationToConnection(i: InstallationReadinessInput) {
  const readiness = installationReadiness(i);
  const auth = probeOutcome(i.capabilities, "auth");
  return {
    id: i.id,
    platform: "website" as const,
    displayName: i.site?.name ?? i.displayName ?? "Website",
    enabled: true,
    status: "active",
    connectionState: readiness === "ready" ? "connected" : readiness === "error" ? "provider_error" : "not_verified",
    readiness,
    reason:
      readiness === "ready"
        ? null
        : readiness === "error"
          ? "The last check failed. Re-verify or fix the credentials."
          : "Installed but capabilities were never verified. Run verification before publishing.",
    checks: {
      configured: i.configured ?? null,
      authenticated: auth,
      reachable: auth ?? (i.verifiedAt ? true : null),
      capabilitiesVerified: readiness === "ready",
      canCreateDraft: probeOutcome(i.capabilities, "draft_roundtrip"),
      canPublish: probeOutcome(i.capabilities, "publish"),
    },
    lastVerifiedAt: i.verifiedAt,
    lastSuccessfulPublicationAt: i.lastPublishedAt ?? null,
    siteId: i.siteId,
    siteName: i.site?.name ?? null,
  };
}

/** One row per destination: an installation supersedes a legacy website account on the same site. */
export function dedupeLegacyWebsiteAccounts<T extends { platform: string; siteId: string | null }>(
  accounts: T[],
  installations: Array<{ siteId: string | null }>,
): T[] {
  const covered = new Set(installations.map((i) => i.siteId).filter((s): s is string => !!s));
  return accounts.filter((a) => !(a.platform === "website" && a.siteId && covered.has(a.siteId)));
}

export function normalizeOrigin(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    return `${u.protocol}//${u.hostname.toLowerCase().replace(/^www\./, "")}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return null;
  }
}

/** Sites with no installation id yet are matched by normalized origin; ambiguous matches stay unlinked. */
export function resolveSiteIdByOrigin(baseUrl: unknown, sites: Array<{ id: string; baseUrl: string | null }>): string | null {
  const origin = normalizeOrigin(baseUrl);
  if (!origin) return null;
  const matches = sites.filter((s) => normalizeOrigin(s.baseUrl) === origin);
  return matches.length === 1 ? matches[0].id : null;
}

/** Active website installations of one tenant as typed destination summaries. */
export async function loadWebsiteDestinations(tenantId: string) {
  const prisma = getPrismaClient();
  const [rows, sites] = await Promise.all([
    prisma.connectorInstallation.findMany({
      where: { tenantId, kind: "website", state: "active" },
      orderBy: { activatedAt: "desc" },
      select: {
        id: true, displayName: true, verifiedAt: true, lastError: true, siteId: true,
        config: true, capabilities: true, credentialsRef: true, credentialsCiphertext: true,
      },
    }),
    prisma.site.findMany({ where: { tenantId }, select: { id: true, name: true, baseUrl: true } }),
  ]);
  const resolved = rows.map((row) => ({
    ...row,
    siteId: row.siteId ?? resolveSiteIdByOrigin((row.config as { baseUrl?: unknown } | null)?.baseUrl, sites),
  }));
  const siteIds = [...new Set(resolved.map((r) => r.siteId).filter((s): s is string => !!s))];
  const published = siteIds.length
    ? await prisma.publication.groupBy({
        by: ["siteId"],
        where: { tenantId, siteId: { in: siteIds }, channel: "website", status: "published" },
        _max: { publishedAt: true },
      })
    : [];
  const lastBySite = new Map(published.map((p) => [p.siteId, p._max.publishedAt]));
  return resolved.map((row) =>
    installationToConnection({
      id: row.id,
      displayName: row.displayName,
      verifiedAt: row.verifiedAt,
      lastError: row.lastError,
      siteId: row.siteId,
      site: sites.find((s) => s.id === row.siteId) ?? null,
      configured: !!(row.credentialsRef || row.credentialsCiphertext),
      capabilities: row.capabilities,
      lastPublishedAt: row.siteId ? lastBySite.get(row.siteId) ?? null : null,
    }),
  );
}
