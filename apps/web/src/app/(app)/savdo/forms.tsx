"use client";
// Savdo/xarid kichik formalari: tovar qo'shish, tasdiqlash, bekor qilish, qaytarish, boshlang'ich qarz va uning importi.
import { useTranslations } from "next-intl";
import { Ban, Check, FileSpreadsheet, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormSheet, Picker, useSheetForm } from "@/components/sheet-form";
import { approveSaleAction, cancelDocAction, importDebtsAction, saveOpeningDebt, saveProduct, saveReturn } from "./actions";

const CURRENCIES = ["UZS", "USD", "EUR", "RUB"] as const;

export function ProductSheet() {
  const t = useTranslations("trade");
  const form = useSheetForm(saveProduct);
  return (
    <FormSheet form={form} title={t("newProduct")} trigger={<Button className="h-10"><Plus />{t("newProduct")}</Button>}>
      <Field id="pr-name" label={t("fName")}><Input id="pr-name" name="name" required className="h-11" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="pr-unit" label={t("fUnit")}><Input id="pr-unit" name="unit" defaultValue="dona" required className="h-11" /></Field>
        <Field id="pr-sku" label={t("fSku")}><Input id="pr-sku" name="sku" className="h-11" /></Field>
      </div>
      <Field id="pr-cur" label={t("fCurrency")}><Picker id="pr-cur" name="currency" defaultValue="UZS" items={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
      <Field id="pr-retail" label={t("fRetail")}><Input id="pr-retail" name="retail" inputMode="decimal" className="h-11" /></Field>
      <Field id="pr-wholesale" label={t("fWholesale")}><Input id="pr-wholesale" name="wholesale" inputMode="decimal" className="h-11" /></Field>
      <Field id="pr-special" label={t("fSpecial")}><Input id="pr-special" name="special" inputMode="decimal" className="h-11" /></Field>
    </FormSheet>
  );
}

export function ApproveSaleButton({ id }: { id: string }) {
  const t = useTranslations("trade");
  const form = useSheetForm(approveSaleAction);
  return (
    <form action={form.formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" disabled={form.pending}><Check />{t("approve")}</Button>
    </form>
  );
}

export function CancelDocSheet({ id, kind }: { id: string; kind: "sale" | "purchase" }) {
  const t = useTranslations("trade");
  const form = useSheetForm(cancelDocAction);
  return (
    <FormSheet form={form} title={t("cancelTitle")} description={t("cancelHint")} submit={t("cancel")}
      trigger={<Button variant="outline" size="sm"><Ban />{t("cancel")}</Button>}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <Field id={`reason-${id}`} label={t("reason")}><Input id={`reason-${id}`} name="reason" required className="h-11" /></Field>
    </FormSheet>
  );
}

export function ReturnSheet({ saleId, lines, today }: { saleId: string; lines: { productId: string; productName: string; unit: string; qty: string }[]; today: string }) {
  const t = useTranslations("trade");
  const form = useSheetForm(saveReturn);
  const unique = lines.filter((l, i) => lines.findIndex((x) => x.productId === l.productId) === i);
  return (
    <FormSheet form={form} title={t("returnTitle")} description={t("returnHint")} trigger={<Button variant="outline" size="sm"><Undo2 />{t("return")}</Button>}>
      <input type="hidden" name="saleId" value={saleId} />
      <Field id="ret-date" label={t("fDate")}><Input id="ret-date" name="date" type="date" defaultValue={today} required className="h-11" /></Field>
      {unique.map((l) => (
        <Field key={l.productId} id={`ret-${l.productId}`} label={`${l.productName} (${l.qty} ${l.unit})`}>
          <input type="hidden" name="productId" value={l.productId} />
          <Input id={`ret-${l.productId}`} name="qty" inputMode="decimal" className="h-11" placeholder="0" />
        </Field>
      ))}
    </FormSheet>
  );
}

export function OpeningDebtSheet({ counterpartyId, today }: { counterpartyId: string; today: string }) {
  const t = useTranslations("trade");
  const form = useSheetForm(saveOpeningDebt);
  return (
    <FormSheet form={form} title={t("openingTitle")} trigger={<Button variant="outline" size="sm"><Plus />{t("openingDebt")}</Button>}>
      <input type="hidden" name="counterpartyId" value={counterpartyId} />
      <Field id="od-side" label={t("fSide")}>
        <Picker id="od-side" name="side" items={(["receivable", "payable"] as const).map((s) => ({ value: s, label: t(`side_${s}`) }))} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field id="od-amount" label={t("fAmountMoney")}><Input id="od-amount" name="amount" inputMode="decimal" required className="h-11" /></Field>
        <Field id="od-cur" label={t("fCurrency")}><Picker id="od-cur" name="currency" defaultValue="UZS" items={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="od-date" label={t("fDate")}><Input id="od-date" name="date" type="date" defaultValue={today} required className="h-11" /></Field>
        <Field id="od-due" label={t("fDue")}><Input id="od-due" name="dueDate" type="date" className="h-11" /></Field>
      </div>
    </FormSheet>
  );
}

export function ImportDebtsSheet() {
  const t = useTranslations("trade");
  const form = useSheetForm(importDebtsAction);
  const details = form.state && !form.state.ok ? form.state.details : undefined;
  return (
    <FormSheet form={form} title={t("importDebts")} description={t("importDebtsHint")} trigger={<Button variant="outline" className="h-10"><FileSpreadsheet />{t("importDebts")}</Button>}>
      <a href="/kontragentlar/qarz-shablon" download className="text-sm font-medium text-primary underline">{t("template")}</a>
      <Field id="debt-file" label={t("file")}>
        <Input id="debt-file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="h-11" />
      </Field>
      {details && (
        <ul role="alert" className="grid max-h-60 gap-1 overflow-y-auto rounded-md border border-bad/40 bg-bad/5 p-3 text-xs text-bad">
          {details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </FormSheet>
  );
}
