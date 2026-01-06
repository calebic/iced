import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// ESM-safe __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env in a few common locations (first match wins for missing vars)
dotenv.config({ path: path.resolve(__dirname, "../.env") });        // apps/api/.env
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });  // repo root .env
dotenv.config();                                                   // fallback: process.cwd()

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3002),
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

const forbiddenPlaceholders = ["__REQUIRED__", "CHANGE_ME"];

for (const [key, value] of Object.entries(env)) {
  if (typeof value === "string" && forbiddenPlaceholders.includes(value)) {
    throw new Error(`Environment variable ${key} is not set (placeholder value detected)`);
  }
}
