import { resolve } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker image uchun mustaqil build (monorepo ildizidan kuzatiladi)
  output: "standalone",
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
};

export default nextConfig;
