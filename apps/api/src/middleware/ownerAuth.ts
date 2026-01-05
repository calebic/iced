import type { FastifyReply, FastifyRequest } from "fastify";
import { errorResponse } from "@iced/shared";
import { env } from "../env";
import { prisma } from "../prisma";
import { hashToken } from "../utils/crypto";

export const requireOwnerSession = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const token = request.cookies?.[env.OWNER_SESSION_COOKIE];
  if (!token) {
    reply.code(401).send(errorResponse("unauthorized", "Owner session required."));
    return;
  }

  const tokenHash = hashToken(token);
  const session = await prisma.ownerSession.findFirst({
    where: {
      sessionTokenHash: tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      ownerUser: true,
    },
  });

  if (!session) {
    reply.code(401).send(errorResponse("unauthorized", "Invalid owner session."));
    return;
  }

  request.ownerUser = session.ownerUser;
};
