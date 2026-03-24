import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const apiBaseUrl = process.env.PTA_API_BASE_URL ?? "http://localhost:8081";
const repoRoot = path.join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
);

const nextConfig: NextConfig = {
  transpilePackages: ["@pta-pilot/shared"],
  turbopack: {
    root: repoRoot,
  },
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
