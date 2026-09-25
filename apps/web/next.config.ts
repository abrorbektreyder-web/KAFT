import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

// CORE-08: uz/ru — til cookie bo'yicha (src/i18n/request.ts)
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
