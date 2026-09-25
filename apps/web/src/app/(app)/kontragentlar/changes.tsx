// Tasdiq so'rovidagi o'zgarishlar: «maydon: eski → yangi» (server komponenti).
import { getLocale, getTranslations } from "next-intl/server";
import { dmy, money } from "@/lib/format";

type Changes = Record<string, { from: unknown; to: unknown }>;

export async function ChangeList({ changes, users, currency = "UZS" }: { changes: unknown; users: { id: string; name: string }[]; currency?: string }) {
  const [t, locale] = await Promise.all([getTranslations("cp"), getLocale()]);
  const show = (field: string, v: unknown): string => {
    if (v == null || v === "") return t("empty_value");
    if (field === "roles" && Array.isArray(v)) return v.map((r) => t(`role_${r}` as "role_customer")).join(", ");
    if ((field === "creditLimit" || field === "amount") && typeof v === "number") return money(v, currency, locale);
    if (field === "managerUserId") return users.find((u) => u.id === v)?.name ?? t("empty_value");
    if ((field === "signedOn" || field === "endsOn") && typeof v === "string") return dmy(v);
    return String(v);
  };
  return (
    <ul className="grid gap-1 text-sm">
      {Object.entries(changes as Changes).map(([field, { from, to }]) => (
        <li key={field}>
          <span className="text-muted-foreground">{t(`f_${field}` as "f_name")}:</span>{" "}
          <span className="line-through opacity-70">{show(field, from)}</span> → <span className="font-semibold">{show(field, to)}</span>
        </li>
      ))}
    </ul>
  );
}
