import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { prisma } from "../prisma";
import { requireTenant } from "../middleware/tenantResolver";
import { hashPassword, hashToken, generateSessionToken } from "../utils/crypto";
import { signAccessToken, verifyAccessToken } from "../utils/jwt";
import { writeAuditLog } from "../audit";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  license_key: z.string().min(1).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

const LogoutSchema = RefreshSchema;

const rateLimitConfig = { max: 10, timeWindow: "1 minute" };

const loadPermissions = async (rankId?: string | null): Promise<string[]> => {
  if (!rankId) return [];
  const rankPermissions = await prisma.rankPermission.findMany({
    where: {
      rankId,
    },
    include: {
      permission: true,
    },
  });

  return rankPermissions.map((entry) => entry.permission.name);
};

const issueTokens = async (params: {
  endUserId: string;
  appId: string;
  rankId?: string | null;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}) => {
  const permissions = await loadPermissions(params.rankId);
  const accessToken = signAccessToken(
    {
      sub: params.endUserId,
      appId: params.appId,
      rankId: params.rankId ?? null,
      permissions,
    },
    params.accessTokenTtlSeconds,
  );

  const rawRefreshToken = generateSessionToken();
  const refreshTokenHash = hashToken(rawRefreshToken);

  await prisma.endUserRefreshToken.create({
    data: {
      endUserId: params.endUserId,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + params.refreshTokenTtlSeconds * 1000),
    },
  });

  return {
    access_token: accessToken,
    refresh_token: rawRefreshToken,
    expires_in: params.accessTokenTtlSeconds,
  };
};

export const registerV1Routes = async (app: FastifyInstance): Promise<void> => {
  app.register(async (router) => {
    router.addHook("preHandler", requireTenant);

    router.post(
      "/auth/register",
      { config: { rateLimit: rateLimitConfig } },
      async (request, reply) => {
        const parsed = RegisterSchema.safeParse(request.body);
        if (!parsed.success) {
          reply
            .code(400)
            .send(
              errorResponse("invalid_request", "Invalid registration payload."),
            );
          return;
        }

        const appTenant = request.tenantApplication;
        if (!appTenant) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const { email, password, license_key } = parsed.data;
        const passwordHash = hashPassword(password);

        if (appTenant.licenseRequiredOnRegister && !license_key) {
          reply
            .code(400)
            .send(errorResponse("license_required", "License key required."));
          return;
        }

        let rankId: string | null = appTenant.defaultRankId ?? null;
        if (license_key) {
          const licenseHash = hashToken(license_key);
          const license = await prisma.license.findUnique({
            where: {
              codeHash: licenseHash,
            },
          });

          if (
            !license ||
            license.applicationId !== appTenant.id ||
            license.status !== "active" ||
            (license.expiresAt && license.expiresAt <= new Date())
          ) {
            reply
              .code(400)
              .send(errorResponse("invalid_license", "Invalid license key."));
            return;
          }

          rankId = license.rankId;

          await prisma.license.update({
            where: {
              id: license.id,
            },
            data: {
              status: "redeemed",
              redeemedAt: new Date(),
            },
          });
        }

        try {
          const endUser = await prisma.endUser.create({
            data: {
              applicationId: appTenant.id,
              email,
              passwordHash,
              rankId,
            },
          });

          if (license_key) {
            await prisma.license.update({
              where: {
                codeHash: hashToken(license_key),
              },
              data: {
                redeemedById: endUser.id,
              },
            });
          }

          const tokens = await issueTokens({
            endUserId: endUser.id,
            appId: appTenant.id,
            rankId,
            accessTokenTtlSeconds: appTenant.accessTokenTtlSeconds,
            refreshTokenTtlSeconds: appTenant.refreshTokenTtlSeconds,
          });

          await writeAuditLog({
            actorType: "end_user",
            actorId: endUser.id,
            action: "auth.register",
            appId: appTenant.id,
          });

          reply.send(successResponse(tokens));
        } catch (error) {
          request.log.error(error);
          reply
            .code(409)
            .send(errorResponse("conflict", "Email already registered."));
        }
      },
    );

    router.post(
      "/auth/login",
      { config: { rateLimit: rateLimitConfig } },
      async (request, reply) => {
        const parsed = LoginSchema.safeParse(request.body);
        if (!parsed.success) {
          reply
            .code(400)
            .send(errorResponse("invalid_request", "Invalid login payload."));
          return;
        }

        const appTenant = request.tenantApplication;
        if (!appTenant) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const { email, password } = parsed.data;
        const endUser = await prisma.endUser.findFirst({
          where: {
            applicationId: appTenant.id,
            email,
          },
        });

        if (!endUser || endUser.passwordHash !== hashPassword(password)) {
          reply
            .code(401)
            .send(errorResponse("unauthorized", "Invalid credentials."));
          return;
        }

        await prisma.endUser.update({
          where: {
            id: endUser.id,
          },
          data: {
            lastLoginAt: new Date(),
          },
        });

        const tokens = await issueTokens({
          endUserId: endUser.id,
          appId: appTenant.id,
          rankId: endUser.rankId,
          accessTokenTtlSeconds: appTenant.accessTokenTtlSeconds,
          refreshTokenTtlSeconds: appTenant.refreshTokenTtlSeconds,
        });

        await writeAuditLog({
          actorType: "end_user",
          actorId: endUser.id,
          action: "auth.login",
          appId: appTenant.id,
        });

        reply.send(successResponse(tokens));
      },
    );

    router.post(
      "/auth/refresh",
      { config: { rateLimit: rateLimitConfig } },
      async (request, reply) => {
        const parsed = RefreshSchema.safeParse(request.body);
        if (!parsed.success) {
          reply
            .code(400)
            .send(errorResponse("invalid_request", "Invalid refresh payload."));
          return;
        }

        const appTenant = request.tenantApplication;
        if (!appTenant) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const refreshTokenHash = hashToken(parsed.data.refresh_token);
        const existing = await prisma.endUserRefreshToken.findFirst({
          where: {
            tokenHash: refreshTokenHash,
          },
        });

        if (!existing) {
          reply
            .code(401)
            .send(errorResponse("unauthorized", "Invalid refresh token."));
          return;
        }

        if (existing.revokedAt || existing.expiresAt <= new Date()) {
          await prisma.endUserRefreshToken.updateMany({
            where: {
              endUserId: existing.endUserId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });
          reply
            .code(401)
            .send(errorResponse("unauthorized", "Refresh token expired."));
          return;
        }

        const endUser = await prisma.endUser.findUnique({
          where: {
            id: existing.endUserId,
          },
        });

        if (!endUser || endUser.applicationId !== appTenant.id) {
          reply
            .code(401)
            .send(errorResponse("unauthorized", "Invalid refresh token."));
          return;
        }

        const newRawRefreshToken = generateSessionToken();
        const newRefreshHash = hashToken(newRawRefreshToken);

        const [_, createdToken] = await prisma.$transaction([
          prisma.endUserRefreshToken.update({
            where: {
              id: existing.id,
            },
            data: {
              revokedAt: new Date(),
              replacedById: undefined,
            },
          }),
          prisma.endUserRefreshToken.create({
            data: {
              endUserId: endUser.id,
              tokenHash: newRefreshHash,
              expiresAt: new Date(
                Date.now() + appTenant.refreshTokenTtlSeconds * 1000,
              ),
            },
          }),
        ]);

        await prisma.endUserRefreshToken.update({
          where: {
            id: existing.id,
          },
          data: {
            replacedById: createdToken.id,
          },
        });

        const permissions = await loadPermissions(endUser.rankId);
        const accessToken = signAccessToken(
          {
            sub: endUser.id,
            appId: appTenant.id,
            rankId: endUser.rankId ?? null,
            permissions,
          },
          appTenant.accessTokenTtlSeconds,
        );

        await writeAuditLog({
          actorType: "end_user",
          actorId: endUser.id,
          action: "auth.refresh",
          appId: appTenant.id,
        });

        reply.send(
          successResponse({
            access_token: accessToken,
            refresh_token: newRawRefreshToken,
            expires_in: appTenant.accessTokenTtlSeconds,
          }),
        );
      },
    );

    router.post(
      "/auth/logout",
      { config: { rateLimit: rateLimitConfig } },
      async (request, reply) => {
        const parsed = LogoutSchema.safeParse(request.body);
        if (!parsed.success) {
          reply
            .code(400)
            .send(errorResponse("invalid_request", "Invalid logout payload."));
          return;
        }

        const appTenant = request.tenantApplication;
        if (!appTenant) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const refreshHash = hashToken(parsed.data.refresh_token);
        const token = await prisma.endUserRefreshToken.findFirst({
          where: {
            tokenHash: refreshHash,
          },
        });

        if (!token) {
          reply
            .code(200)
            .send(successResponse({}));
          return;
        }

        await prisma.endUserRefreshToken.updateMany({
          where: {
            tokenHash: refreshHash,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });

        const endUser = await prisma.endUser.findUnique({
          where: {
            id: token.endUserId,
          },
        });

        if (endUser) {
          await writeAuditLog({
            actorType: "end_user",
            actorId: endUser.id,
            action: "auth.logout",
            appId: appTenant.id,
          });
        }

        reply.send(successResponse({}));
      },
    );

    router.get("/me", async (request, reply) => {
      const appTenant = request.tenantApplication;
      if (!appTenant) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        reply.code(401).send(errorResponse("unauthorized", "Bearer token required."));
        return;
      }

      try {
        const token = authHeader.replace("Bearer ", "");
        const payload = verifyAccessToken(token);

        if (payload.appId !== appTenant.id) {
          reply.code(403).send(errorResponse("forbidden", "Invalid token scope."));
          return;
        }

        const endUser = await prisma.endUser.findUnique({
          where: {
            id: payload.sub,
          },
        });

        if (!endUser || endUser.applicationId !== appTenant.id) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        reply.send(
          successResponse({
            id: endUser.id,
            email: endUser.email,
            rank_id: endUser.rankId,
            permissions: payload.permissions,
          }),
        );
      } catch (error) {
        request.log.error(error);
        reply.code(401).send(errorResponse("unauthorized", "Invalid token."));
      }
    });
  }, { prefix: "/v1" });
};
