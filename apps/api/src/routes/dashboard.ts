import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { env } from "../env";
import { prisma } from "../prisma";
import { requireDeveloperSession } from "../middleware/developerAuth";
import {
  generateSessionToken,
  hashPassword,
  hashToken,
} from "../utils/crypto";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginSchema = RegisterSchema;

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/dashboard",
};

const sessionDurationMs = 1000 * 60 * 60 * 24 * 7;

export const registerDashboardRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  app.post("/register", async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      reply
        .code(400)
        .send(errorResponse("invalid_request", "Invalid registration payload."));
      return;
    }

    const { email, password } = parsed.data;

    try {
      const developer = await prisma.developerUser.create({
        data: {
          email,
          passwordHash: hashPassword(password),
          status: "active",
        },
      });

      const rawToken = generateSessionToken();
      await prisma.developerSession.create({
        data: {
          developerUserId: developer.id,
          sessionTokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + sessionDurationMs),
        },
      });

      reply.setCookie(env.DEVELOPER_SESSION_COOKIE, rawToken, cookieBase);
      reply.send(successResponse({}));
    } catch (error) {
      request.log.error(error);
      reply
        .code(409)
        .send(errorResponse("conflict", "Email already registered."));
    }
  });

  app.post("/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply
        .code(400)
        .send(errorResponse("invalid_request", "Invalid login payload."));
      return;
    }

    const { email, password } = parsed.data;
    const developer = await prisma.developerUser.findUnique({
      where: {
        email,
      },
    });

    if (!developer || developer.passwordHash !== hashPassword(password)) {
      reply
        .code(401)
        .send(errorResponse("unauthorized", "Invalid credentials."));
      return;
    }

    if (developer.status !== "active") {
      reply
        .code(403)
        .send(errorResponse("forbidden", "Developer account disabled."));
      return;
    }

    const rawToken = generateSessionToken();
    await prisma.developerSession.create({
      data: {
        developerUserId: developer.id,
        sessionTokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + sessionDurationMs),
      },
    });

    reply.setCookie(env.DEVELOPER_SESSION_COOKIE, rawToken, cookieBase);
    reply.send(successResponse({}));
  });

  app.post(
    "/logout",
    { preHandler: requireDeveloperSession },
    async (request, reply) => {
      const token = request.cookies?.[env.DEVELOPER_SESSION_COOKIE];
      if (token) {
        await prisma.developerSession.updateMany({
          where: {
            sessionTokenHash: hashToken(token),
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }

      reply.clearCookie(env.DEVELOPER_SESSION_COOKIE, cookieBase);
      reply.send(successResponse({}));
    },
  );

  app.post(
    "/logout-all",
    { preHandler: requireDeveloperSession },
    async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      await prisma.developerSession.updateMany({
        where: {
          developerUserId: request.developerUser.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      reply.clearCookie(env.DEVELOPER_SESSION_COOKIE, cookieBase);
      reply.send(successResponse({}));
    },
  );

  app.get(
    "/me",
    { preHandler: requireDeveloperSession },
    async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      reply.send(
        successResponse({
          id: request.developerUser.id,
          email: request.developerUser.email,
          status: request.developerUser.status,
          created_at: request.developerUser.createdAt,
        }),
      );
    },
  );
};
