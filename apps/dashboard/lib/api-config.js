const DEFAULT_API_BASE_URL = "http://127.0.0.1:3002";
const DEFAULT_DASHBOARD_PORT = 3001;

const normalizeUrl = (value) => value.replace(/\/+$/, "");

const getDashboardPort = () =>
  Number(process.env.PORT ?? DEFAULT_DASHBOARD_PORT);

const getApiBaseUrl = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;
  return normalizeUrl(apiUrl);
};

const validateApiBaseUrl = (apiUrl) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_URL must include a protocol (for example ${DEFAULT_API_BASE_URL}).`,
    );
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(
      `NEXT_PUBLIC_API_URL must start with http:// or https:// (got ${parsedUrl.protocol}).`,
    );
  }

  const dashboardPort = getDashboardPort();
  const apiPort = parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80");
  const isLocalHost = ["127.0.0.1", "localhost"].includes(parsedUrl.hostname);

  if (isLocalHost && Number(apiPort) === dashboardPort) {
    throw new Error(
      `NEXT_PUBLIC_API_URL cannot point to the dashboard port (${dashboardPort}). ` +
        `Use ${DEFAULT_API_BASE_URL} for local development.`,
    );
  }

  const normalizedApi = normalizeUrl(parsedUrl.toString());
  const normalizedDashboard = normalizeUrl(`http://127.0.0.1:${dashboardPort}`);
  const normalizedDashboardLocalhost = normalizeUrl(
    `http://localhost:${dashboardPort}`,
  );

  if (
    normalizedApi === normalizedDashboard ||
    normalizedApi === normalizedDashboardLocalhost
  ) {
    throw new Error(
      `NEXT_PUBLIC_API_URL cannot match the dashboard origin (${normalizedDashboard}).`,
    );
  }

  return normalizedApi;
};

export const getValidatedApiBaseUrl = () => validateApiBaseUrl(getApiBaseUrl());
