import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@ledgerroot/contracts", "@ledgerroot/domain"],
  poweredByHeader: false,
  async rewrites() {
    return process.env.NEXT_PUBLIC_MODE === "live"
      ? [{ source: "/api/:path*", destination: "http://127.0.0.1:4100/api/:path*" }]
      : [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
