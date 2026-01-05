import type { ActorType } from "@iced/shared";
import { prisma } from "./prisma";

type AuditMetadata = Record<string, unknown>;

export const writeAuditLog = async (params: {
  actorType: ActorType;
  actorId: string;
  action: string;
  appId?: string | null;
  metadata?: AuditMetadata;
}): Promise<void> => {
  const { actorType, actorId, action, appId, metadata } = params;

  await prisma.auditLog.create({
    data: {
      actorType,
      actorId,
      action,
      appId: appId ?? null,
      metadata: metadata ?? {},
    },
  });
};
