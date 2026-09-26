// Eksport tugmasi (CORE-11): Excel yoki CSV fayl yuklab olinadi.
import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export async function ExportMenu({ kind }: { kind: "counterparties" | "sales" | "purchases" | "transactions" | "debts" }) {
  const t = await getTranslations("common");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" className="h-10"><Download />{t("export")}</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><a href={`/eksport/${kind}?format=xlsx`} download>{t("exportExcel")}</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={`/eksport/${kind}?format=csv`} download>{t("exportCsv")}</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
