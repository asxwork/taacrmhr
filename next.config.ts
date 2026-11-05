import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photo uploads and CSV imports go through server actions (default limit is 1 MB).
    serverActions: { bodySizeLimit: "30mb" },
    // Shared hosting (Hostinger) caps threads per account; parallel build workers exhaust it.
    cpus: 1,
    // "Create" buttons prefetch their screen in the background; keep that copy at most a minute.
    // Recently visited pages are reused too, so Cancel and Back are instant; any save clears this.
    staleTimes: { static: 60, dynamic: 30 },
  },
};

export default nextConfig;
