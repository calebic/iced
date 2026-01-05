import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { prisma } from "../prisma";
import { requireDeveloperSession } from "../middleware/developerAuth";
import { writeAuditLog } from "../audit";

const RankSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int(),
});

const PermissionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const parseAppParams = (params: unknown) =>
  z.object({ appId: z.string().uuid() }).parse(params);

const parseRankParams = (params: unknown) =>
  z.object({ appId: z.string().uuid(), rankId: z.string().uuid() }).parse(
    params,
  );

const parsePermissionParams = (params: unknown) =>
  z
    .object({ appId: z.string().uuid(), permissionId: z.string().uuid() })
    .parse(params);

export const registerRankPermissionRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  app.register(async (router) => {
    router.addHook("preHandler", requireDeveloperSession);

    router.post("/apps/:appId/ranks", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const parsed = RankSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid rank payload."));
        return;
      }

      const { appId } = parseAppParams(request.params);
      const application = await prisma.application.findFirst({
        where: {
          id: appId,
          developerUserId: request.developerUser?.id,
        },
      });

      if (!application) {
        reply.code(404).send(errorResponse("not_found", "Application not found."));
        return;
      }

      try {
        const rank = await prisma.rank.create({
          data: {
            applicationId: application.id,
            name: parsed.data.name,
            description: parsed.data.description,
            priority: parsed.data.priority,
          },
        });

        await writeAuditLog({
          actorType: "developer",
          actorId: request.developerUser.id,
          action: "rank.create",
          appId: application.id,
          metadata: {
            rank_id: rank.id,
          },
        });

        reply.send(
          successResponse({
            id: rank.id,
            name: rank.name,
            description: rank.description,
            priority: rank.priority,
          }),
        );
      } catch (error) {
        request.log.error(error);
        reply
          .code(409)
          .send(errorResponse("conflict", "Rank already exists."));
      }
    });

    router.get("/apps/:appId/ranks", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = parseAppParams(request.params);
      const ranks = await prisma.rank.findMany({
        where: {
          applicationId: appId,
          application: {
            developerUserId: request.developerUser.id,
          },
        },
        orderBy: {
          priority: "desc",
        },
      });

      reply.send(
        successResponse(
          ranks.map((rank) => ({
            id: rank.id,
            name: rank.name,
            description: rank.description,
            priority: rank.priority,
          })),
        ),
      );
    });

    router.get("/apps/:appId/ranks/:rankId", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId, rankId } = parseRankParams(request.params);
      const rank = await prisma.rank.findFirst({
        where: {
          id: rankId,
          applicationId: appId,
          application: {
            developerUserId: request.developerUser.id,
          },
        },
      });

      if (!rank) {
        reply.code(404).send(errorResponse("not_found", "Rank not found."));
        return;
      }

      reply.send(
        successResponse({
          id: rank.id,
          name: rank.name,
          description: rank.description,
          priority: rank.priority,
        }),
      );
    });

    router.patch("/apps/:appId/ranks/:rankId", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const parsed = RankSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid rank payload."));
        return;
      }

      const { appId, rankId } = parseRankParams(request.params);
      const rank = await prisma.rank.findFirst({
        where: {
          id: rankId,
          applicationId: appId,
          application: {
            developerUserId: request.developerUser.id,
          },
        },
      });

      if (!rank) {
        reply.code(404).send(errorResponse("not_found", "Rank not found."));
        return;
      }

      const updated = await prisma.rank.update({
        where: { id: rank.id },
        data: {
          name: parsed.data.name ?? rank.name,
          description: parsed.data.description ?? rank.description,
          priority: parsed.data.priority ?? rank.priority,
        },
      });

      await writeAuditLog({
        actorType: "developer",
        actorId: request.developerUser.id,
        action: "rank.update",
        appId: appId,
        metadata: {
          rank_id: updated.id,
        },
      });

      reply.send(
        successResponse({
          id: updated.id,
          name: updated.name,
          description: updated.description,
          priority: updated.priority,
        }),
      );
    });

    router.delete("/apps/:appId/ranks/:rankId", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId, rankId } = parseRankParams(request.params);
      const rank = await prisma.rank.findFirst({
        where: {
          id: rankId,
          applicationId: appId,
          application: {
            developerUserId: request.developerUser.id,
          },
        },
      });

      if (!rank) {
        reply.code(404).send(errorResponse("not_found", "Rank not found."));
        return;
      }

      await prisma.rank.delete({
        where: { id: rank.id },
      });

      await writeAuditLog({
        actorType: "developer",
        actorId: request.developerUser.id,
        action: "rank.delete",
        appId: appId,
        metadata: {
          rank_id: rank.id,
        },
      });

      reply.send(successResponse({}));
    });

    router.post("/apps/:appId/permissions", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const parsed = PermissionSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid permission payload."));
        return;
      }

      const { appId } = parseAppParams(request.params);
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

      try {
        const permission = await prisma.permission.create({
          data: {
            applicationId: application.id,
            name: parsed.data.name,
            description: parsed.data.description,
          },
        });

        await writeAuditLog({
          actorType: "developer",
          actorId: request.developerUser.id,
          action: "permission.create",
          appId: application.id,
          metadata: {
            permission_id: permission.id,
          },
        });

        reply.send(
          successResponse({
            id: permission.id,
            name: permission.name,
            description: permission.description,
          }),
        );
      } catch (error) {
        request.log.error(error);
        reply
          .code(409)
          .send(errorResponse("conflict", "Permission already exists."));
      }
    });

    router.get("/apps/:appId/permissions", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = parseAppParams(request.params);
      const permissions = await prisma.permission.findMany({
        where: {
          applicationId: appId,
          application: {
            developerUserId: request.developerUser.id,
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      reply.send(
        successResponse(
          permissions.map((permission) => ({
            id: permission.id,
            name: permission.name,
            description: permission.description,
          })),
        ),
      );
    });

    router.get(
      "/apps/:appId/permissions/:permissionId",
      async (request, reply) => {
        if (!request.developerUser) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const { appId, permissionId } = parsePermissionParams(request.params);
        const permission = await prisma.permission.findFirst({
          where: {
            id: permissionId,
            applicationId: appId,
            application: {
              developerUserId: request.developerUser.id,
            },
          },
        });

        if (!permission) {
          reply
            .code(404)
            .send(errorResponse("not_found", "Permission not found."));
          return;
        }

        reply.send(
          successResponse({
            id: permission.id,
            name: permission.name,
            description: permission.description,
          }),
        );
      },
    );

    router.patch(
      "/apps/:appId/permissions/:permissionId",
      async (request, reply) => {
        if (!request.developerUser) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const parsed = PermissionSchema.partial().safeParse(request.body);
        if (!parsed.success) {
          reply
            .code(400)
            .send(errorResponse("invalid_request", "Invalid permission payload."));
          return;
        }

        const { appId, permissionId } = parsePermissionParams(request.params);
        const permission = await prisma.permission.findFirst({
          where: {
            id: permissionId,
            applicationId: appId,
            application: {
              developerUserId: request.developerUser.id,
            },
          },
        });

        if (!permission) {
          reply
            .code(404)
            .send(errorResponse("not_found", "Permission not found."));
          return;
        }

        const updated = await prisma.permission.update({
          where: { id: permission.id },
          data: {
            name: parsed.data.name ?? permission.name,
            description: parsed.data.description ?? permission.description,
          },
        });

        await writeAuditLog({
          actorType: "developer",
          actorId: request.developerUser.id,
          action: "permission.update",
          appId: appId,
          metadata: {
            permission_id: updated.id,
          },
        });

        reply.send(
          successResponse({
            id: updated.id,
            name: updated.name,
            description: updated.description,
          }),
        );
      },
    );

    router.delete(
      "/apps/:appId/permissions/:permissionId",
      async (request, reply) => {
        if (!request.developerUser) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const { appId, permissionId } = parsePermissionParams(request.params);
        const permission = await prisma.permission.findFirst({
          where: {
            id: permissionId,
            applicationId: appId,
            application: {
              developerUserId: request.developerUser.id,
            },
          },
        });

        if (!permission) {
          reply
            .code(404)
            .send(errorResponse("not_found", "Permission not found."));
          return;
        }

        await prisma.permission.delete({
          where: { id: permission.id },
        });

        await writeAuditLog({
          actorType: "developer",
          actorId: request.developerUser.id,
          action: "permission.delete",
          appId: appId,
          metadata: {
            permission_id: permission.id,
          },
        });

        reply.send(successResponse({}));
      },
    );

    router.put(
      "/apps/:appId/ranks/:rankId/permissions",
      async (request, reply) => {
        if (!request.developerUser) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const parsed = z
          .object({
            permission_ids: z.array(z.string().uuid()),
          })
          .safeParse(request.body);
        if (!parsed.success) {
          reply
            .code(400)
            .send(
              errorResponse("invalid_request", "Invalid permission assignment."),
            );
          return;
        }

        const { appId, rankId } = parseRankParams(request.params);
        const rank = await prisma.rank.findFirst({
          where: {
            id: rankId,
            applicationId: appId,
            application: {
              developerUserId: request.developerUser.id,
            },
          },
        });

        if (!rank) {
          reply.code(404).send(errorResponse("not_found", "Rank not found."));
          return;
        }

        const permissions = await prisma.permission.findMany({
          where: {
            id: {
              in: parsed.data.permission_ids,
            },
            applicationId: appId,
            application: {
              developerUserId: request.developerUser.id,
            },
          },
        });

        if (permissions.length !== parsed.data.permission_ids.length) {
          reply
            .code(400)
            .send(errorResponse("invalid_request", "Invalid permissions."));
          return;
        }

        await prisma.$transaction([
          prisma.rankPermission.deleteMany({
            where: {
              rankId: rank.id,
            },
          }),
          prisma.rankPermission.createMany({
            data: parsed.data.permission_ids.map((permissionId) => ({
              rankId: rank.id,
              permissionId,
            })),
          }),
        ]);

        await writeAuditLog({
          actorType: "developer",
          actorId: request.developerUser.id,
          action: "rank.permissions.update",
          appId: appId,
          metadata: {
            rank_id: rank.id,
            permission_ids: parsed.data.permission_ids,
          },
        });

        reply.send(successResponse({}));
      },
    );
  });
};
