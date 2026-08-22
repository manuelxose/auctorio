import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";

const prisma = getPrismaClient();

export type AuditActorType = "user" | "automation" | "system";

export type AuditEntryInput = {
  tenantId: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  actorType?: AuditActorType;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function writeAudit(input: AuditEntryInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorType: input.actorType ?? "system",
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata
        ? (input.metadata as Prisma.InputJsonObject)
        : Prisma.JsonNull,
    },
  });
}

export async function listAudit(
  tenantId: string,
  input: {
    page: number;
    pageSize: number;
    entityType?: string;
    entityId?: string;
    action?: string;
  },
) {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
    ...(input.action ? { action: input.action } : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.pageSize,
      include: {
        actorUser: { select: { id: true, displayName: true, email: true } },
      },
    }),
  ]);

  return {
    items: items.map((entry) => ({
      id: entry.id,
      actorType: entry.actorType,
      actorUser: entry.actorUser
        ? {
            id: entry.actorUser.id,
            displayName: entry.actorUser.displayName,
            email: entry.actorUser.email,
          }
        : null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}
