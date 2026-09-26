"use client";
// Sotuv/xarid hujjati formasi: sarlavha maydonlari va tovar qatorlari (qo'shish/o'chirish), jami — ko'rsatish uchun.
// Aniq summa serverda hisoblanadi (tiyin, BigInt); bu yerda — taxminiy ko'rinish.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Picker, type ActionResult } from "@/components/sheet-form";
import { money, parseMoney } from "@/lib/format";
import { savePurchase, saveSale } from "./actions";

type Product = { id: string; name: string; unit: string; currency: string; prices: { retail: number | null; wholesale: number | null; special: number | null } };
type Cp = { id: string; name: string; termDays: number | null; wholesale: boolean };
type Line = { key: number; productId: string; qty: string; price: string; discount: string };

const CURRENCIES = ["UZS", "USD", "EUR", "RUB"] as const;
const PRICE_TYPES = ["retail", "wholesale", "special"] as const;

export function DocForm({ mode, companies, counterparties, products, today }: {
  mode: "sale" | "purchase"; companies: { id: string; name: string }[]; counterparties: Cp[]; products: Product[]; today: string;
}) {
  const t = useTranslations("trade");
  const locale = useLocale();
  const router = useRouter();
  const [cpId, setCpId] = useState("");
  const [currency, setCurrency] = useState("UZS");
  const [priceType, setPriceType] = useState<(typeof PRICE_TYPES)[number]>("retail");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qty: "1", price: "", discount: "" }]);
  const [, action, pending] = useActionState(async (prev: ActionResult, f: FormData) => {
    const res = await (mode === "sale" ? saveSale : savePurchase)(prev, f);
    if (res?.ok) {
      toast.success(res.message ?? "");
      router.push(`/${mode === "sale" ? "savdo" : "xarid"}/${res.id}`);
    } else if (res) {
      toast.error(res.error);
    }
    return res;
  }, null);

  const autoPrice = (p?: Product) => (mode === "sale" && p && p.currency === currency ? p.prices[priceType] : null);
  const lineAmount = (l: Line) => {
    const p = products.find((x) => x.id === l.productId);
    const price = l.price.trim() ? parseMoney(l.price) : autoPrice(p);
    const qty = Number(l.qty.replace(",", "."));
    const disc = Number(l.discount.replace(",", ".")) || 0;
    return price != null && qty > 0 ? Math.round(price * qty * (1 - disc / 100)) : null;
  };
  const total = lines.reduce((s, l) => s + (lineAmount(l) ?? 0), 0);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const onCounterparty = (id: string) => {
    setCpId(id);
    if (mode === "sale") setPriceType(counterparties.find((c) => c.id === id)?.wholesale ? "wholesale" : "retail");
  };

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="doc-cp" label={t("fCounterparty")}>
            <Picker id="doc-cp" name="counterpartyId" value={cpId} onChange={onCounterparty} items={counterparties.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field id="doc-company" label={t("fCompany")}>
            <Picker id="doc-company" name="companyId" defaultValue={companies.length === 1 ? companies[0]!.id : undefined} items={companies.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field id="doc-date" label={t("fDate")}><Input id="doc-date" name="date" type="date" defaultValue={today} required className="h-11" /></Field>
          <Field id="doc-currency" label={t("fCurrency")}>
            <Picker id="doc-currency" name="currency" value={currency} onChange={setCurrency} items={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          {mode === "sale" && (
            <Field id="doc-pt" label={t("priceType")}>
              <Picker id="doc-pt" name="priceType" value={priceType} onChange={(v) => setPriceType(v as typeof priceType)}
                items={PRICE_TYPES.map((p) => ({ value: p, label: t(`price_${p}`) }))} />
            </Field>
          )}
          <Field id="doc-due" label={t("fDue")} hint={t("fDueHint")}><Input id="doc-due" name="dueDate" type="date" className="h-11" /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 pt-5">
          <p className="text-sm font-semibold">{t("lines")}</p>
          {lines.map((l, i) => {
            const p = products.find((x) => x.id === l.productId);
            const auto = autoPrice(p);
            const amount = lineAmount(l);
            return (
              <div key={l.key} className="grid grid-cols-2 items-end gap-2 border-t pt-3 first:border-t-0 first:pt-0 md:grid-cols-[3fr_1fr_1.4fr_1fr_1.4fr_auto]">
                <div className="col-span-2 md:col-span-1">
                  <Field id={`l${l.key}-p`} label={t("fProduct")}>
                    <Picker id={`l${l.key}-p`} name={`product-${i}`} value={l.productId} onChange={(v) => update(l.key, { productId: v })}
                      items={products.map((x) => ({ value: x.id, label: `${x.name} (${x.unit})` }))} />
                  </Field>
                </div>
                <Field id={`l${l.key}-q`} label={p ? `${t("fQty")}, ${p.unit}` : t("fQty")}>
                  <Input id={`l${l.key}-q`} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} inputMode="decimal" required className="h-11" />
                </Field>
                <Field id={`l${l.key}-pr`} label={`${t("fPrice")}, ${currency}`}>
                  <Input id={`l${l.key}-pr`} value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} inputMode="decimal" className="h-11"
                    required={mode === "purchase"} placeholder={auto != null ? `${money(auto, currency, locale)} · ${t("fPriceAuto")}` : ""} />
                </Field>
                {mode === "sale" ? (
                  <Field id={`l${l.key}-d`} label={t("fDiscount")}>
                    <Input id={`l${l.key}-d`} value={l.discount} onChange={(e) => update(l.key, { discount: e.target.value })} inputMode="decimal" className="h-11" />
                  </Field>
                ) : <span className="hidden md:block" />}
                <div className="flex h-11 items-center justify-end text-sm font-semibold tabular-nums">{amount != null ? money(amount, currency, locale) : "—"}</div>
                <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t("removeLine")} disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></Button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, productId: "", qty: "1", price: "", discount: "" }])}>
              <Plus />{t("addLine")}
            </Button>
            <p className="text-lg font-bold tabular-nums">{t("total")}: {money(total, currency, locale)}</p>
          </div>
        </CardContent>
      </Card>

      <Field id="doc-note" label={t("fNote")}><Input id="doc-note" name="note" className="h-11" /></Field>
      <Button type="submit" disabled={pending} className="h-11 w-full sm:w-fit sm:px-10">{t("save")}</Button>
    </form>
  );
}
