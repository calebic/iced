const resolveFallbackBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return window.location.origin;
};

const dashboardApiBaseUrl =
  process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? resolveFallbackBaseUrl();

export const getDashboardApiUrl = (path: string): string =>
  new URL(path, dashboardApiBaseUrl).toString();
