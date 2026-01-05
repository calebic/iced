import { randomBytes } from "node:crypto";
import type { License, LicenseStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { hashToken } from "../utils/crypto";
import { writeAuditLog } from "../audit";

const MAX_LICENSE_PAGE_SIZE = 200;
const DEFAULT_LICENSE_PAGE_SIZE = 50;

export type LicenseListFilters = {
  status?: LicenseStatus;
  redeemedById?: string;
  expiresBefore?: Date;
  expiresAfter?: Date;
  page?: number;
  pageSize?: number;
};

export type LicenseListResult = {
  items: License[];
  page: number;
  pageSize: number;
  total: number;
};

const generateLicenseKey = (): string => randomBytes(32).toString("hex");

const ensureApplication = async (appId: string) => {
  const application = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true, developerUserId: true },
  });

  if (!application) {
    throw new Error("Application not found.");
  }

  return application;
};

const ensureRank = async (appId: string, rankId: string) => {
  const rank = await prisma.rank.findFirst({
    where: { id: rankId, applicationId: appId },
    select: { id: true },
  });

  if (!rank) {
    throw new Error("Rank not found for application.");
  }
};

const createLicenseRecord = async (data: {
  applicationId: string;
  rankId: string;
  expiresAt?: Date | null;
}): Promise<{ license: License; plaintextKey: string }> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const plaintextKey = generateLicenseKey();
    const codeHash = hashToken(plaintextKey);
    try {
      const license = await prisma.license.create({
        data: {
          applicationId: data.applicationId,
          rankId: data.rankId,
          codeHash,
          expiresAt: data.expiresAt ?? null,
        },
      });
      return { license, plaintextKey };
    } catch (error) {
      if (attempt >= 4) {
        throw error;
      }
    }
  }

  throw new Error("Unable to generate license key.");
};

const buildExpiresAtFilter = (
  filters: LicenseListFilters,
): Prisma.DateTimeNullableFilter | undefined => {
  if (!filters.expiresAfter && !filters.expiresBefore) {
    return undefined;
  }

  const filter: Prisma.DateTimeNullableFilter = {};
  if (filters.expiresAfter) {
    filter.gt = filters.expiresAfter;
  }
  if (filters.expiresBefore) {
    filter.lt = filters.expiresBefore;
  }
  return filter;
};

export const LicenseService = {
  async createLicense(
    appId: string,
    rankId: string,
    expiresAt?: Date,
  ): Promise<{ license: License; plaintextKey: string }> {
    const application = await ensureApplication(appId);
    await ensureRank(appId, rankId);

    const { license, plaintextKey } = await createLicenseRecord({
      applicationId: appId,
      rankId,
      expiresAt,
    });

    await writeAuditLog({
      actorType: "developer",
      actorId: application.developerUserId,
      action: "license.create",
      appId,
      metadata: { licenseId: license.id },
    });

    return { license, plaintextKey };
  },

  async createLicensesBulk(
    appId: string,
    rankId: string,
    count: number,
    expiresAt?: Date,
  ): Promise<{ licenses: License[]; plaintextKeys: string[] }> {
    if (count <= 0) {
      throw new Error("Count must be greater than zero.");
    }

    const application = await ensureApplication(appId);
    await ensureRank(appId, rankId);

    const licenses: License[] = [];
    const plaintextKeys: string[] = [];

    for (let i = 0; i < count; i += 1) {
      const { license, plaintextKey } = await createLicenseRecord({
        applicationId: appId,
        rankId,
        expiresAt,
      });
      licenses.push(license);
      plaintextKeys.push(plaintextKey);
    }

    await writeAuditLog({
      actorType: "developer",
      actorId: application.developerUserId,
      action: "license.bulk_create",
      appId,
      metadata: { count, licenseIds: licenses.map((item) => item.id) },
    });

    return { licenses, plaintextKeys };
  },

  async listLicenses(
    appId: string,
    filters: LicenseListFilters = {},
  ): Promise<LicenseListResult> {
    const application = await ensureApplication(appId);

    const pageSize = Math.min(
      filters.pageSize ?? DEFAULT_LICENSE_PAGE_SIZE,
      MAX_LICENSE_PAGE_SIZE,
    );
    const page = Math.max(filters.page ?? 1, 1);
    const expiresAtFilter = buildExpiresAtFilter(filters);

    const where: Prisma.LicenseWhereInput = {
      applicationId: appId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.redeemedById ? { redeemedById: filters.redeemedById } : {}),
      ...(expiresAtFilter ? { expiresAt: expiresAtFilter } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.license.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.license.count({ where }),
    ]);

    await writeAuditLog({
      actorType: "developer",
      actorId: application.developerUserId,
      action: "license.list",
      appId,
      metadata: { page, pageSize, total },
    });

    return { items, page, pageSize, total };
  },

  async revokeLicense(appId: string, licenseId: string): Promise<License> {
    const application = await ensureApplication(appId);

    const result = await prisma.license.updateMany({
      where: {
        id: licenseId,
        applicationId: appId,
        status: { in: ["active", "redeemed"] },
      },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new Error("License not found or already revoked.");
    }

    const license = await prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new Error("License not found after revocation.");
    }

    await writeAuditLog({
      actorType: "developer",
      actorId: application.developerUserId,
      action: "license.revoke",
      appId,
      metadata: { licenseId },
    });

    return license;
  },

  async validateAndRedeemLicense(
    appId: string,
    plaintextLicenseKey: string,
    endUserId: string,
  ): Promise<License> {
    const application = await ensureApplication(appId);
    const codeHash = hashToken(plaintextLicenseKey);
    const now = new Date();

    const license = await prisma.$transaction(async (tx) => {
      const redeemResult = await tx.license.updateMany({
        where: {
          applicationId: appId,
          codeHash,
          status: "active",
          redeemedById: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: {
          status: "redeemed",
          redeemedAt: now,
          redeemedById: endUserId,
        },
      });

      if (redeemResult.count === 1) {
        const redeemed = await tx.license.findFirst({
          where: { applicationId: appId, codeHash },
        });

        if (!redeemed) {
          throw new Error("Redeemed license not found.");
        }

        return redeemed;
      }

      const existing = await tx.license.findFirst({
        where: { applicationId: appId, codeHash },
      });

      if (!existing) {
        throw new Error("License not found.");
      }

      if (existing.expiresAt && existing.expiresAt <= now) {
        if (existing.status === "active") {
          await tx.license.update({
            where: { id: existing.id },
            data: { status: "expired" },
          });
        }
        throw new Error("License expired.");
      }

      if (existing.status === "revoked") {
        throw new Error("License revoked.");
      }

      if (existing.status === "redeemed") {
        throw new Error("License already redeemed.");
      }

      if (existing.status === "expired") {
        throw new Error("License expired.");
      }

      throw new Error("License is not active.");
    });

    await writeAuditLog({
      actorType: "developer",
      actorId: application.developerUserId,
      action: "license.redeem",
      appId,
      metadata: { licenseId: license.id, endUserId },
    });

    return license;
  },
};
