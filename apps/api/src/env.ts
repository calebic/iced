import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  OWNER_EMAIL: z.string().email(),
  OWNER_PASSWORD_HASH: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  OWNER_SESSION_COOKIE: z.string().min(1).default("owner_session"),
  DEVELOPER_SESSION_COOKIE: z.string().min(1).default("developer_session"),
  API_KEY_HEADER: z.string().min(1).default("x-api-key"),
  WEBHOOK_SECRET_KEY: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

export const env = EnvSchema.parse(process.env);
