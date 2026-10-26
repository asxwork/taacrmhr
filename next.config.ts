import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photo uploads and CSV imports go through server actions (default limit is 1 MB).
    serverActions: { bodySizeLimit: "30mb" },
    // Shared hosting (Hostinger) caps threads per account; parallel build workers exhaust it.
    cpus: 1,
    // "Create" buttons prefetch their screen in the background; keep that copy at most a minute.
    staleTimes: { static: 60 },
  },
};

export default nextConfig;
