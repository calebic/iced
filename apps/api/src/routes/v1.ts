import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { prisma } from "../prisma";
import { requireTenant } from "../middleware/tenantResolver";
import { hashPassword, hashToken, generateSessionToken } from "../utils/crypto";
import { signAccessToken, verifyAccessToken } from "../utils/jwt";
import { writeAuditLog } from "../audit";
import { writeEventLog } from "../eventLog";

const RegisterSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(8),
  email: z.string().trim().email().optional(),
  licenseCode: z.string().min(1).optional(),
});

const LoginSchema = z
  .object({
    username: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    password: z.string().min(8),
  })
  .refine((data) => data.username || data.email, {
    message: "Username or email required.",
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

const applyRankExpiry = async (params: {
  endUserId: string;
  rankId: string | null;
  rankExpiresAt: Date | null;
  appDefaultRankId: string | null;
}): Promise<{
  rankId: string | null;
  rankExpiresAt: Date | null;
}> => {
  if (!params.rankExpiresAt || params.rankExpiresAt > new Date()) {
    return {
      rankId: params.rankId,
      rankExpiresAt: params.rankExpiresAt,
    };
  }

  const updated = await prisma.endUser.update({
    where: {
      id: params.endUserId,
    },
    data: {
      rankId: params.appDefaultRankId,
      rankExpiresAt: null,
      rankSourceLicenseId: null,
    },
  });

  return {
    rankId: updated.rankId ?? null,
    rankExpiresAt: updated.rankExpiresAt,
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

        const { username, password, email, licenseCode } = parsed.data;
        const normalizedUsername = username.trim().toLowerCase();
        if (!normalizedUsername) {
          reply
            .code(400)
            .send(errorResponse("invalid_request", "Username required."));
          return;
        }

        if (appTenant.emailPolicy === "required" && !email) {
          reply
            .code(400)
            .send(errorResponse("email_required", "Email required."));
          return;
        }

        if (appTenant.emailPolicy === "disabled" && email) {
          reply
            .code(400)
            .send(errorResponse("email_not_allowed", "Email is disabled."));
          return;
        }

        if (appTenant.licensePolicy === "required" && !licenseCode) {
          reply
            .code(400)
            .send(errorResponse("license_required", "License code required."));
          return;
        }

        if (appTenant.licensePolicy === "disabled" && licenseCode) {
          reply
            .code(400)
            .send(
              errorResponse("license_not_allowed", "License codes are disabled."),
            );
          return;
        }

        const passwordHash = hashPassword(password);
        const now = new Date();
        const licenseHash = licenseCode ? hashToken(licenseCode) : null;

        try {
          const { endUser, redeemedLicense } = await prisma.$transaction(
            async (tx) => {
              const createdEndUser = await tx.endUser.create({
                data: {
                  applicationId: appTenant.id,
                  username: username.trim(),
                  usernameNormalized: normalizedUsername,
                  email: email ?? null,
                  passwordHash,
                  rankId: appTenant.defaultRankId ?? null,
                },
              });

              let updatedEndUser = createdEndUser;
              let redeemedLicense = null;

              if (licenseCode && licenseHash) {
                const license = await tx.license.findUnique({
                  where: {
                    codeHash: licenseHash,
                  },
                });

                if (!license || license.applicationId !== appTenant.id) {
                  throw new Error("license:Invalid license code.");
                }

                if (license.status !== "active" || license.revokedAt) {
                  throw new Error("license:License is not active.");
                }

                if (license.expiresAt && license.expiresAt <= now) {
                  await tx.license.update({
                    where: { id: license.id },
                    data: { status: "expired" },
                  });
                  throw new Error("license:License expired.");
                }

                if (license.maxUses && license.useCount >= license.maxUses) {
                  await tx.license.update({
                    where: { id: license.id },
                    data: { status: "redeemed" },
                  });
                  throw new Error("license:License usage exhausted.");
                }

                const nextUseCount = license.useCount + 1;
                const status =
                  license.maxUses && nextUseCount >= license.maxUses
                    ? "redeemed"
                    : license.status;

                redeemedLicense = await tx.license.update({
                  where: {
                    id: license.id,
                  },
                  data: {
                    useCount: nextUseCount,
                    redeemedAt: now,
                    redeemedById: createdEndUser.id,
                    status,
                  },
                });

                const rankExpiresAt = redeemedLicense.durationSeconds
                  ? new Date(
                      now.getTime() + redeemedLicense.durationSeconds * 1000,
                    )
                  : null;

                updatedEndUser = await tx.endUser.update({
                  where: {
                    id: createdEndUser.id,
                  },
                  data: {
                    rankId: redeemedLicense.rankId,
                    rankExpiresAt,
                    rankSourceLicenseId: redeemedLicense.id,
                  },
                });
              }

              return {
                endUser: updatedEndUser,
                redeemedLicense,
              };
            },
          );

          if (redeemedLicense) {
            await writeEventLog({
              appId: appTenant.id,
              eventType: "license.redeemed",
              request,
              statusCode: reply.statusCode,
              apiKeyId: request.tenantApiKeyId,
              metadata: { licenseId: redeemedLicense.id, endUserId: endUser.id },
            });
          }

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
            action: "auth.register",
            appId: appTenant.id,
          });

          await writeEventLog({
            appId: appTenant.id,
            eventType: "end_user.registered",
            request,
            statusCode: reply.statusCode,
            apiKeyId: request.tenantApiKeyId,
            metadata: { endUserId: endUser.id },
          });

          reply.send(successResponse(tokens));
        } catch (error) {
          request.log.error(error);
          if (error instanceof Error && error.message.startsWith("license:")) {
            reply
              .code(400)
              .send(
                errorResponse(
                  "invalid_license",
                  error.message.replace("license:", ""),
                ),
              );
            return;
          }
          reply
            .code(409)
            .send(
              errorResponse(
                "conflict",
                "Username or email already registered.",
              ),
            );
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

        const { username, email, password } = parsed.data;
        const normalizedUsername = username ? username.trim().toLowerCase() : null;
        const endUser = await prisma.endUser.findFirst({
          where: {
            applicationId: appTenant.id,
            ...(email ? { email } : {}),
            ...(normalizedUsername ? { usernameNormalized: normalizedUsername } : {}),
          },
        });

        if (!endUser || endUser.passwordHash !== hashPassword(password)) {
          reply
            .code(401)
            .send(errorResponse("unauthorized", "Invalid credentials."));
          return;
        }

        const expiryResult = await applyRankExpiry({
          endUserId: endUser.id,
          rankId: endUser.rankId ?? null,
          rankExpiresAt: endUser.rankExpiresAt ?? null,
          appDefaultRankId: appTenant.defaultRankId ?? null,
        });

        const updatedEndUser = await prisma.endUser.update({
          where: {
            id: endUser.id,
          },
          data: {
            lastLoginAt: new Date(),
            rankId: expiryResult.rankId,
            rankExpiresAt: expiryResult.rankExpiresAt,
          },
        });

        const tokens = await issueTokens({
          endUserId: updatedEndUser.id,
          appId: appTenant.id,
          rankId: updatedEndUser.rankId,
          accessTokenTtlSeconds: appTenant.accessTokenTtlSeconds,
          refreshTokenTtlSeconds: appTenant.refreshTokenTtlSeconds,
        });

        await writeAuditLog({
          actorType: "end_user",
          actorId: endUser.id,
          action: "auth.login",
          appId: appTenant.id,
        });

        await writeEventLog({
          appId: appTenant.id,
          eventType: "end_user.logged_in",
          request,
          statusCode: reply.statusCode,
          apiKeyId: request.tenantApiKeyId,
          metadata: { endUserId: endUser.id },
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

        const expiryResult = await applyRankExpiry({
          endUserId: endUser.id,
          rankId: endUser.rankId ?? null,
          rankExpiresAt: endUser.rankExpiresAt ?? null,
          appDefaultRankId: appTenant.defaultRankId ?? null,
        });

        const currentRankId = expiryResult.rankId ?? null;
        const permissions = await loadPermissions(currentRankId);

        reply.send(
          successResponse({
            id: endUser.id,
            username: endUser.username,
            email: endUser.email,
            rank_id: currentRankId,
            permissions,
          }),
        );
      } catch (error) {
        request.log.error(error);
        reply.code(401).send(errorResponse("unauthorized", "Invalid token."));
      }
    });
  }, { prefix: "/v1" });
};
