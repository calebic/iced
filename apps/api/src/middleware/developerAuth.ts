import type { FastifyReply, FastifyRequest } from "fastify";
import { errorResponse } from "@iced/shared";
import { env } from "../env";
import { prisma } from "../prisma";
import { hashToken } from "../utils/crypto";

export const requireDeveloperSession = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const token = request.cookies?.[env.DEVELOPER_SESSION_COOKIE];
  if (!token) {
    reply
      .code(401)
      .send(errorResponse("unauthorized", "Developer session required."));
    return;
  }

  const tokenHash = hashToken(token);
  const session = await prisma.developerSession.findFirst({
    where: {
      sessionTokenHash: tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      developerUser: true,
    },
  });

  if (!session) {
    reply.code(401).send(errorResponse("unauthorized", "Invalid session."));
    return;
  }

  if (session.developerUser.status !== "active") {
    reply
      .code(403)
      .send(errorResponse("forbidden", "Developer account disabled."));
    return;
  }

  request.developerUser = session.developerUser;
};
