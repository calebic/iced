import { buildServer } from "./server";
import { env } from "./env";
import { seedOwner } from "./owner/seedOwner";
import { prisma } from "./prisma";

const connectWithRetry = async (
  attempts = 5,
  delayMs = 1000,
): Promise<void> => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await prisma.$connect();
      return;
    } catch (error) {
      if (attempt === attempts) {
        const databaseHost = new URL(env.DATABASE_URL).host;
        throw new Error(
          `Unable to connect to the database at ${databaseHost}. ` +
            "Ensure Postgres is running and DATABASE_URL is correct.",
          { cause: error },
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

const start = async () => {
  const app = buildServer();
  await connectWithRetry();
  await seedOwner();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
