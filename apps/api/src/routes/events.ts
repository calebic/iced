import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { prisma } from "../prisma";
import { requireDeveloperSession } from "../middleware/developerAuth";

const ListEventsSchema = z.object({
  event_type: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
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

export const registerEventRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  app.register(async (router) => {
    router.addHook("preHandler", requireDeveloperSession);

    router.get("/apps/:appId/events", async (request, reply) => {
      const parsed = ListEventsSchema.safeParse(request.query);
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
        parsed.data.page_size ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      );
      const page = Math.max(parsed.data.page ?? 1, 1);

      const where = {
        appId,
        ...(parsed.data.event_type
          ? { eventType: parsed.data.event_type }
          : {}),
      };

      const [items, total] = await prisma.$transaction([
        prisma.eventLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.eventLog.count({ where }),
      ]);

      reply.send(
        successResponse({
          items: items.map((event) => ({
            id: event.id,
            event_type: event.eventType,
            request_id: event.requestId,
            ip: event.ip,
            user_agent: event.userAgent,
            method: event.method,
            path: event.path,
            status_code: event.statusCode,
            api_key_id: event.apiKeyId,
            metadata: event.metadata,
            created_at: event.createdAt,
          })),
          page,
          page_size: pageSize,
          total,
        }),
      );
    });
  });
};
