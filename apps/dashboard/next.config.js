/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiBaseUrl = process.env.DASHBOARD_API_URL ?? "http://localhost:3000";

    return [
      {
        source: "/dashboard/:path*",
        destination: `${apiBaseUrl}/dashboard/:path*`,
      },
    ];
  },
};

export default nextConfig;
