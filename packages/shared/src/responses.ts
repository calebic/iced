import { z } from "zod";

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});

export const ApiSuccessSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  meta: z.record(z.unknown()).optional(),
});

export const ApiFailureSchema = z.object({
  success: z.literal(false),
  error: ApiErrorSchema,
});

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = z.infer<typeof ApiFailureSchema>;

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const successResponse = <T>(
  data: T,
  meta?: Record<string, unknown>,
): ApiSuccess<T> => ({
  success: true,
  data,
  meta,
});

export const errorResponse = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiFailure => ({
  success: false,
  error: {
    code,
    message,
    details,
  },
});
