import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { errorResponse } from "@iced/shared";
import { env } from "./env";
import { registerOwnerRoutes } from "./routes/owner";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerV1Routes } from "./routes/v1";
import { registerApplicationRoutes } from "./routes/applications";
import { registerRankPermissionRoutes } from "./routes/ranks";
import { registerLicenseRoutes } from "./routes/licenses";
import { registerEventRoutes } from "./routes/events";
import { registerWebhookRoutes } from "./routes/webhooks";
import { registerEndUserRoutes } from "./routes/endUsers";

declare module "fastify" {
  interface FastifyRequest {
    ownerUser?: import("./types").AuthenticatedOwner;
    developerUser?: import("./types").AuthenticatedDeveloper;
    tenantApplication?: import("./types").TenantApplication;
    tenantApiKeyId?: string;
    app?: import("./types").TenantApplication;
  }
}

export const buildServer = () => {
  const isDev = env.NODE_ENV === "development";
  const logLevel = (process.env.LOG_LEVEL ?? "info").toLowerCase();

  const app = Fastify({
    logger: isDev
      ? {
          level: logLevel,
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              levelFirst: true,
              singleLine: true,
              translateTime: false,
              ignore: "pid,hostname,time",
              messageFormat: "{msg}",
            },
          },
        }
      : {
          level: logLevel,
        },
  });

  app.register(cookie);
  app.register(cors, {
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
    credentials: true,
  });
  app.register(helmet);
  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  app.addHook("onResponse", async (request, reply) => {
    const statusCode = reply.statusCode;
    const method = request.method;
    const route = request.routeOptions?.url ?? request.raw.url ?? request.url;
    const responseTime = reply.getResponseTime().toFixed(1);

    if (method === "GET" && statusCode >= 200 && statusCode < 300) {
      return;
    }

    const message = `[${method}] ${route} → ${statusCode} (${responseTime} ms)`;
    if (statusCode >= 500) {
      request.log.error(message);
    } else if (statusCode >= 400) {
      request.log.warn(message);
    } else {
      request.log.info(message);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const route = request.routeOptions?.url ?? request.raw.url ?? request.url;
    const prismaCode =
      typeof (error as { code?: string }).code === "string"
        ? (error as { code?: string }).code
        : null;
    const message = prismaCode
      ? `DB ERROR (${prismaCode}): ${error.message}`
      : error.message;
    const logPayload = {
      route,
      statusCode,
      prismaCode: prismaCode ?? undefined,
    };
    const includeStack = !isDev || logLevel === "debug";

    if (statusCode >= 500) {
      if (includeStack) {
        request.log.error({ ...logPayload, err: error }, message);
      } else {
        request.log.error(logPayload, message);
      }
    } else {
      request.log.warn(logPayload, message);
    }

    reply
      .code(statusCode)
      .send(
        errorResponse(
          statusCode >= 500 ? "server_error" : "request_error",
          statusCode >= 500 ? "Unexpected error." : error.message,
        ),
      );
  });

  app.register(registerOwnerRoutes, { prefix: "/owner" });
  app.register(registerDashboardRoutes, { prefix: "/dashboard" });
  app.register(registerApplicationRoutes, { prefix: "/dashboard" });
  app.register(registerRankPermissionRoutes, { prefix: "/dashboard" });
  app.register(registerLicenseRoutes, { prefix: "/dashboard" });
  app.register(registerEventRoutes, { prefix: "/dashboard" });
  app.register(registerWebhookRoutes, { prefix: "/dashboard" });
  app.register(registerEndUserRoutes, { prefix: "/dashboard" });
  app.register(registerV1Routes);

  app.get("/health", async () => ({
    ok: true,
    service: "iced-api",
    time: new Date().toISOString(),
  }));

  app.addHook("onReady", async () => {
    app.log.info({ env: env.NODE_ENV }, "Iced API server ready");
  });

  return app;
};
