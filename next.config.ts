import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tutorial videos, their previews and brand images change rarely: browsers keep them for a week instead of
  // downloading them again on every open (a new version gets a new deploy, and the week is short enough).
  async headers() {
    return [
      { source: "/tutorials/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
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
