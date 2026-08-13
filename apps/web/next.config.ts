import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@delivery/shared", "@delivery/database"],
  reactStrictMode: true,
};

export default nextConfig;
