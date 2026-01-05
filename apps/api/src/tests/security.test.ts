import assert from "node:assert/strict";
import { test } from "node:test";
import { mock } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";

process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.DATABASE_URL = "postgres://localhost:5432/iced_test";
process.env.OWNER_EMAIL = "owner@example.com";
process.env.OWNER_PASSWORD_HASH = "owner-hash";
process.env.JWT_SECRET = "test-secret";
process.env.WEBHOOK_SECRET_KEY = "webhook-secret";
process.env.OWNER_SESSION_COOKIE = "owner_session";
process.env.DEVELOPER_SESSION_COOKIE = "developer_session";
process.env.API_KEY_HEADER = "x-api-key";

type PrismaMock = ReturnType<typeof createPrismaMock>;

const createPrismaMock = () => {
  const data = {
    apiKeys: [] as Array<{
      id: string;
      keyHash: string;
      revokedAt: Date | null;
      application: {
        id: string;
        status: "active" | "disabled";
        accessTokenTtlSeconds: number;
        refreshTokenTtlSeconds: number;
        defaultRankId: string | null;
        licenseRequiredOnRegister: boolean;
      };
    }>,
    endUsers: [] as Array<{
      id: string;
      applicationId: string;
      email: string;
      rankId: string | null;
    }>,
    refreshTokens: [] as Array<{
      id: string;
      endUserId: string;
      tokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
      replacedById?: string | null;
    }>,
    developerUsers: [] as Array<{
      id: string;
      email: string;
      passwordHash: string;
      status: "active" | "disabled";
      createdAt: Date;
      disabledAt: Date | null;
    }>,
  };

  return {
    data,
    reset() {
      data.apiKeys = [];
      data.endUsers = [];
      data.refreshTokens = [];
      data.developerUsers = [];
    },
    apiKey: {
      findFirst: async ({ where }: { where: { keyHash: string; revokedAt: null } }) =>
        data.apiKeys.find(
          (key) => key.keyHash === where.keyHash && key.revokedAt === null,
        ) ?? null,
    },
    endUser: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        data.endUsers.find((user) => user.id === where.id) ?? null,
      findFirst: async ({
        where,
      }: {
        where: { applicationId: string; email: string };
      }) =>
        data.endUsers.find(
          (user) =>
            user.applicationId === where.applicationId &&
            user.email === where.email,
        ) ?? null,
      update: async ({ where }: { where: { id: string } }) =>
        data.endUsers.find((user) => user.id === where.id) ?? null,
    },
    endUserRefreshToken: {
      findFirst: async ({ where }: { where: { tokenHash: string } }) =>
        data.refreshTokens.find((token) => token.tokenHash === where.tokenHash) ??
        null,
      updateMany: async ({
        where,
        data: update,
      }: {
        where: { endUserId?: string; tokenHash?: string; revokedAt?: null };
        data: { revokedAt: Date };
      }) => {
        const tokens = data.refreshTokens.filter((token) => {
          if (where.endUserId && token.endUserId !== where.endUserId) return false;
          if (where.tokenHash && token.tokenHash !== where.tokenHash) return false;
          if (where.revokedAt === null && token.revokedAt !== null) return false;
          return true;
        });
        tokens.forEach((token) => {
          token.revokedAt = update.revokedAt;
        });
        return { count: tokens.length };
      },
      update: async ({
        where,
        data: update,
      }: {
        where: { id: string };
        data: { revokedAt?: Date; replacedById?: string | undefined };
      }) => {
        const token = data.refreshTokens.find((item) => item.id === where.id);
        if (!token) return null;
        if (update.revokedAt) token.revokedAt = update.revokedAt;
        if (update.replacedById !== undefined) token.replacedById = update.replacedById;
        return token;
      },
      create: async ({
        data: newToken,
      }: {
        data: {
          endUserId: string;
          tokenHash: string;
          expiresAt: Date;
        };
      }) => {
        const created = {
          id: `token-${data.refreshTokens.length + 1}`,
          endUserId: newToken.endUserId,
          tokenHash: newToken.tokenHash,
          expiresAt: newToken.expiresAt,
          revokedAt: null,
          replacedById: null,
        };
        data.refreshTokens.push(created);
        return created;
      },
    },
    developerUser: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        data.developerUsers.find((user) => user.email === where.email) ?? null,
    },
    developerSession: {
      create: async () => ({ id: "session-1" }),
      findFirst: async () => null,
    },
    ownerSession: {
      findFirst: async () => null,
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  };
};

const prismaMock = createPrismaMock();

mock.module("../prisma", () => ({ prisma: prismaMock }));
mock.module("../audit", () => ({ writeAuditLog: async () => {} }));
mock.module("../eventLog", () => ({ writeEventLog: async () => {} }));

const { hashToken, hashPassword } = await import("../utils/crypto");
const { signAccessToken } = await import("../utils/jwt");
const { registerV1Routes } = await import("../routes/v1");
const { registerDashboardRoutes } = await import("../routes/dashboard");
const { registerApplicationRoutes } = await import("../routes/applications");
const { registerOwnerRoutes } = await import("../routes/owner");

const buildApp = async () => {
  const app = Fastify();
  await app.register(cookie);
  await app.register(registerV1Routes);
  await app.register(registerDashboardRoutes, { prefix: "/dashboard" });
  await app.register(registerApplicationRoutes, { prefix: "/dashboard" });
  await app.register(registerOwnerRoutes, { prefix: "/owner" });
  return app;
};

test("tenant isolation blocks cross-app access tokens", async () => {
  prismaMock.reset();
  const appId = "app-a";
  const tokenAppId = "app-b";
  const apiKey = "api-key-a";
  prismaMock.data.apiKeys.push({
    id: "key-1",
    keyHash: hashToken(apiKey),
    revokedAt: null,
    application: {
      id: appId,
      status: "active",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 1200,
      defaultRankId: null,
      licenseRequiredOnRegister: false,
    },
  });

  const accessToken = signAccessToken(
    {
      sub: "user-1",
      appId: tokenAppId,
      rankId: null,
      permissions: [],
    },
    900,
  );

  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: {
      "x-api-key": apiKey,
      authorization: `Bearer ${accessToken}`,
    },
  });

  assert.equal(response.statusCode, 403);
  await app.close();
});

test("refresh token replay is rejected", async () => {
  prismaMock.reset();
  const apiKey = "api-key-refresh";
  prismaMock.data.apiKeys.push({
    id: "key-2",
    keyHash: hashToken(apiKey),
    revokedAt: null,
    application: {
      id: "app-refresh",
      status: "active",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 1200,
      defaultRankId: null,
      licenseRequiredOnRegister: false,
    },
  });
  prismaMock.data.endUsers.push({
    id: "user-refresh",
    applicationId: "app-refresh",
    email: "user-refresh@example.com",
    rankId: null,
  });
  const refreshToken = "refresh-token";
  prismaMock.data.refreshTokens.push({
    id: "token-1",
    endUserId: "user-refresh",
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
  });

  const app = await buildApp();
  const first = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    headers: {
      "x-api-key": apiKey,
    },
    payload: {
      refresh_token: refreshToken,
    },
  });

  assert.equal(first.statusCode, 200);

  const second = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    headers: {
      "x-api-key": apiKey,
    },
    payload: {
      refresh_token: refreshToken,
    },
  });

  assert.equal(second.statusCode, 401);
  await app.close();
});

test("disabled application blocks /v1 access", async () => {
  prismaMock.reset();
  const apiKey = "disabled-app-key";
  prismaMock.data.apiKeys.push({
    id: "key-3",
    keyHash: hashToken(apiKey),
    revokedAt: null,
    application: {
      id: "app-disabled",
      status: "disabled",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 1200,
      defaultRankId: null,
      licenseRequiredOnRegister: false,
    },
  });

  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: {
      "x-api-key": apiKey,
    },
    payload: {
      email: "user@example.com",
      password: "password123",
    },
  });

  assert.equal(response.statusCode, 403);
  await app.close();
});

test("disabled developer cannot login", async () => {
  prismaMock.reset();
  const password = "password123";
  prismaMock.data.developerUsers.push({
    id: "dev-1",
    email: "dev@example.com",
    passwordHash: hashPassword(password),
    status: "disabled",
    createdAt: new Date(),
    disabledAt: new Date(),
  });

  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/dashboard/login",
    payload: {
      email: "dev@example.com",
      password,
    },
  });

  assert.equal(response.statusCode, 403);
  await app.close();
});

test("owner routes require an owner session", async () => {
  prismaMock.reset();
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/owner/developers",
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("end-user tokens cannot access dashboard routes", async () => {
  prismaMock.reset();
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/dashboard/apps",
    headers: {
      authorization: "Bearer end-user-token",
    },
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});
