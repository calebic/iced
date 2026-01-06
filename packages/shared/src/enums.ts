import { z } from "zod";

export const ActorTypeEnum = z.enum(["owner", "developer", "end_user"]);
export type ActorType = z.infer<typeof ActorTypeEnum>;

export const DeveloperStatusEnum = z.enum(["active", "disabled"]);
export type DeveloperStatus = z.infer<typeof DeveloperStatusEnum>;

export const ApplicationStatusEnum = z.enum(["active", "disabled"]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusEnum>;

export const LicenseStatusEnum = z.enum([
  "active",
  "redeemed",
  "revoked",
  "expired",
]);
export type LicenseStatus = z.infer<typeof LicenseStatusEnum>;
