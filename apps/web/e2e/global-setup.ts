import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// e2e tenantini (xodimlar, ta'til, HR login) qaytadan yaratadi
export default function globalSetup() {
  execFileSync(process.execPath, [resolve(__dirname, "../../../packages/auth/src/seed-e2e.ts")], { stdio: "inherit" });
}
