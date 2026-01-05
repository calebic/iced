import { buildServer } from "./server";
import { env } from "./env";
import { seedOwner } from "./owner/seedOwner";

const start = async () => {
  const app = buildServer();
  await seedOwner();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
