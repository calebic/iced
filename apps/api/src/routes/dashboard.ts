import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

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
  const handleRegister = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      reply
        .code(400)
        .send(errorResponse("invalid_request", "Invalid registration payload."));
      return;
    }

    const { username, email, password } = parsed.data;
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      reply
        .code(400)
        .send(errorResponse("invalid_request", "Username is required."));
      return;
    }

    try {
      const existingDeveloper = await prisma.developerUser.findFirst({
        where: {
          OR: [{ email }, { usernameNormalized: normalizedUsername }],
        },
        select: {
          email: true,
          usernameNormalized: true,
        },
      });

      if (existingDeveloper) {
        const message =
          existingDeveloper.usernameNormalized === normalizedUsername
            ? "Username already registered."
            : "Email already registered.";
        reply.code(409).send(errorResponse("conflict", message));
        return;
      }

      const developer = await prisma.developerUser.create({
        data: {
          email,
          username,
          usernameNormalized: normalizedUsername,
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
      reply.code(201).send(successResponse({}));
    } catch (error) {
      request.log.error(error);
      reply
        .code(500)
        .send(errorResponse("server_error", "Unable to register right now."));
    }
  };

  app.post("/register", handleRegister);
  app.post("/auth/register", handleRegister);

  const handleLogin = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply
        .code(400)
        .send(errorResponse("invalid_request", "Invalid login payload."));
      return;
    }

    try {
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
    } catch (error) {
      request.log.error(error);
      reply
        .code(500)
        .send(errorResponse("server_error", "Unable to sign in right now."));
    }
  };

  app.post("/login", handleLogin);
  app.post("/auth/login", handleLogin);

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
