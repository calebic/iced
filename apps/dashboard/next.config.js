import { getValidatedApiBaseUrl } from "./lib/api-config.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiBaseUrl = getValidatedApiBaseUrl();

    return [
      {
        source: "/dashboard/:path*",
        destination: `${apiBaseUrl}/dashboard/:path*`,
      },
    ];
  },
};

export default nextConfig;
