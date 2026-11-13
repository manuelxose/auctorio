/**
 * Read-only destination readiness for /v2/overview. Unknown never becomes success:
 * an active installation is only "ready" once a capability verification was recorded.
 */
export type DestinationReadiness = "not_verified" | "ready" | "error";

export interface InstallationReadinessInput {
  id: string;
  displayName: string | null;
  verifiedAt: Date | null;
  lastError: string | null;
  siteId: string | null;
  site: { name: string } | null;
}

export function installationReadiness(i: Pick<InstallationReadinessInput, "verifiedAt" | "lastError">): DestinationReadiness {
  if (i.lastError) return "error";
  return i.verifiedAt ? "ready" : "not_verified";
}

export function installationToConnection(i: InstallationReadinessInput) {
  const readiness = installationReadiness(i);
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
    lastVerifiedAt: i.verifiedAt,
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
