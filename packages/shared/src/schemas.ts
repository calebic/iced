import { z } from "zod";

export const EmailSchema = z.string().email();
export const PasswordSchema = z.string().min(8);

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  license_key: z.string().min(1).optional(),
});

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export const RefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
});

export const LogoutRequestSchema = z.object({
  refresh_token: z.string().min(1),
});

export const AuthTokensResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

export const EndUserSchema = z.object({
  id: z.string().uuid(),
  email: EmailSchema,
  rank_id: z.string().uuid().optional(),
  permissions: z.array(z.string()).default([]),
});

export const MeResponseSchema = z.object({
  user: EndUserSchema,
});
