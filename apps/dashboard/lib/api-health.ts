import { getValidatedApiBaseUrl } from "./api-config";

let hasCheckedHealth = false;

export const checkApiHealth = async () => {
  if (hasCheckedHealth) {
    return;
  }

  hasCheckedHealth = true;
  const apiBaseUrl = getValidatedApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/health`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`API health check failed (${response.status}).`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `Dashboard could not reach the API at ${apiBaseUrl}. ` +
        "Ensure the API is running and NEXT_PUBLIC_API_URL is set correctly.",
      error,
    );
  }
};
