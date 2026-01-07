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

const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const DeveloperSearchSchema = PaginationSchema.extend({
  email: z.string().email().optional(),
});

const AppSearchSchema = PaginationSchema.extend({
  name: z.string().min(1).optional(),
  developer_email: z.string().email().optional(),
});

const UpdateAppSettingsSchema = z.object({
  allowed_origins: z.array(z.string()).optional(),
  access_token_ttl_seconds: z.number().int().positive().optional(),
  refresh_token_ttl_seconds: z.number().int().positive().optional(),
  email_policy: z.enum(["required", "optional", "disabled"]).optional(),
  license_policy: z.enum(["required", "optional", "disabled"]).optional(),
  default_rank_id: z.string().uuid().nullable().optional(),
});

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/owner",
};

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

const maskKey = (keyHash: string) => {
  const last4 = keyHash.slice(-4);
  return {
    masked: `****${last4}`,
    last4,
  };
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

  app.get(
    "/developers",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      const parsed = DeveloperSearchSchema.safeParse(request.query);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid query filters."));
        return;
      }

      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const pageSize = Math.min(
        parsed.data.page_size ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      );
      const page = Math.max(parsed.data.page ?? 1, 1);

      const where = parsed.data.email
        ? { email: { contains: parsed.data.email, mode: "insensitive" } }
        : {};

      const [developers, total] = await prisma.$transaction([
        prisma.developerUser.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.developerUser.count({ where }),
      ]);

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.developers.list",
        metadata: { page, pageSize, total, email: parsed.data.email },
      });

      reply.send(
        successResponse({
          items: developers.map((developer) => ({
            id: developer.id,
            email: developer.email,
            status: developer.status,
            created_at: developer.createdAt,
          })),
          page,
          page_size: pageSize,
          total,
        }),
      );
    },
  );

  app.get(
    "/developers/:developerId",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { developerId } = request.params as { developerId: string };
      const developer = await prisma.developerUser.findUnique({
        where: { id: developerId },
      });

      if (!developer) {
        reply
          .code(404)
          .send(errorResponse("not_found", "Developer not found."));
        return;
      }

      const [apps, endUsersCount, apiKeysCount] = await prisma.$transaction([
        prisma.application.findMany({
          where: { developerUserId: developerId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.endUser.count({
          where: { application: { developerUserId: developerId } },
        }),
        prisma.apiKey.count({
          where: { application: { developerUserId: developerId } },
        }),
      ]);

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.developers.get",
        metadata: { developerId },
      });

      reply.send(
        successResponse({
          developer: {
            id: developer.id,
            email: developer.email,
            status: developer.status,
            disabled_at: developer.disabledAt,
            created_at: developer.createdAt,
          },
          apps: apps.map((app) => ({
            id: app.id,
            name: app.name,
            status: app.status,
            created_at: app.createdAt,
          })),
          stats: {
            apps_count: apps.length,
            end_users_count: endUsersCount,
            api_keys_count: apiKeysCount,
          },
        }),
      );
    },
  );

  app.post(
    "/developers/:developerId/disable",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { developerId } = request.params as { developerId: string };
      const developer = await prisma.developerUser.update({
        where: { id: developerId },
        data: { status: "disabled", disabledAt: new Date() },
      }).catch(() => null);

      if (!developer) {
        reply
          .code(404)
          .send(errorResponse("not_found", "Developer not found."));
        return;
      }

      await prisma.developerSession.updateMany({
        where: { developerUserId: developerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.developers.disable",
        metadata: { developerId },
      });

      reply.send(successResponse({}));
    },
  );

  app.post(
    "/developers/:developerId/enable",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { developerId } = request.params as { developerId: string };
      const developer = await prisma.developerUser.update({
        where: { id: developerId },
        data: { status: "active", disabledAt: null },
      }).catch(() => null);

      if (!developer) {
        reply
          .code(404)
          .send(errorResponse("not_found", "Developer not found."));
        return;
      }

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.developers.enable",
        metadata: { developerId },
      });

      reply.send(successResponse({}));
    },
  );

  app.post(
    "/developers/:developerId/force-logout",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { developerId } = request.params as { developerId: string };
      const developer = await prisma.developerUser.findUnique({
        where: { id: developerId },
        select: { id: true },
      });

      if (!developer) {
        reply
          .code(404)
          .send(errorResponse("not_found", "Developer not found."));
        return;
      }

      await prisma.developerSession.updateMany({
        where: { developerUserId: developerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.developers.force_logout",
        metadata: { developerId },
      });

      reply.send(successResponse({}));
    },
  );

  app.get(
    "/apps",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      const parsed = AppSearchSchema.safeParse(request.query);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid query filters."));
        return;
      }

      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const pageSize = Math.min(
        parsed.data.page_size ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      );
      const page = Math.max(parsed.data.page ?? 1, 1);

      const where = {
        ...(parsed.data.name
          ? { name: { contains: parsed.data.name, mode: "insensitive" } }
          : {}),
        ...(parsed.data.developer_email
          ? {
              developerUser: {
                email: {
                  contains: parsed.data.developer_email,
                  mode: "insensitive",
                },
              },
            }
          : {}),
      };

      const [apps, total] = await prisma.$transaction([
        prisma.application.findMany({
          where,
          include: {
            developerUser: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.application.count({ where }),
      ]);

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.apps.list",
        metadata: {
          page,
          pageSize,
          total,
          name: parsed.data.name,
          developerEmail: parsed.data.developer_email,
        },
      });

      reply.send(
        successResponse({
          items: apps.map((app) => ({
            id: app.id,
            name: app.name,
            status: app.status,
            developer: {
              id: app.developerUserId,
              email: app.developerUser.email,
            },
            created_at: app.createdAt,
          })),
          page,
          page_size: pageSize,
          total,
        }),
      );
    },
  );

  app.get(
    "/apps/:appId",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      const appDetails = await prisma.application.findUnique({
        where: { id: appId },
        include: {
          developerUser: true,
          apiKeys: true,
        },
      });

      if (!appDetails) {
        reply.code(404).send(errorResponse("not_found", "App not found."));
        return;
      }

      const [endUsersCount, licensesCount] = await prisma.$transaction([
        prisma.endUser.count({ where: { applicationId: appId } }),
        prisma.license.count({ where: { applicationId: appId } }),
      ]);

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.apps.get",
        appId,
        metadata: { appId },
      });

      reply.send(
        successResponse({
          app: {
            id: appDetails.id,
            name: appDetails.name,
            status: appDetails.status,
            developer: {
              id: appDetails.developerUserId,
              email: appDetails.developerUser.email,
            },
            settings: {
              allowed_origins: appDetails.allowedOrigins,
              access_token_ttl_seconds: appDetails.accessTokenTtlSeconds,
              refresh_token_ttl_seconds: appDetails.refreshTokenTtlSeconds,
              email_policy: appDetails.emailPolicy,
              license_policy: appDetails.licensePolicy,
              default_rank_id: appDetails.defaultRankId,
            },
            created_at: appDetails.createdAt,
          },
          api_keys: appDetails.apiKeys.map((key) => ({
            id: key.id,
            ...maskKey(key.keyHash),
            revoked_at: key.revokedAt,
            last_used_at: key.lastUsedAt,
            created_at: key.createdAt,
          })),
          stats: {
            api_keys_count: appDetails.apiKeys.length,
            end_users_count: endUsersCount,
            licenses_count: licensesCount,
          },
        }),
      );
    },
  );

  app.patch(
    "/apps/:appId/settings",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      const parsed = UpdateAppSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid settings payload."));
        return;
      }

      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      if (parsed.data.default_rank_id) {
        const rank = await prisma.rank.findFirst({
          where: { id: parsed.data.default_rank_id, applicationId: appId },
          select: { id: true },
        });
        if (!rank) {
          reply
            .code(400)
            .send(errorResponse("invalid_rank", "Invalid default rank."));
          return;
        }
      }

      const updated = await prisma.application.update({
        where: { id: appId },
        data: {
          ...(parsed.data.allowed_origins
            ? { allowedOrigins: parsed.data.allowed_origins }
            : {}),
          ...(parsed.data.access_token_ttl_seconds
            ? { accessTokenTtlSeconds: parsed.data.access_token_ttl_seconds }
            : {}),
          ...(parsed.data.refresh_token_ttl_seconds
            ? { refreshTokenTtlSeconds: parsed.data.refresh_token_ttl_seconds }
            : {}),
          ...(parsed.data.email_policy !== undefined
            ? { emailPolicy: parsed.data.email_policy }
            : {}),
          ...(parsed.data.license_policy !== undefined
            ? { licensePolicy: parsed.data.license_policy }
            : {}),
          ...(parsed.data.default_rank_id !== undefined
            ? { defaultRankId: parsed.data.default_rank_id }
            : {}),
        },
      }).catch(() => null);

      if (!updated) {
        reply.code(404).send(errorResponse("not_found", "App not found."));
        return;
      }

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.apps.update_settings",
        appId,
      });

      reply.send(successResponse({}));
    },
  );

  app.post(
    "/apps/:appId/disable",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      const updated = await prisma.application.update({
        where: { id: appId },
        data: { status: "disabled" },
      }).catch(() => null);

      if (!updated) {
        reply.code(404).send(errorResponse("not_found", "App not found."));
        return;
      }

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.apps.disable",
        appId,
      });

      reply.send(successResponse({}));
    },
  );

  app.post(
    "/apps/:appId/enable",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      const updated = await prisma.application.update({
        where: { id: appId },
        data: { status: "active" },
      }).catch(() => null);

      if (!updated) {
        reply.code(404).send(errorResponse("not_found", "App not found."));
        return;
      }

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.apps.enable",
        appId,
      });

      reply.send(successResponse({}));
    },
  );

  app.post(
    "/apps/:appId/keys/:keyId/revoke",
    { preHandler: requireOwnerSession },
    async (request, reply) => {
      if (!request.ownerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId, keyId } = request.params as {
        appId: string;
        keyId: string;
      };

      const result = await prisma.apiKey.updateMany({
        where: { id: keyId, applicationId: appId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (result.count === 0) {
        reply
          .code(404)
          .send(errorResponse("not_found", "API key not found."));
        return;
      }

      await writeAuditLog({
        actorType: "owner",
        actorId: request.ownerUser.id,
        action: "owner.apps.keys.revoke",
        appId,
        metadata: { keyId },
      });

      reply.send(successResponse({}));
    },
  );
};
