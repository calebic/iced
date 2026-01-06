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
        emailPolicy: "required" | "optional" | "disabled";
        licensePolicy: "required" | "optional" | "disabled";
      };
    }>,
    endUsers: [] as Array<{
      id: string;
      applicationId: string;
      username: string;
      usernameNormalized: string;
      email: string | null;
      passwordHash?: string;
      rankId: string | null;
      rankExpiresAt?: Date | null;
      rankSourceLicenseId?: string | null;
      lastLoginAt?: Date | null;
    }>,
    licenses: [] as Array<{
      id: string;
      applicationId: string;
      rankId: string;
      codeHash: string;
      status: "active" | "redeemed" | "revoked" | "expired";
      maxUses: number | null;
      useCount: number;
      durationSeconds: number | null;
      expiresAt: Date | null;
      redeemedAt: Date | null;
      redeemedById: string | null;
      revokedAt: Date | null;
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
      username: string;
      usernameNormalized: string;
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
      data.licenses = [];
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
        where: {
          applicationId: string;
          email?: string;
          usernameNormalized?: string;
        };
      }) =>
        data.endUsers.find(
          (user) =>
            user.applicationId === where.applicationId &&
            (where.email ? user.email === where.email : true) &&
            (where.usernameNormalized
              ? user.usernameNormalized === where.usernameNormalized
              : true),
        ) ?? null,
      create: async ({
        data: newUser,
      }: {
        data: {
          applicationId: string;
          username: string;
          usernameNormalized: string;
          email: string | null;
          passwordHash: string;
          rankId: string | null;
        };
      }) => {
        const created = {
          id: `user-${data.endUsers.length + 1}`,
          applicationId: newUser.applicationId,
          username: newUser.username,
          usernameNormalized: newUser.usernameNormalized,
          email: newUser.email,
          passwordHash: newUser.passwordHash,
          rankId: newUser.rankId,
          rankExpiresAt: null,
          rankSourceLicenseId: null,
        };
        data.endUsers.push(created);
        return created;
      },
      update: async ({
        where,
        data: update,
      }: {
        where: { id: string };
        data: {
          rankId?: string | null;
          rankExpiresAt?: Date | null;
          rankSourceLicenseId?: string | null;
          lastLoginAt?: Date | null;
        };
      }) => {
        const user = data.endUsers.find((item) => item.id === where.id);
        if (!user) return null;
        if (update.rankId !== undefined) user.rankId = update.rankId;
        if (update.rankExpiresAt !== undefined) {
          user.rankExpiresAt = update.rankExpiresAt;
        }
        if (update.rankSourceLicenseId !== undefined) {
          user.rankSourceLicenseId = update.rankSourceLicenseId;
        }
        if (update.lastLoginAt !== undefined) {
          user.lastLoginAt = update.lastLoginAt ?? null;
        }
        return user;
      },
    },
    license: {
      findUnique: async ({ where }: { where: { codeHash: string } }) =>
        data.licenses.find((item) => item.codeHash === where.codeHash) ?? null,
      update: async ({
        where,
        data: update,
      }: {
        where: { id: string };
        data: Partial<{
          status: "active" | "redeemed" | "revoked" | "expired";
          useCount: number;
          redeemedAt: Date | null;
          redeemedById: string | null;
        }>;
      }) => {
        const license = data.licenses.find((item) => item.id === where.id);
        if (!license) return null;
        Object.assign(license, update);
        return license;
      },
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
      findFirst: async ({
        where,
      }: {
        where: {
          OR: Array<{ email?: string; usernameNormalized?: string }>;
        };
      }) =>
        data.developerUsers.find((user) =>
          where.OR.some(
            (condition) =>
              (condition.email && user.email === condition.email) ||
              (condition.usernameNormalized &&
                user.usernameNormalized === condition.usernameNormalized),
          ),
        ) ?? null,
      create: async ({
        data: newUser,
      }: {
        data: {
          email: string;
          username: string;
          usernameNormalized: string;
          passwordHash: string;
          status: "active" | "disabled";
        };
      }) => {
        const created = {
          id: `dev-${data.developerUsers.length + 1}`,
          email: newUser.email,
          username: newUser.username,
          usernameNormalized: newUser.usernameNormalized,
          passwordHash: newUser.passwordHash,
          status: newUser.status,
          createdAt: new Date(),
          disabledAt: null,
        };
        data.developerUsers.push(created);
        return created;
      },
    },
    developerSession: {
      create: async () => ({ id: "session-1" }),
      findFirst: async () => null,
    },
    rankPermission: {
      findMany: async () => [],
    },
    ownerSession: {
      findFirst: async () => null,
    },
    $transaction: async (
      ops: Array<Promise<unknown>> | ((tx: PrismaMock) => Promise<unknown>),
    ) => {
      if (typeof ops === "function") {
        return ops(prismaMock);
      }
      return Promise.all(ops);
    },
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
      emailPolicy: "required",
      licensePolicy: "optional",
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
      emailPolicy: "required",
      licensePolicy: "optional",
    },
  });
  prismaMock.data.endUsers.push({
    id: "user-refresh",
    applicationId: "app-refresh",
    username: "user-refresh",
    usernameNormalized: "user-refresh",
    email: "user-refresh@example.com",
    passwordHash: hashPassword("password123"),
    rankId: null,
    rankExpiresAt: null,
    rankSourceLicenseId: null,
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
      emailPolicy: "required",
      licensePolicy: "optional",
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
    username: "dev",
    usernameNormalized: "dev",
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

test("dashboard register returns success with valid input", async () => {
  prismaMock.reset();

  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/dashboard/auth/register",
    payload: {
      username: "NewUser",
      email: "newuser@example.com",
      password: "password123",
    },
  });

  assert.equal(response.statusCode, 201);
  const payload = response.json();
  assert.equal(payload.success, true);
  assert.equal(prismaMock.data.developerUsers.length, 1);
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

test("register succeeds with username/password when policies are optional", async () => {
  prismaMock.reset();
  const apiKey = "register-optional-key";
  prismaMock.data.apiKeys.push({
    id: "key-optional",
    keyHash: hashToken(apiKey),
    revokedAt: null,
    application: {
      id: "app-optional",
      status: "active",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 1200,
      defaultRankId: null,
      emailPolicy: "optional",
      licensePolicy: "optional",
    },
  });

  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: {
      "x-api-key": apiKey,
    },
    payload: {
      username: "NewUser",
      password: "password123",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(prismaMock.data.endUsers.length, 1);
  assert.equal(prismaMock.data.endUsers[0].email, null);
  await app.close();
});

test("register fails when email is required and missing", async () => {
  prismaMock.reset();
  const apiKey = "register-email-required";
  prismaMock.data.apiKeys.push({
    id: "key-email-required",
    keyHash: hashToken(apiKey),
    revokedAt: null,
    application: {
      id: "app-email-required",
      status: "active",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 1200,
      defaultRankId: null,
      emailPolicy: "required",
      licensePolicy: "optional",
    },
  });

  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: {
      "x-api-key": apiKey,
    },
    payload: {
      username: "NoEmailUser",
      password: "password123",
    },
  });

  assert.equal(response.statusCode, 400);
  const payload = response.json();
  assert.equal(payload.error?.code, "email_required");
  await app.close();
});

test("license redemption sets rank expiry", async () => {
  prismaMock.reset();
  const apiKey = "register-license-key";
  const licenseCode = "license-code-123";
  prismaMock.data.apiKeys.push({
    id: "key-license",
    keyHash: hashToken(apiKey),
    revokedAt: null,
    application: {
      id: "app-license",
      status: "active",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 1200,
      defaultRankId: null,
      emailPolicy: "optional",
      licensePolicy: "optional",
    },
  });
  prismaMock.data.licenses.push({
    id: "license-1",
    applicationId: "app-license",
    rankId: "rank-premium",
    codeHash: hashToken(licenseCode),
    status: "active",
    maxUses: null,
    useCount: 0,
    durationSeconds: 3600,
    expiresAt: null,
    redeemedAt: null,
    redeemedById: null,
    revokedAt: null,
  });

  const app = await buildApp();
  const before = Date.now();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: {
      "x-api-key": apiKey,
    },
    payload: {
      username: "LicensedUser",
      password: "password123",
      licenseCode,
    },
  });

  assert.equal(response.statusCode, 200);
  const endUser = prismaMock.data.endUsers[0];
  assert.equal(endUser.rankId, "rank-premium");
  assert.ok(endUser.rankExpiresAt instanceof Date);
  if (endUser.rankExpiresAt) {
    assert.ok(endUser.rankExpiresAt.getTime() >= before + 3500 * 1000);
  }
  await app.close();
});

test("expired rank is reverted on /v1/me", async () => {
  prismaMock.reset();
  const apiKey = "rank-expired-key";
  prismaMock.data.apiKeys.push({
    id: "key-expired",
    keyHash: hashToken(apiKey),
    revokedAt: null,
    application: {
      id: "app-expired",
      status: "active",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 1200,
      defaultRankId: "rank-default",
      emailPolicy: "required",
      licensePolicy: "optional",
    },
  });
  prismaMock.data.endUsers.push({
    id: "user-expired",
    applicationId: "app-expired",
    username: "expired-user",
    usernameNormalized: "expired-user",
    email: "expired@example.com",
    passwordHash: hashPassword("password123"),
    rankId: "rank-premium",
    rankExpiresAt: new Date(Date.now() - 60_000),
    rankSourceLicenseId: "license-expired",
  });

  const token = signAccessToken(
    {
      sub: "user-expired",
      appId: "app-expired",
      rankId: "rank-premium",
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
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.data.rank_id, "rank-default");
  const updatedUser = prismaMock.data.endUsers.find(
    (user) => user.id === "user-expired",
  );
  assert.equal(updatedUser?.rankId, "rank-default");
  assert.equal(updatedUser?.rankExpiresAt ?? null, null);
  assert.equal(updatedUser?.rankSourceLicenseId ?? null, null);
  await app.close();
});
