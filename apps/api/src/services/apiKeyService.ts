import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../prisma";
import { hashToken } from "../utils/crypto";

const KEY_PREFIX = "iced_";
const KEY_BYTES = 32;

const toUrlSafe = (value: Buffer): string => value.toString("base64url");

export const generateApiKey = (): string =>
  `${KEY_PREFIX}${toUrlSafe(randomBytes(KEY_BYTES))}`;

export const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

export const ApiKeyService = {
  async createApiKey(applicationId: string) {
    const rawKey = generateApiKey();
    const keyHash = hashToken(rawKey);
    const last4 = rawKey.slice(-4);
    const now = new Date();
    const apiKey = await prisma.apiKey.create({
      data: {
        applicationId,
        keyHash,
        apiKeyLast4: last4,
        apiKeyCreatedAt: now,
      },
    });

    return {
      apiKey,
      plaintext: rawKey,
      last4,
    };
  },

  async getActiveKey(applicationId: string) {
    return prisma.apiKey.findFirst({
      where: {
        applicationId,
        revokedAt: null,
      },
    });
  },

  async ensureActiveKey(applicationId: string) {
    const existing = await this.getActiveKey(applicationId);
    if (existing) {
      if (!existing.apiKeyCreatedAt) {
        await prisma.apiKey.update({
          where: { id: existing.id },
          data: { apiKeyCreatedAt: existing.createdAt },
        });
      }
      if (!existing.apiKeyLast4) {
        const fallbackLast4 = existing.keyHash.slice(-4);
        const updated = await prisma.apiKey.update({
          where: { id: existing.id },
          data: { apiKeyLast4: fallbackLast4 },
        });
        return {
          apiKey: updated,
          last4: fallbackLast4,
        };
      }
      return {
        apiKey: existing,
        last4: existing.apiKeyLast4,
      };
    }

    const created = await this.createApiKey(applicationId);
    return { apiKey: created.apiKey, last4: created.last4 };
  },

  async rotateKey(applicationId: string) {
    await prisma.apiKey.updateMany({
      where: {
        applicationId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return this.createApiKey(applicationId);
  },
};
