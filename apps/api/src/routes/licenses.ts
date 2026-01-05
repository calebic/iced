import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse, successResponse } from "@iced/shared";
import { requireDeveloperSession } from "../middleware/developerAuth";
import { prisma } from "../prisma";
import { LicenseService } from "../services/licenseService";

const CreateLicenseSchema = z.object({
  rank_id: z.string().uuid(),
  pool_id: z.string().uuid().optional(),
  max_uses: z.number().int().positive().optional(),
  expires_at: z.string().datetime().optional(),
});

const BulkCreateSchema = z.object({
  rank_id: z.string().uuid(),
  pool_id: z.string().uuid().optional(),
  max_uses: z.number().int().positive().optional(),
  count: z.number().int().positive().max(1000),
  expires_at: z.string().datetime().optional(),
});

const ListLicensesSchema = z.object({
  status: z.enum(["active", "redeemed", "revoked", "expired"]).optional(),
  redeemed_by_id: z.string().uuid().optional(),
  expires_before: z.string().datetime().optional(),
  expires_after: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const ensureDeveloperApp = async (appId: string, developerId: string) => {
  const application = await prisma.application.findFirst({
    where: { id: appId, developerUserId: developerId },
    select: { id: true },
  });

  if (!application) {
    throw new Error("Application not found.");
  }
};

const toDate = (value?: string) => (value ? new Date(value) : undefined);

const formatLicense = (license: {
  id: string;
  rankId: string;
  poolId: string | null;
  status: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  redeemedAt: Date | null;
  redeemedById: string | null;
  revokedAt: Date | null;
  createdAt: Date;
}) => ({
  id: license.id,
  rank_id: license.rankId,
  pool_id: license.poolId,
  status: license.status,
  max_uses: license.maxUses,
  use_count: license.useCount,
  expires_at: license.expiresAt,
  redeemed_at: license.redeemedAt,
  redeemed_by_id: license.redeemedById,
  revoked_at: license.revokedAt,
  created_at: license.createdAt,
});

export const registerLicenseRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  app.register(async (router) => {
    router.addHook("preHandler", requireDeveloperSession);

    router.post("/apps/:appId/licenses", async (request, reply) => {
      const parsed = CreateLicenseSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid license payload."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      await ensureDeveloperApp(appId, request.developerUser.id);

      const {
        rank_id: rankId,
        pool_id: poolId,
        max_uses: maxUses,
        expires_at: expiresAt,
      } = parsed.data;
      const { license, plaintextKey } = await LicenseService.createLicense(
        appId,
        rankId,
        poolId,
        maxUses,
        toDate(expiresAt),
      );

      reply.send(
        successResponse({
          license: formatLicense(license),
          keys: [plaintextKey],
        }),
      );
    });

    router.post("/apps/:appId/licenses/bulk", async (request, reply) => {
      const parsed = BulkCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid bulk payload."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      await ensureDeveloperApp(appId, request.developerUser.id);

      const {
        rank_id: rankId,
        pool_id: poolId,
        max_uses: maxUses,
        count,
        expires_at: expiresAt,
      } = parsed.data;
      const { licenses, plaintextKeys } =
        await LicenseService.createLicensesBulk(
          appId,
          rankId,
          count,
          poolId,
          maxUses,
          toDate(expiresAt),
        );

      reply.send(
        successResponse({
          licenses: licenses.map(formatLicense),
          keys: plaintextKeys,
        }),
      );
    });

    router.get("/apps/:appId/licenses", async (request, reply) => {
      const parsed = ListLicensesSchema.safeParse(request.query);
      if (!parsed.success) {
        reply
          .code(400)
          .send(errorResponse("invalid_request", "Invalid query filters."));
        return;
      }

      if (!request.developerUser) {
        reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
        return;
      }

      const { appId } = request.params as { appId: string };
      await ensureDeveloperApp(appId, request.developerUser.id);

      const filters = parsed.data;
      const result = await LicenseService.listLicenses(appId, {
        status: filters.status,
        redeemedById: filters.redeemed_by_id,
        expiresBefore: toDate(filters.expires_before),
        expiresAfter: toDate(filters.expires_after),
        page: filters.page,
        pageSize: filters.page_size,
      });

      reply.send(
        successResponse({
          items: result.items.map(formatLicense),
          page: result.page,
          page_size: result.pageSize,
          total: result.total,
        }),
      );
    });

    router.post(
      "/apps/:appId/licenses/:licenseId/revoke",
      async (request, reply) => {
        if (!request.developerUser) {
          reply.code(401).send(errorResponse("unauthorized", "Unauthorized."));
          return;
        }

        const { appId, licenseId } = request.params as {
          appId: string;
          licenseId: string;
        };

        await ensureDeveloperApp(appId, request.developerUser.id);
        const license = await LicenseService.revokeLicense(appId, licenseId);

        reply.send(
          successResponse({
            license: formatLicense(license),
          }),
        );
      },
    );
  });
};
