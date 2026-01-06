type ApiErrorPayload = {
  success?: boolean;
  error?: {
    message?: string;
  };
};

export const getApiErrorMessage = async (
  response: Response,
  fallbackMessage: string,
) => {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload?.error?.message) {
      return payload.error.message;
    }
  } catch {
    // Ignore parse errors and fall back to the provided message.
  }

  return fallbackMessage;
};
