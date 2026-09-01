// Entity persistence: canonical entity rows + per-item links with confidence
// and source evidence.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { isUniqueViolation } from "../../infrastructure/db/errors";
import { buildEntityCanonicalKey, clampConfidence, type EntityExtraction } from "./model";

const prisma = getPrismaClient();

/** Find or create the canonical entity row for an extraction. */
export async function upsertEntity(tenantId: string, extraction: EntityExtraction): Promise<string> {
  const canonicalKey = buildEntityCanonicalKey(extraction.domain, extraction.type, extraction.name);
  const existing = await prisma.entity.findUnique({
    where: {
      tenantId_domain_type_canonicalKey: { tenantId, domain: extraction.domain, type: extraction.type, canonicalKey },
    },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const data: Prisma.EntityCreateInput = {
    tenant: { connect: { id: tenantId } },
    domain: extraction.domain,
    type: extraction.type,
    name: extraction.name,
    canonicalKey,
    aliases: extraction.aliases?.length ? (extraction.aliases as Prisma.InputJsonValue) : Prisma.JsonNull,
    externalIds: extraction.externalIds ? (extraction.externalIds as Prisma.InputJsonValue) : Prisma.JsonNull,
    metadata: extraction.metadata ? (extraction.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
  };
  try {
    const created = await prisma.entity.create({ data, select: { id: true } });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await prisma.entity.findUnique({
        where: {
          tenantId_domain_type_canonicalKey: { tenantId, domain: extraction.domain, type: extraction.type, canonicalKey },
        },
        select: { id: true },
      });
      if (raced) {
        return raced.id;
      }
    }
    throw error;
  }
}

export type LinkItemEntityInput = {
  itemId: string;
  entityId: string;
  confidence: number;
  evidence: unknown;
  extractionLevel: number;
};

/** Link an item to an entity (idempotent; refreshes confidence/evidence). */
export async function linkItemEntity(tenantId: string, input: LinkItemEntityInput): Promise<void> {
  try {
    await prisma.sourceItemEntity.create({
      data: {
        tenantId,
        itemId: input.itemId,
        entityId: input.entityId,
        confidence: clampConfidence(input.confidence),
        evidence: (input.evidence ?? []) as Prisma.InputJsonValue,
        extractionLevel: input.extractionLevel,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    await prisma.sourceItemEntity.updateMany({
      where: { itemId: input.itemId, entityId: input.entityId },
      data: {
        confidence: clampConfidence(input.confidence),
        evidence: (input.evidence ?? []) as Prisma.InputJsonValue,
        extractionLevel: input.extractionLevel,
        extractedAt: new Date(),
      },
    });
  }
}

/** Extract → store for one source item. Returns the canonical entity ids. */
export async function storeEntityExtractions(
  tenantId: string,
  itemId: string,
  extractions: EntityExtraction[],
  extractionLevel = 1,
): Promise<string[]> {
  const ids: string[] = [];
  for (const extraction of extractions) {
    const entityId = await upsertEntity(tenantId, extraction);
    await linkItemEntity(tenantId, {
      itemId,
      entityId,
      confidence: extraction.confidence,
      evidence: extraction.evidence,
      extractionLevel,
    });
    ids.push(entityId);
  }
  return ids;
}

export type ItemEntityRow = {
  entityId: string;
  confidence: number;
  evidence: unknown;
  extractionLevel: number;
  entity: { id: string; domain: string; type: string; name: string; externalIds: unknown };
};

export async function listEntitiesForItem(tenantId: string, itemId: string): Promise<ItemEntityRow[]> {
  return prisma.sourceItemEntity.findMany({
    where: { tenantId, itemId },
    orderBy: [{ extractionLevel: "asc" }, { confidence: "desc" }],
    select: {
      entityId: true,
      confidence: true,
      evidence: true,
      extractionLevel: true,
      entity: { select: { id: true, domain: true, type: true, name: true, externalIds: true } },
    },
  });
}

export async function listEntitiesForCluster(tenantId: string, clusterId: string): Promise<ItemEntityRow[]> {
  const links = await prisma.sourceItemEntity.findMany({
    where: { tenantId, item: { clusterId } },
    orderBy: { confidence: "desc" },
    select: {
      entityId: true,
      confidence: true,
      evidence: true,
      extractionLevel: true,
      entity: { select: { id: true, domain: true, type: true, name: true, externalIds: true } },
    },
  });
  // Aggregate by entity: max confidence, union of evidence.
  const byEntity = new Map<string, ItemEntityRow & { count: number }>();
  for (const link of links) {
    const existing = byEntity.get(link.entityId);
    if (!existing) {
      byEntity.set(link.entityId, { ...link, count: 1 });
      continue;
    }
    existing.count += 1;
    existing.confidence = Math.max(existing.confidence, link.confidence);
  }
  return Array.from(byEntity.values()).sort(
    (a, b) => b.count - a.count || b.confidence - a.confidence,
  );
}
