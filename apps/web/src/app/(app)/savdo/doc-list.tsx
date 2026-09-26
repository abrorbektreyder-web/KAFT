// Sotuv/xarid hujjatlari jadvali va holat belgisi (server komponenti).
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { dmy, money } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type DocRow = {
  id: string; number: string; kind: string; docDate: string; dueDate: string; currency: string; total: number; status: string;
  counterpartyName: string; cancelledAt: Date | null;
};

export async function DocStatus({ status, cancelled }: { status: string; cancelled: boolean }) {
  const t = await getTranslations("trade");
  if (cancelled) return <Badge variant="outline" className="text-muted-foreground">{t("status_cancelled")}</Badge>;
  if (status === "pending") return <Badge className="bg-warn-soft text-warn">{t("status_pending")}</Badge>;
  return <Badge variant="outline">{t("status_posted")}</Badge>;
}

export async function DocTable({ rows, base }: { rows: DocRow[]; base: "savdo" | "xarid" }) {
  const [t, locale] = await Promise.all([getTranslations("trade"), getLocale()]);
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("colNumber")}</TableHead>
          <TableHead className="hidden sm:table-cell">{t("colDate")}</TableHead>
          <TableHead>{t("colCounterparty")}</TableHead>
          <TableHead className="text-right">{t("colTotal")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("colStatus")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => (
          <TableRow key={d.id} className={d.cancelledAt ? "opacity-60" : undefined}>
            <TableCell>
              <Link href={`/${base}/${d.id}`} className="font-medium tabular-nums hover:underline">{d.number}</Link>
              {d.kind !== "sale" && d.kind !== "purchase" && <span className="ml-2 text-xs text-muted-foreground">{t(`kind_${d.kind}` as "kind_sale")}</span>}
            </TableCell>
            <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">{dmy(d.docDate)}</TableCell>
            <TableCell className="max-w-48 truncate">{d.counterpartyName}</TableCell>
            <TableCell className={`text-right font-semibold tabular-nums ${d.cancelledAt ? "line-through" : ""}`}>
              {d.kind === "return" ? "−" : ""}{money(d.total, d.currency, locale)}
            </TableCell>
            <TableCell className="hidden md:table-cell"><DocStatus status={d.status} cancelled={!!d.cancelledAt} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
