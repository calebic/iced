import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../prisma";
import { hashToken } from "../utils/crypto";

const KEY_PREFIX = "iced_";
const KEY_BYTES = 32;

const toUrlSafe = (value: Buffer): string => value.toString("base64url");

export const generateApiKey = (): string =>
  `${KEY_PREFIX}${toUrlSafe(randomBytes(KEY_BYTES))}`;

export const maskApiKey = (keyHash: string): string => {
  const last4 = keyHash.slice(-4);
  return `••••••${last4}`;
};

export const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

export const ApiKeyService = {
  async createApiKey(applicationId: string) {
    const rawKey = generateApiKey();
    const keyHash = hashToken(rawKey);
    const apiKey = await prisma.apiKey.create({
      data: {
        applicationId,
        keyHash,
      },
    });

    return {
      apiKey,
      plaintext: rawKey,
      masked: maskApiKey(keyHash),
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
      return {
        apiKey: existing,
        masked: maskApiKey(existing.keyHash),
      };
    }

    const created = await this.createApiKey(applicationId);
    return { apiKey: created.apiKey, masked: created.masked };
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
