"use client";
// Kontragent formalari: qo'shish/tahrirlash, shartnoma, Excel import, so'rovni tasdiqlash/rad etish — yon panelda.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, FileSpreadsheet, FilePlus2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormSheet, Picker, useSheetForm } from "@/components/sheet-form";
import { approveRequest, importFile, rejectRequest, saveContract, saveCounterparty } from "./actions";

const ROLES = ["customer", "wholesale", "supplier"] as const;
const CURRENCIES = ["UZS", "USD", "EUR", "RUB"] as const;

/** Tiyin → forma uchun «1250000» yoki «99,50» */
const major = (minor: number | null | undefined) => (minor == null ? "" : `${Math.floor(minor / 100)}${minor % 100 ? `,${String(minor % 100).padStart(2, "0")}` : ""}`);

export type CounterpartyForm = {
  id: string; name: string; roles: string[]; stir: string | null; address: string | null; contactPerson: string | null; phone: string | null;
  bankName: string | null; bankMfo: string | null; bankAccount: string | null; managerUserId: string | null;
  creditLimit: number | null; creditCurrency: string; paymentTermDays: number | null; note: string | null;
};

export function CounterpartySheet({ initial, users, canAssign }: { initial?: CounterpartyForm; users: { id: string; name: string }[]; canAssign: boolean }) {
  const t = useTranslations("cp");
  const router = useRouter();
  const form = useSheetForm(saveCounterparty, (res) => {
    if (!initial && res.id) router.push(`/kontragentlar/${res.id}`);
  });
  const v = initial;
  const p = v?.id ?? "new";
  return (
    <FormSheet form={form} title={v ? t("edit") : t("add")} trigger={
      v ? <Button variant="outline" className="h-10"><Pencil />{t("edit")}</Button> : <Button className="h-10"><Plus />{t("add")}</Button>
    }>
      {v && <input type="hidden" name="id" value={v.id} />}
      <Field id={`${p}-name`} label={t("f_name")}><Input id={`${p}-name`} name="name" defaultValue={v?.name} required className="h-11" /></Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t("f_roles")}</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <label key={r} className="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-checked:border-primary has-checked:bg-primary/10">
              <input type="checkbox" name="roles" value={r} defaultChecked={v ? v.roles.includes(r) : r === "customer"} className="accent-primary" />
              {t(`role_${r}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${p}-stir`} label={t("f_stir")}><Input id={`${p}-stir`} name="stir" inputMode="numeric" maxLength={9} defaultValue={v?.stir ?? ""} className="h-11" /></Field>
        <Field id={`${p}-phone`} label={t("f_phone")}><Input id={`${p}-phone`} name="phone" type="tel" defaultValue={v?.phone ?? ""} className="h-11" placeholder="901234567" /></Field>
      </div>
      <Field id={`${p}-address`} label={t("f_address")}><Input id={`${p}-address`} name="address" defaultValue={v?.address ?? ""} className="h-11" /></Field>
      <Field id={`${p}-contact`} label={t("f_contactPerson")}><Input id={`${p}-contact`} name="contactPerson" defaultValue={v?.contactPerson ?? ""} className="h-11" /></Field>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field id={`${p}-bank`} label={t("f_bankName")}><Input id={`${p}-bank`} name="bankName" defaultValue={v?.bankName ?? ""} className="h-11" /></Field>
        <Field id={`${p}-mfo`} label={t("f_bankMfo")}><Input id={`${p}-mfo`} name="bankMfo" inputMode="numeric" maxLength={5} defaultValue={v?.bankMfo ?? ""} className="h-11" /></Field>
      </div>
      <Field id={`${p}-account`} label={t("f_bankAccount")}><Input id={`${p}-account`} name="bankAccount" inputMode="numeric" maxLength={20} defaultValue={v?.bankAccount ?? ""} className="h-11" /></Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field id={`${p}-limit`} label={t("f_creditLimit")}><Input id={`${p}-limit`} name="creditLimit" inputMode="decimal" defaultValue={major(v?.creditLimit)} className="h-11" /></Field>
        <Field id={`${p}-lcur`} label={t("f_creditCurrency")}>
          <Picker id={`${p}-lcur`} name="creditCurrency" defaultValue={v?.creditCurrency ?? "UZS"} items={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
      </div>
      <Field id={`${p}-term`} label={t("f_paymentTermDays")}><Input id={`${p}-term`} name="paymentTermDays" inputMode="numeric" defaultValue={v?.paymentTermDays ?? ""} className="h-11" /></Field>
      {canAssign && (
        <Field id={`${p}-manager`} label={t("f_managerUserId")}>
          <Picker id={`${p}-manager`} name="managerUserId" required={false} defaultValue={v?.managerUserId ?? "none"}
            items={[{ value: "none", label: t("nobody") }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
        </Field>
      )}
      <Field id={`${p}-note`} label={t("f_note")}><Input id={`${p}-note`} name="note" defaultValue={v?.note ?? ""} className="h-11" /></Field>
    </FormSheet>
  );
}

export function ContractSheet({ counterpartyId, initial }: {
  counterpartyId: string;
  initial?: { id: string; number: string; signedOn: string; endsOn: string | null; amount: number | null; currency: string };
}) {
  const t = useTranslations("cp");
  const form = useSheetForm(saveContract);
  const v = initial;
  const p = v?.id ?? "new-contract";
  return (
    <FormSheet form={form} title={v ? t("edit") : t("addContract")} trigger={
      v ? <Button variant="ghost" size="icon" className="size-8" aria-label={t("edit")}><Pencil /></Button>
        : <Button variant="outline" size="sm"><FilePlus2 />{t("addContract")}</Button>
    }>
      <input type="hidden" name="counterpartyId" value={counterpartyId} />
      {v && <input type="hidden" name="id" value={v.id} />}
      <Field id={`${p}-number`} label={t("f_number")}><Input id={`${p}-number`} name="number" defaultValue={v?.number} required className="h-11" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${p}-signed`} label={t("f_signedOn")}><Input id={`${p}-signed`} name="signedOn" type="date" defaultValue={v?.signedOn} required className="h-11" /></Field>
        <Field id={`${p}-ends`} label={t("f_endsOn")}><Input id={`${p}-ends`} name="endsOn" type="date" defaultValue={v?.endsOn ?? ""} className="h-11" /></Field>
      </div>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field id={`${p}-amount`} label={t("f_amount")}><Input id={`${p}-amount`} name="amount" inputMode="decimal" defaultValue={major(v?.amount)} className="h-11" /></Field>
        <Field id={`${p}-cur`} label={t("f_currency")}>
          <Picker id={`${p}-cur`} name="currency" defaultValue={v?.currency ?? "UZS"} items={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
      </div>
    </FormSheet>
  );
}

export function ImportSheet() {
  const t = useTranslations("cp");
  const form = useSheetForm(importFile);
  const details = form.state && !form.state.ok ? form.state.details : undefined;
  return (
    <FormSheet form={form} title={t("import")} description={t("importHint")} trigger={<Button variant="outline" className="h-10"><FileSpreadsheet />{t("import")}</Button>}>
      <a href="/kontragentlar/shablon" download className="text-sm font-medium text-primary underline">{t("template")}</a>
      <Field id="cp-file" label={t("file")}>
        <Input id="cp-file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="h-11" />
      </Field>
      {details && (
        <ul role="alert" className="grid max-h-60 gap-1 overflow-y-auto rounded-md border border-bad/40 bg-bad/5 p-3 text-xs text-bad">
          {details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </FormSheet>
  );
}

export function DecisionButtons({ requestId }: { requestId: string }) {
  const t = useTranslations("cp");
  const approve = useSheetForm(approveRequest);
  const reject = useSheetForm(rejectRequest);
  return (
    <div className="flex flex-wrap gap-2">
      <form action={approve.formAction}>
        <input type="hidden" name="id" value={requestId} />
        <Button type="submit" size="sm" disabled={approve.pending}><Check />{t("approve")}</Button>
      </form>
      <FormSheet form={reject} title={t("reject")} submit={t("reject")} trigger={<Button variant="outline" size="sm"><X />{t("reject")}</Button>}>
        <input type="hidden" name="id" value={requestId} />
        <Field id={`reason-${requestId}`} label={t("rejectReason")}><Input id={`reason-${requestId}`} name="reason" required className="h-11" /></Field>
      </FormSheet>
    </div>
  );
}
