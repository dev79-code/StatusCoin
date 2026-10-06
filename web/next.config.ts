import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // @status/core is shipped as TypeScript source inside the monorepo
  transpilePackages: ["@status/core"],
  turbopack: { root: path.join(__dirname, "..") },
};

export default nextConfig;
