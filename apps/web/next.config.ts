import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Monorepo ildizidagi .env.local (DATABASE_URL, BETTER_AUTH_SECRET)
const rootEnv = resolve(import.meta.dirname, "../../.env.local");
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Docker image uchun mustaqil build (monorepo ildizidan kuzatiladi)
  output: "standalone",
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  // Ichki paketlar TypeScript manbasida
  transpilePackages: ["@kaft/db", "@kaft/core", "@kaft/auth"],
};

export default nextConfig;
