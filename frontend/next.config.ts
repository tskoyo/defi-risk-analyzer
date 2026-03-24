import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/defi-risk-analyzer",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
