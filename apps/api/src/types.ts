import type { Application, DeveloperUser, OwnerUser } from "@prisma/client";

export type AuthenticatedOwner = OwnerUser;
export type AuthenticatedDeveloper = DeveloperUser;
export type TenantApplication = Application;
