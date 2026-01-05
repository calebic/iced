import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { requireDeveloperSession } from "../middleware/developerAuth";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit";
import { writeEventLog } from "../eventLog";

const ListUsersSchema = z.object({
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const UpdateUserSchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  rank_id: z.string().uuid().nullable().optional(),
});

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

const ensureDeveloperApp = async (appId: string, developerId: string) => {
  const application = await prisma.application.findFirst({
    where: { id: appId, developerUserId: developerId },
    select: { id: true },
  });

  if (!application) {
    throw new Error("Application not found.");
  }
};

export const registerEndUserRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  app.register(async (router) => {
    router.addHook("preHandler", requireDeveloperSession);

    router.get("/apps/:appId/users", async (request, reply) => {
      const parsed = ListUsersSchema.safeParse(request.query);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid query filters."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      await ensureDeveloperApp(appId, request.developerUser.id);

      const pageSize = Math.min(
        parsed.data.pageSize ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      );
      const page = Math.max(parsed.data.page ?? 1, 1);

      const where = {
        applicationId: appId,
        ...(parsed.data.search
          ? { email: { contains: parsed.data.search, mode: "insensitive" } }
          : {}),
      };

      const [users, total] = await prisma.$transaction([
        prisma.endUser.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.endUser.count({ where }),
      ]);

      reply.send(
        successResponse({
          items: users.map((user) => ({
            id: user.id,
            email: user.email,
            status: user.status,
            rank_id: user.rankId,
            created_at: user.createdAt,
            last_login_at: user.lastLoginAt,
          })),
          page,
          pageSize,
          total,
        }),
      );
    });

    router.patch("/apps/:appId/users/:userId", async (request, reply) => {
      const parsed = UpdateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid update payload."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId, userId } = request.params as {
        appId: string;
        userId: string;
      };

      await ensureDeveloperApp(appId, request.developerUser.id);

      const { status, rank_id: rankId } = parsed.data;
      if (rankId !== undefined && rankId !== null) {
        const rank = await prisma.rank.findFirst({
          where: { id: rankId, applicationId: appId },
          select: { id: true },
        });
        if (!rank) {
          reply
            .code(400)
            .send(errorResponse("invalid_rank", "Invalid rank."));
          return;
        }
      }

      const updated = await prisma.endUser.updateMany({
        where: { id: userId, applicationId: appId },
        data: {
          ...(status ? { status } : {}),
          ...(rankId !== undefined ? { rankId } : {}),
        },
      });

      if (updated.count === 0) {
        reply.code(404).send(errorResponse("not_found", "User not found."));
        return;
      }

      const user = await prisma.endUser.findUnique({ where: { id: userId } });
      if (!user) {
        reply.code(404).send(errorResponse("not_found", "User not found."));
        return;
      }

      if (status) {
        await writeAuditLog({
          actorType: "developer",
          actorId: request.developerUser.id,
          action: status === "disabled" ? "end_user.disable" : "end_user.enable",
          appId,
          metadata: { endUserId: userId },
        });

        await writeEventLog({
          appId,
          eventType: status === "disabled" ? "end_user.disabled" : "end_user.enabled",
          request,
          statusCode: reply.statusCode,
          metadata: { endUserId: userId },
        });
      }

      if (rankId !== undefined) {
        await writeAuditLog({
          actorType: "developer",
          actorId: request.developerUser.id,
          action: "end_user.rank_changed",
          appId,
          metadata: { endUserId: userId, rankId },
        });

        await writeEventLog({
          appId,
          eventType: "end_user.rank_changed",
          request,
          statusCode: reply.statusCode,
          metadata: { endUserId: userId, rankId },
        });
      }

      reply.send(
        successResponse({
          user: {
            id: user.id,
            email: user.email,
            status: user.status,
            rank_id: user.rankId,
            created_at: user.createdAt,
            last_login_at: user.lastLoginAt,
          },
        }),
      );
    });

    router.post(
      "/apps/:appId/users/:userId/revoke-sessions",
      async (request, reply) => {
        if (!request.developerUser) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const { appId, userId } = request.params as {
          appId: string;
          userId: string;
        };

        await ensureDeveloperApp(appId, request.developerUser.id);

        const user = await prisma.endUser.findFirst({
          where: { id: userId, applicationId: appId },
          select: { id: true },
        });

        if (!user) {
          reply.code(404).send(errorResponse("not_found", "User not found."));
          return;
        }

        await prisma.endUserRefreshToken.updateMany({
          where: { endUserId: userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await writeAuditLog({
          actorType: "developer",
          actorId: request.developerUser.id,
          action: "end_user.sessions_revoked",
          appId,
          metadata: { endUserId: userId },
        });

        await writeEventLog({
          appId,
          eventType: "end_user.sessions_revoked",
          request,
          statusCode: reply.statusCode,
          metadata: { endUserId: userId },
        });

        reply.send(successResponse({}));
      },
    );
  });
};
