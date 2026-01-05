import jwt from "jsonwebtoken";
import { env } from "../env";

export type AccessTokenPayload = {
  sub: string;
  appId: string;
  rankId?: string | null;
  permissions: string[];
};

export const signAccessToken = (
  payload: AccessTokenPayload,
  expiresInSeconds: number,
): string =>
  jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: expiresInSeconds,
  });

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload.");
  }
  return decoded as AccessTokenPayload;
};
