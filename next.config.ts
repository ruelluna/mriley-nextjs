import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // data/catalog.db is read at runtime by the catalog routes; without this it is not
  // traced into the serverless function bundle and every catalog page 500s on Vercel.
  outputFileTracingIncludes: {
    "/*": ["./data/catalog.db"],
  },
};

export default nextConfig;
