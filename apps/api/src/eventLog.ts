import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma";

type EventMetadata = Record<string, unknown>;

export const writeEventLog = async (params: {
  appId: string;
  eventType: string;
  request: FastifyRequest;
  statusCode: number;
  apiKeyId?: string | null;
  metadata?: EventMetadata;
}): Promise<void> => {
  const { appId, eventType, request, statusCode, apiKeyId, metadata } = params;

  await prisma.eventLog.create({
    data: {
      appId,
      eventType,
      requestId: String(request.id),
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? "",
      method: request.method,
      path: request.url,
      statusCode,
      apiKeyId: apiKeyId ?? null,
      metadata: metadata ?? {},
    },
  });
};
