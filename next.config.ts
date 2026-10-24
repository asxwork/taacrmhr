import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photo uploads and CSV imports go through server actions (default limit is 1 MB).
    serverActions: { bodySizeLimit: "30mb" },
  },
};

export default nextConfig;
