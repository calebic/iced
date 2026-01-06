import type { FastifyReply, FastifyRequest } from "fastify";
import { errorResponse } from "@iced/shared";
import { env } from "../env";
import { prisma } from "../prisma";
import { hashToken } from "../utils/crypto";
import { constantTimeEqual } from "../services/apiKeyService";
import { writeEventLog } from "../eventLog";

export const requireTenant = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const apiKeyHeader = env.API_KEY_HEADER.toLowerCase();
  const rawKey =
    request.headers[apiKeyHeader] ??
    request.headers[apiKeyHeader.toUpperCase()];

  if (!rawKey || Array.isArray(rawKey)) {
    reply.code(401).send(errorResponse("unauthorized", "API key required."));
    return;
  }

  const keyHash = hashToken(rawKey);
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      revokedAt: null,
    },
    include: {
      application: true,
    },
  });

  if (!apiKey || !constantTimeEqual(apiKey.keyHash, keyHash)) {
    reply.code(401).send(errorResponse("unauthorized", "Invalid API key."));
    return;
  }

  if (apiKey.application.status !== "active") {
    reply
      .code(403)
      .send(errorResponse("forbidden", "Application is disabled."));
    return;
  }

  request.tenantApplication = apiKey.application;
  request.tenantApiKeyId = apiKey.id;

  if (
    !apiKey.lastUsedAt ||
    Date.now() - apiKey.lastUsedAt.getTime() > 60_000
  ) {
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });
  }

  await writeEventLog({
    appId: apiKey.applicationId,
    eventType: "api_key.used",
    request,
    statusCode: reply.statusCode,
    apiKeyId: apiKey.id,
  });
};
