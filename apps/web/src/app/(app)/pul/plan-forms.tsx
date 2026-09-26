"use client";
// Rejali to'lov qo'shish/to'xtatish va kunlik kassa yopish formalari.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, Lock, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormSheet, Picker, useSheetForm } from "@/components/sheet-form";
import { addSchedule, closeDay, stopSchedule } from "./plan-actions";

const CURRENCIES = ["UZS", "USD", "EUR", "RUB"] as const;

export function ScheduleSheet({ categories, today }: { categories: { id: string; name: string; direction: "in" | "out" }[]; today: string }) {
  const t = useTranslations("plan");
  const form = useSheetForm(addSchedule);
  const [direction, setDirection] = useState<"in" | "out">("out");
  return (
    <FormSheet form={form} title={t("addSchedule")} trigger={<Button className="h-10"><CalendarPlus />{t("addSchedule")}</Button>}>
      <Field id="sch-name" label={t("fName")}><Input id="sch-name" name="name" required className="h-11" placeholder="Do‘kon ijarasi" /></Field>
      <Field id="sch-dir" label={t("fDirection")}>
        <Picker id="sch-dir" name="direction" value={direction} onChange={(v) => setDirection(v as "in" | "out")}
          items={(["out", "in"] as const).map((d) => ({ value: d, label: t(`dir_${d}`) }))} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field id="sch-amount" label={t("fAmount")}><Input id="sch-amount" name="amount" inputMode="decimal" required className="h-11" /></Field>
        <Field id="sch-cur" label={t("fCurrency")}><Picker id="sch-cur" name="currency" defaultValue="UZS" items={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
      </div>
      <Field id="sch-cat" label={t("fCategory")}>
        <Picker id="sch-cat" name="categoryId" required={false}
          items={[{ value: "none", label: t("fNoCategory") }, ...categories.filter((c) => c.direction === direction).map((c) => ({ value: c.id, label: c.name }))]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="sch-start" label={t("fStarts")}><Input id="sch-start" name="startsOn" type="date" defaultValue={today} required className="h-11" /></Field>
        <Field id="sch-rep" label={t("fRepeat")}>
          <Picker id="sch-rep" name="repeat" defaultValue="monthly" items={(["monthly", "weekly", "once"] as const).map((r) => ({ value: r, label: t(`rep_${r}`) }))} />
        </Field>
      </div>
      <Field id="sch-end" label={t("fEnds")}><Input id="sch-end" name="endsOn" type="date" className="h-11" /></Field>
    </FormSheet>
  );
}

export function StopScheduleButton({ id }: { id: string }) {
  const t = useTranslations("plan");
  const form = useSheetForm(stopSchedule);
  return (
    <form action={form.formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={form.pending}><Square />{t("stop")}</Button>
    </form>
  );
}

export function CloseDayForm({ accounts, today }: { accounts: { id: string; name: string; currency: string }[]; today: string }) {
  const t = useTranslations("plan");
  const form = useSheetForm(closeDay);
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0]!.id : "");
  const currency = accounts.find((a) => a.id === accountId)?.currency ?? "UZS";
  return (
    <form action={form.formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.4fr_2fr_auto] lg:items-end">
      <input type="hidden" name="currency" value={currency} />
      <Field id="cl-acc" label={t("fAccount")}>
        <Picker id="cl-acc" name="accountId" value={accountId} onChange={setAccountId} items={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))} />
      </Field>
      <Field id="cl-date" label={t("fDate")}><Input id="cl-date" name="date" type="date" defaultValue={today} max={today} required className="h-11" /></Field>
      <Field id="cl-counted" label={`${t("fCounted")} (${currency})`}><Input id="cl-counted" name="counted" inputMode="decimal" required className="h-11" /></Field>
      <Field id="cl-note" label={t("fNote")}><Input id="cl-note" name="note" className="h-11" /></Field>
      <Button type="submit" disabled={form.pending} className="h-11"><Lock />{t("closeDay")}</Button>
    </form>
  );
}
