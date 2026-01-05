import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { env } from "../env";
import { prisma } from "../prisma";
import { requireOwnerSession } from "../middleware/ownerAuth";
import {
  generateSessionToken,
  hashPassword,
  hashToken,
} from "../utils/crypto";
import { writeAuditLog } from "../audit";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/owner",
};

export const registerOwnerRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  app.post("/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply
        .code(400)
        .send(errorResponse("invalid_request", "Invalid login payload."));
      return;
    }

    const { email, password } = parsed.data;
    const owner = await prisma.ownerUser.findUnique({
      where: {
        email,
      },
    });

    if (!owner || owner.passwordHash !== hashPassword(password)) {
      reply
        .code(401)
        .send(errorResponse("unauthorized", "Invalid credentials."));
      return;
    }

    const rawToken = generateSessionToken();
    const tokenHash = hashToken(rawToken);

    await prisma.ownerSession.create({
      data: {
        ownerUserId: owner.id,
        sessionTokenHash: tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });

    reply.setCookie(env.OWNER_SESSION_COOKIE, rawToken, cookieBase);

    await writeAuditLog({
      actorType: "owner",
      actorId: owner.id,
      action: "owner.login",
      metadata: {
        email: owner.email,
      },
    });

    reply.send(successResponse({}));
  });

  app.post("/logout", { preHandler: requireOwnerSession }, async (request, reply) => {
    const token = request.cookies?.[env.OWNER_SESSION_COOKIE];
    if (token) {
      await prisma.ownerSession.updateMany({
        where: {
          sessionTokenHash: hashToken(token),
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    reply.clearCookie(env.OWNER_SESSION_COOKIE, cookieBase);

    if (request.ownerUser) {
      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.logout",
      });
    }

    reply.send(successResponse({}));
  });

  app.get("/me", { preHandler: requireOwnerSession }, async (request, reply) => {
    if (!request.ownerUser) {
      reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
      return;
    }

    reply.send(
      successResponse({
        id: request.ownerUser.id,
        email: request.ownerUser.email,
        created_at: request.ownerUser.createdAt,
      }),
    );
  });
};
