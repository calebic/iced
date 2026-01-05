import Fastify from "fastify";
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

declare module "fastify" {
  interface FastifyRequest {
    ownerUser?: import("./types").AuthenticatedOwner;
    developerUser?: import("./types").AuthenticatedDeveloper;
    tenantApplication?: import("./types").TenantApplication;
    tenantApiKeyId?: string;
  }
}

export const buildServer = () => {
  const app = Fastify({
    logger: true,
  });

  app.register(cookie);
  app.register(helmet);
  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
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
  app.register(registerV1Routes);

  app.get("/health", async () => ({ status: "ok" }));

  app.addHook("onReady", async () => {
    app.log.info({ env: env.NODE_ENV }, "Iced API server ready");
  });

  return app;
};
