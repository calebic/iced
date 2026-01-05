import { createHash, randomBytes } from "node:crypto";

export const hashToken = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const hashPassword = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const generateSessionToken = (): string =>
  randomBytes(32).toString("hex");
