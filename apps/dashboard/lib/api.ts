const resolveFallbackBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  const { hostname, protocol, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const fallbackPort = port === "3000" ? "3001" : "3000";
    return `${protocol}//${hostname}:${fallbackPort}`;
  }

  return window.location.origin;
};

const dashboardApiBaseUrl =
  process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? resolveFallbackBaseUrl();

export const getDashboardApiUrl = (path: string): string =>
  new URL(path, dashboardApiBaseUrl).toString();
