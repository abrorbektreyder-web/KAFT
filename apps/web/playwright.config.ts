import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Bitta umumiy dev bazasi — ketma-ket
  workers: 1,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  // Lokalda dev baza xorijda (Supabase) — sahifa 10–20 s; CI'da baza yonida, standart qiymatlar yetadi
  timeout: CI ? 90_000 : 180_000,
  expect: { timeout: CI ? 20_000 : 45_000 },
  reporter: CI ? "list" : [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // PRD 7.1: «telefon birinchi» — ega bosh sahifani telefonda ko'radi
    { name: "telefon", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://localhost:3000/kirish",
    reuseExistingServer: !CI,
    timeout: 240_000,
  },
});
