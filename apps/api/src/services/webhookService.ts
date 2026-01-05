import { createHmac, randomBytes } from "node:crypto";
import type {
  EventLog,
  Prisma,
  Webhook,
  WebhookDelivery,
  WebhookDeliveryStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import { decryptWebhookSecret, encryptWebhookSecret } from "../utils/webhookCrypto";

const MAX_DELIVERY_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60_000;

export type WebhookListFilters = {
  enabled?: boolean;
};

export type WebhookDeliveryFilters = {
  status?: WebhookDeliveryStatus;
  eventType?: string;
  webhookId?: string;
  page?: number;
  pageSize?: number;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

const generateSecret = (): string => randomBytes(32).toString("hex");

const ensureApplication = async (appId: string) => {
  const application = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true },
  });

  if (!application) {
    throw new Error("Application not found.");
  }
};

const computeBackoff = (attempt: number) =>
  BASE_BACKOFF_MS * Math.pow(2, Math.max(attempt - 1, 0));

const signPayload = (secret: string, payload: string) => {
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${digest}`;
};

const deliverWebhook = async (delivery: WebhookDelivery & { webhook: Webhook }) => {
  if (!delivery.webhook.enabled) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        lastError: "Webhook disabled.",
      },
    });
    return;
  }

  if (delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
    return;
  }

  const attempt = delivery.attemptCount + 1;
  const payload = JSON.stringify(delivery.payloadJson);
  const secret = decryptWebhookSecret(delivery.webhook.secretCipher);
  const signature = signPayload(secret, payload);

  try {
    const response = await fetch(delivery.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Iced-Signature": signature,
        "X-Iced-Event": delivery.eventType,
        "X-Iced-Delivery-Id": delivery.id,
      },
      body: payload,
    });

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "sent",
          attemptCount: attempt,
          lastStatusCode: response.status,
          lastError: null,
          nextAttemptAt: new Date(),
        },
      });
      return;
    }

    const status = attempt >= MAX_DELIVERY_ATTEMPTS ? "failed" : "pending";
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        attemptCount: attempt,
        lastStatusCode: response.status,
        lastError: `HTTP ${response.status}`,
        nextAttemptAt: new Date(Date.now() + computeBackoff(attempt)),
      },
    });
  } catch (error) {
    const status = attempt >= MAX_DELIVERY_ATTEMPTS ? "failed" : "pending";
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        attemptCount: attempt,
        lastStatusCode: null,
        lastError: error instanceof Error ? error.message : "Unknown error",
        nextAttemptAt: new Date(Date.now() + computeBackoff(attempt)),
      },
    });
  }
};

export const WebhookService = {
  async createWebhook(appId: string, params: {
    url: string;
    events: string[];
    enabled?: boolean;
  }): Promise<{ webhook: Webhook; plaintextSecret: string }> {
    await ensureApplication(appId);

    const secret = generateSecret();
    const webhook = await prisma.webhook.create({
      data: {
        appId,
        url: params.url,
        events: params.events,
        enabled: params.enabled ?? true,
        secretCipher: encryptWebhookSecret(secret),
      },
    });

    return { webhook, plaintextSecret: secret };
  },

  async updateWebhook(
    appId: string,
    webhookId: string,
    params: { url?: string; events?: string[]; enabled?: boolean },
  ): Promise<Webhook> {
    await ensureApplication(appId);

    const updated = await prisma.webhook.updateMany({
      where: { id: webhookId, appId },
      data: {
        ...(params.url ? { url: params.url } : {}),
        ...(params.events ? { events: params.events } : {}),
        ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      },
    });

    if (updated.count === 0) {
      throw new Error("Webhook not found.");
    }

    const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) {
      throw new Error("Webhook not found.");
    }

    return webhook;
  },

  async deleteWebhook(appId: string, webhookId: string): Promise<void> {
    await ensureApplication(appId);

    const deleted = await prisma.webhook.deleteMany({
      where: { id: webhookId, appId },
    });

    if (deleted.count === 0) {
      throw new Error("Webhook not found.");
    }
  },

  async listWebhooks(
    appId: string,
    filters: WebhookListFilters = {},
  ): Promise<Webhook[]> {
    await ensureApplication(appId);

    return prisma.webhook.findMany({
      where: {
        appId,
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async listDeliveries(
    appId: string,
    filters: WebhookDeliveryFilters = {},
  ): Promise<PaginatedResult<WebhookDelivery>> {
    await ensureApplication(appId);

    const pageSize = Math.min(filters.pageSize ?? 50, 200);
    const page = Math.max(filters.page ?? 1, 1);

    const where: Prisma.WebhookDeliveryWhereInput = {
      appId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.webhookId ? { webhookId: filters.webhookId } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    return { items, page, pageSize, total };
  },

  async enqueueDeliveriesForEvent(event: EventLog): Promise<void> {
    const webhooks = await prisma.webhook.findMany({
      where: {
        appId: event.appId,
        enabled: true,
        events: {
          has: event.eventType,
        },
      },
    });

    if (webhooks.length === 0) {
      return;
    }

    const now = new Date();
    const payload = {
      id: event.id,
      app_id: event.appId,
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
    };

    await prisma.webhookDelivery.createMany({
      data: webhooks.map((webhook) => ({
        webhookId: webhook.id,
        appId: event.appId,
        eventType: event.eventType,
        payloadJson: payload,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
      })),
    });

    const createdAfter = new Date(now.getTime() - 1000);
    const createdDeliveries = await prisma.webhookDelivery.findMany({
      where: {
        appId: event.appId,
        eventType: event.eventType,
        createdAt: {
          gte: createdAfter,
        },
        webhookId: { in: webhooks.map((webhook) => webhook.id) },
      },
      include: {
        webhook: true,
      },
    });

    await Promise.all(
      createdDeliveries.map((delivery) => deliverWebhook(delivery)),
    );
  },

  async processDueDeliveries(): Promise<void> {
    const now = new Date();
    const deliveries = await prisma.webhookDelivery.findMany({
      where: {
        status: "pending",
        attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
        nextAttemptAt: { lte: now },
      },
      include: { webhook: true },
    });

    await Promise.all(deliveries.map((delivery) => deliverWebhook(delivery)));
  },
};
