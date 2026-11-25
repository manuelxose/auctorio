// Licences in force: what the code established, improved only by a record another administrator approved (SEO-V2-06).

import { getPrismaClient } from "../infrastructure/db/prisma";
import type { SeoLicensing, SeoProvider } from "../infrastructure/seo/contract";
import { SEO_PROVIDERS } from "../infrastructure/seo/registry";
import { sharableProviders } from "./seo-research/knowledge";

const prisma = getPrismaClient();

export const LICENSE_TERMS = ["permitted", "prohibited", "unverified"] as const;
type Terms = Pick<SeoLicensing, "commercialUse" | "storage" | "crossTenantSharing">;

/** A prohibition always wins, wherever it is written; "permitted" needs the code or an approved record that is still valid. */
function merge(code: SeoLicensing, record: Terms | undefined): SeoLicensing {
  if (!record) return code;
  const pick = (key: keyof Terms): SeoLicensing["storage"] => (code[key] === "prohibited" || record[key] === "prohibited" ? "prohibited" : code[key] === "permitted" || record[key] === "permitted" ? "permitted" : "unverified");
  return { ...code, commercialUse: pick("commercialUse"), storage: pick("storage"), crossTenantSharing: pick("crossTenantSharing") };
}

async function approvedRecords(now: Date): Promise<Map<string, Terms>> {
  const rows = await prisma.seoLicenseRecord.findMany({ where: { status: "approved", OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, orderBy: { approvedAt: "asc" } });
  return new Map(rows.map((row) => [row.providerId, row as unknown as Terms])); // the latest approval counts
}

export async function effectiveLicensing(provider: Pick<SeoProvider, "id" | "licensing">, now = new Date()): Promise<SeoLicensing> {
  return merge(provider.licensing, (await approvedRecords(now)).get(provider.id));
}

export async function effectiveLicences(now = new Date()): Promise<Array<{ id: string; licensing: SeoLicensing }>> {
  const records = await approvedRecords(now);
  return SEO_PROVIDERS.map((provider) => ({ id: provider.id, licensing: merge(provider.licensing, records.get(provider.id)) }));
}

/** Providers whose market data may cross workspaces now. */
export async function sharableNow(shareMarketData: boolean): Promise<string[]> {
  return shareMarketData ? sharableProviders(true, await effectiveLicences()) : [];
}
