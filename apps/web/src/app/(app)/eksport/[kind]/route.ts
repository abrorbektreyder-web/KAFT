// CORE-11: ma'lumot eksporti — Excel yoki CSV fayl (ruxsat doirasida, har eksport audit jurnaliga yoziladi).
import { getLocale } from "next-intl/server";
import { buildExportFile, EXPORT_KINDS, exportData, ForbiddenError, type ExportKind } from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import { todayIso } from "@/lib/format";

export async function GET(req: Request, { params }: RouteContext<"/eksport/[kind]">) {
  const ctx = await requireCtx();
  const { kind } = await params;
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return new Response("Not found", { status: 404 });
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  try {
    const data = await exportData(db, ctx, kind as ExportKind, { locale: await getLocale() });
    const file = await buildExportFile(data, format);
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="kaft-${kind}-${todayIso()}.${format}"`,
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
}
