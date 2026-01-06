/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiBaseUrl =
      process.env.DASHBOARD_API_URL ?? "http://127.0.0.1:3001";

    return [
      {
        source: "/dashboard/:path*",
        destination: `${apiBaseUrl}/dashboard/:path*`,
      },
    ];
  },
};

export default nextConfig;
