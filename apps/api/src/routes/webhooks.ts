import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { requireDeveloperSession } from "../middleware/developerAuth";
import { prisma } from "../prisma";
import { WebhookService } from "../services/webhookService";

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  enabled: z.boolean().optional(),
});

const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).min(1).optional(),
  enabled: z.boolean().optional(),
});

const ListDeliveriesSchema = z.object({
  event_type: z.string().min(1).optional(),
  status: z.enum(["pending", "sent", "failed"]).optional(),
  webhook_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const ensureDeveloperApp = async (appId: string, developerId: string) => {
  const application = await prisma.application.findFirst({
    where: { id: appId, developerUserId: developerId },
    select: { id: true },
  });

  if (!application) {
    throw new Error("Application not found.");
  }
};

const formatWebhook = (webhook: {
  id: string;
  url: string;
  enabled: boolean;
  events: string[];
  createdAt: Date;
}) => ({
  id: webhook.id,
  url: webhook.url,
  enabled: webhook.enabled,
  events: webhook.events,
  created_at: webhook.createdAt,
});

export const registerWebhookRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  app.register(async (router) => {
    router.addHook("preHandler", requireDeveloperSession);

    router.post("/apps/:appId/webhooks", async (request, reply) => {
      const parsed = CreateWebhookSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid webhook payload."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      await ensureDeveloperApp(appId, request.developerUser.id);

      const { webhook, plaintextSecret } = await WebhookService.createWebhook(
        appId,
        parsed.data,
      );

      reply.send(
        successResponse({
          webhook: formatWebhook(webhook),
          secret: plaintextSecret,
        }),
      );
    });

    router.get("/apps/:appId/webhooks", async (request, reply) => {
      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      await ensureDeveloperApp(appId, request.developerUser.id);

      const webhooks = await WebhookService.listWebhooks(appId);

      reply.send(
        successResponse({
          items: webhooks.map(formatWebhook),
        }),
      );
    });

    router.patch("/apps/:appId/webhooks/:webhookId", async (request, reply) => {
      const parsed = UpdateWebhookSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid webhook payload."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId, webhookId } = request.params as {
        appId: string;
        webhookId: string;
      };

      await ensureDeveloperApp(appId, request.developerUser.id);

      const webhook = await WebhookService.updateWebhook(
        appId,
        webhookId,
        parsed.data,
      );

      reply.send(
        successResponse({
          webhook: formatWebhook(webhook),
        }),
      );
    });

    router.delete(
      "/apps/:appId/webhooks/:webhookId",
      async (request, reply) => {
        if (!request.developerUser) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const { appId, webhookId } = request.params as {
          appId: string;
          webhookId: string;
        };

        await ensureDeveloperApp(appId, request.developerUser.id);
        await WebhookService.deleteWebhook(appId, webhookId);

        reply.send(successResponse({}));
      },
    );

    router.get("/apps/:appId/webhooks/deliveries", async (request, reply) => {
      const parsed = ListDeliveriesSchema.safeParse(request.query);
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

      const result = await WebhookService.listDeliveries(appId, {
        eventType: parsed.data.event_type,
        status: parsed.data.status,
        webhookId: parsed.data.webhook_id,
        page: parsed.data.page,
        pageSize: parsed.data.page_size,
      });

      reply.send(
        successResponse({
          items: result.items.map((delivery) => ({
            id: delivery.id,
            webhook_id: delivery.webhookId,
            app_id: delivery.appId,
            event_type: delivery.eventType,
            payload_json: delivery.payloadJson,
            status: delivery.status,
            attempt_count: delivery.attemptCount,
            next_attempt_at: delivery.nextAttemptAt,
            last_error: delivery.lastError,
            last_status_code: delivery.lastStatusCode,
            created_at: delivery.createdAt,
            updated_at: delivery.updatedAt,
          })),
          page: result.page,
          page_size: result.pageSize,
          total: result.total,
        }),
      );
    });
  });
};
