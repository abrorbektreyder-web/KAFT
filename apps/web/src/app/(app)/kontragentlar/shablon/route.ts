// Kontragentlar uchun Excel shablon (CP-10, INT-01).
import { buildCounterpartyTemplate } from "@kaft/core";
import { requireCtx } from "@/lib/server";

export async function GET() {
  await requireCtx();
  const file = await buildCounterpartyTemplate();
  return new Response(new Uint8Array(file as ArrayBuffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=\"kontragentlar-shablon.xlsx\"",
    },
  });
}
