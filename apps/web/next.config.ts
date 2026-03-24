import type { NextConfig } from "next";

const apiBaseUrl = process.env.PTA_API_BASE_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`,
      },
      {
        source: "/api-health",
        destination: `${apiBaseUrl}/health`,
      },
    ];
  },
};

export default nextConfig;
