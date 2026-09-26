// Boshlang'ich qarzlar uchun Excel shablon (CP-10, INT-01).
import { buildOpeningDebtTemplate } from "@kaft/core";
import { requireCtx } from "@/lib/server";

export async function GET() {
  await requireCtx();
  const file = await buildOpeningDebtTemplate();
  return new Response(new Uint8Array(file as ArrayBuffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=\"boshlangich-qarzlar-shablon.xlsx\"",
    },
  });
}
