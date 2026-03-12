import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
      // Allow tunnel origins (e.g. instatunnel) for local dev - remove in production
      allowedOrigins: ["localhost:3000", "*.instatunnel.my"],
    },
  },
};

export default nextConfig;
