const dashboardApiBaseUrl =
  process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? "http://localhost:3000";

export const getDashboardApiUrl = (path: string): string => {
  return new URL(path, dashboardApiBaseUrl).toString();
};
