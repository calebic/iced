import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { prisma } from "../prisma";
import { requireDeveloperSession } from "../middleware/developerAuth";
import { writeAuditLog } from "../audit";
import { ApiKeyService } from "../services/apiKeyService";

const CreateAppSchema = z.object({
  name: z.string().min(1),
  allowed_origins: z.array(z.string()).default([]),
  access_token_ttl_seconds: z.number().int().positive().default(900),
  refresh_token_ttl_seconds: z.number().int().positive().default(1209600),
  email_policy: z.enum(["required", "optional", "disabled"]).default("required"),
  license_policy: z.enum(["required", "optional", "disabled"]).default("optional"),
  default_rank_id: z.string().uuid().optional(),
});

const UpdateSettingsSchema = z.object({
  allowed_origins: z.array(z.string()).optional(),
  access_token_ttl_seconds: z.number().int().positive().optional(),
  refresh_token_ttl_seconds: z.number().int().positive().optional(),
  email_policy: z.enum(["required", "optional", "disabled"]).optional(),
  license_policy: z.enum(["required", "optional", "disabled"]).optional(),
  default_rank_id: z.string().uuid().nullable().optional(),
});

export const ensureDeveloperApp = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!request.developerUser) {
    reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
    return null;
  }

  const { appId } = z
    .object({ appId: z.string().uuid() })
    .parse(request.params);

  const application = await prisma.application.findUnique({
    where: { id: appId },
  });

  if (!application) {
    reply.code(404).send(errorResponse("not_found", "Application not found."));
    return null;
  }

  if (application.developerUserId !== request.developerUser.id) {
    reply.code(403).send(errorResponse("forbidden", "Forbidden."));
    return null;
  }

  request.app = application;
  return application;
};

export const registerApplicationRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  app.register(async (router) => {
    router.addHook("preHandler", requireDeveloperSession);

    router.post("/apps", async (request, reply) => {
      const parsed = CreateAppSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid application payload."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const payload = parsed.data;
      if (payload.default_rank_id) {
        reply
          .code(400)
          .send(
            errorResponse(
              "invalid_rank",
              "Default rank can be set after the application is created.",
            ),
          );
        return;
      }

      const application = await prisma.application.create({
        data: {
          developerUserId: request.developerUser.id,
          name: payload.name,
          allowedOrigins: payload.allowed_origins,
          accessTokenTtlSeconds: payload.access_token_ttl_seconds,
          refreshTokenTtlSeconds: payload.refresh_token_ttl_seconds,
          emailPolicy: payload.email_policy,
          licensePolicy: payload.license_policy,
          defaultRankId: payload.default_rank_id ?? null,
        },
      });

      await ApiKeyService.ensureActiveKey(application.id);

      await writeAuditLog({
        actorType: "developer",
        actorId: request.developerUser.id,
        action: "app.create",
        appId: application.id,
      });

      reply.send(
        successResponse({
          id: application.id,
          name: application.name,
          status: application.status,
          created_at: application.createdAt,
        }),
      );
    });

    router.get("/apps", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const apps = await prisma.application.findMany({
        where: {
          developerUserId: request.developerUser.id,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      reply.send(
        successResponse(
          apps.map((appItem) => ({
            id: appItem.id,
            name: appItem.name,
            status: appItem.status,
            created_at: appItem.createdAt,
            email_policy: appItem.emailPolicy,
            license_policy: appItem.licensePolicy,
          })),
        ),
      );
    });

    router.get("/apps/:appId", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = z
        .object({ appId: z.string().uuid() })
        .parse(request.params);
      const application = await prisma.application.findFirst({
        where: {
          id: appId,
          developerUserId: request.developerUser.id,
        },
      });

      if (!application) {
        reply.code(404).send(errorResponse("not_found", "Application not found."));
        return;
      }

      reply.send(
        successResponse({
          id: application.id,
          name: application.name,
          status: application.status,
          allowed_origins: application.allowedOrigins,
          access_token_ttl_seconds: application.accessTokenTtlSeconds,
          refresh_token_ttl_seconds: application.refreshTokenTtlSeconds,
          email_policy: application.emailPolicy,
          license_policy: application.licensePolicy,
          default_rank_id: application.defaultRankId,
          created_at: application.createdAt,
        }),
      );
    });

    router.patch("/apps/:appId/settings", async (request, reply) => {
      const parsed = UpdateSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid settings payload."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = z
        .object({ appId: z.string().uuid() })
        .parse(request.params);
      const application = await prisma.application.findFirst({
        where: {
          id: appId,
          developerUserId: request.developerUser.id,
        },
      });

      if (!application) {
        reply.code(404).send(errorResponse("not_found", "Application not found."));
        return;
      }

      if (parsed.data.default_rank_id) {
        const rank = await prisma.rank.findUnique({
          where: {
            id: parsed.data.default_rank_id,
          },
        });
        if (!rank || rank.applicationId !== application.id) {
          reply
            .code(400)
            .send(errorResponse("invalid_rank", "Invalid default rank."));
          return;
        }
      }

      const updated = await prisma.application.update({
        where: {
          id: application.id,
        },
        data: {
          allowedOrigins: parsed.data.allowed_origins ?? application.allowedOrigins,
          accessTokenTtlSeconds:
            parsed.data.access_token_ttl_seconds ??
            application.accessTokenTtlSeconds,
          refreshTokenTtlSeconds:
            parsed.data.refresh_token_ttl_seconds ??
            application.refreshTokenTtlSeconds,
          emailPolicy: parsed.data.email_policy ?? application.emailPolicy,
          licensePolicy: parsed.data.license_policy ?? application.licensePolicy,
          defaultRankId:
            parsed.data.default_rank_id === undefined
              ? application.defaultRankId
              : parsed.data.default_rank_id,
        },
      });

      await writeAuditLog({
        actorType: "developer",
        actorId: request.developerUser.id,
        action: "app.update_settings",
        appId: updated.id,
      });

      reply.send(
        successResponse({
          id: updated.id,
          name: updated.name,
          status: updated.status,
          allowed_origins: updated.allowedOrigins,
          access_token_ttl_seconds: updated.accessTokenTtlSeconds,
          refresh_token_ttl_seconds: updated.refreshTokenTtlSeconds,
          email_policy: updated.emailPolicy,
          license_policy: updated.licensePolicy,
          default_rank_id: updated.defaultRankId,
        }),
      );
    });

    router.get("/apps/:appId/api-key", async (request, reply) => {
      const application = await ensureDeveloperApp(request, reply);
      if (!application) return;

      const { apiKey, last4 } = await ApiKeyService.ensureActiveKey(
        application.id,
      );

      reply.send(
        successResponse({
          hasKey: true,
          last4,
          createdAt: apiKey.apiKeyCreatedAt
            ? apiKey.apiKeyCreatedAt.toISOString()
            : null,
          lastUsedAt: apiKey.apiKeyLastUsedAt
            ? apiKey.apiKeyLastUsedAt.toISOString()
            : null,
        }),
      );
    });

    router.post("/apps/:appId/api-key/rotate", async (request, reply) => {
      const application = await ensureDeveloperApp(request, reply);
      if (!application) return;

      const rotated = await ApiKeyService.rotateKey(application.id);

      await writeAuditLog({
        actorType: "developer",
        actorId: request.developerUser.id,
        action: "app.api_key.rotate",
        appId: application.id,
        metadata: {
          api_key_id: rotated.apiKey.id,
        },
      });

      reply.send(
        successResponse({
          apiKey: rotated.plaintext,
          last4: rotated.last4,
          createdAt: rotated.apiKey.createdAt.toISOString(),
        }),
      );
    });
  });
};
