import { env } from "../env";
import { prisma } from "../prisma";

export const seedOwner = async (): Promise<void> => {
  await prisma.ownerUser.upsert({
    where: {
      email: env.OWNER_EMAIL,
    },
    update: {
      passwordHash: env.OWNER_PASSWORD_HASH,
    },
    create: {
      email: env.OWNER_EMAIL,
      passwordHash: env.OWNER_PASSWORD_HASH,
    },
  });
};
