"use client";
// Pul sahifasi formalari: kirim/chiqim, o'tkazma (ayirboshlash), kassa ochish, bekor qilish — yon panelda.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormSheet, Picker, useSheetForm } from "@/components/sheet-form";
import { addAccount, addTransaction, addTransfer, cancelTx } from "./actions";

type Account = { id: string; name: string; currency: string; isArchived: boolean };
type Category = { id: string; name: string; direction: "in" | "out" };
type Named = { id: string; name: string };

const CURRENCIES = ["UZS", "USD", "EUR", "RUB"] as const;
const TYPES = ["cash", "bank", "card", "payment"] as const;

export function TransactionSheet({ direction, accounts, categories, counterparties, today }: {
  direction: "in" | "out"; accounts: Account[]; categories: Category[]; counterparties: Named[]; today: string;
}) {
  const t = useTranslations("money");
  const form = useSheetForm(addTransaction);
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0]!.id : "");
  const currency = accounts.find((a) => a.id === accountId)?.currency;
  const title = direction === "in" ? t("income") : t("expense");
  return (
    <FormSheet form={form} title={title} trigger={
      <Button variant={direction === "in" ? "default" : "outline"} className="h-10">
        {direction === "in" ? <ArrowDownLeft /> : <ArrowUpRight />}{title}
      </Button>
    }>
      <input type="hidden" name="direction" value={direction} />
      <Field id={`${direction}-account`} label={t("fAccount")}>
        <Picker id={`${direction}-account`} name="accountId" value={accountId} onChange={setAccountId}
          items={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))} />
      </Field>
      <Field id={`${direction}-amount`} label={currency ? `${t("fAmount")} (${currency})` : t("fAmount")}>
        <Input id={`${direction}-amount`} name="amount" inputMode="decimal" autoComplete="off" required className="h-11" placeholder="1 250 000" />
      </Field>
      <Field id={`${direction}-category`} label={t("fCategory")}>
        <Picker id={`${direction}-category`} name="categoryId"
          items={categories.filter((c) => c.direction === direction).map((c) => ({ value: c.id, label: c.name }))} />
      </Field>
      {counterparties.length > 0 && (
        <Field id={`${direction}-cp`} label={t("fCounterparty")}>
          <Picker id={`${direction}-cp`} name="counterpartyId" required={false}
            items={[{ value: "none", label: t("fNoCounterparty") }, ...counterparties.map((c) => ({ value: c.id, label: c.name }))]} />
        </Field>
      )}
      <Field id={`${direction}-date`} label={t("fDate")}>
        <Input id={`${direction}-date`} name="occurredOn" type="date" defaultValue={today} max={today} required className="h-11" />
      </Field>
      {currency && currency !== "UZS" && (
        <Field id={`${direction}-rate`} label={t("fRate", { currency })} hint={t("fRateHint")}>
          <Input id={`${direction}-rate`} name="rate" inputMode="decimal" autoComplete="off" className="h-11" />
        </Field>
      )}
      <Field id={`${direction}-basis`} label={t("fBasis")} hint={t("fBasisHint")}>
        <Input id={`${direction}-basis`} name="basis" className="h-11" />
      </Field>
      <Field id={`${direction}-note`} label={t("fNote")}>
        <Input id={`${direction}-note`} name="note" className="h-11" />
      </Field>
    </FormSheet>
  );
}

export function TransferSheet({ accounts, today }: { accounts: Account[]; today: string }) {
  const t = useTranslations("money");
  const form = useSheetForm(addTransfer);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const items = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));
  const exchange = from && to && from.currency !== to.currency;
  return (
    <FormSheet form={form} title={exchange ? t("exchange") : t("transfer")} trigger={
      <Button variant="outline" className="h-10"><ArrowLeftRight />{t("transfer")}</Button>
    }>
      <Field id="tr-from" label={t("fFrom")}><Picker id="tr-from" name="fromAccountId" value={fromId} onChange={setFromId} items={items} /></Field>
      <Field id="tr-to" label={t("fTo")}><Picker id="tr-to" name="toAccountId" value={toId} onChange={setToId} items={items.filter((i) => i.value !== fromId)} /></Field>
      <Field id="tr-amount" label={from ? `${t("fAmount")} (${from.currency})` : t("fAmount")}>
        <Input id="tr-amount" name="amount" inputMode="decimal" autoComplete="off" required className="h-11" />
      </Field>
      {exchange && (
        <Field id="tr-to-amount" label={t("fToAmount", { currency: to.currency })}>
          <Input id="tr-to-amount" name="toAmount" inputMode="decimal" autoComplete="off" required className="h-11" />
        </Field>
      )}
      <Field id="tr-date" label={t("fDate")}>
        <Input id="tr-date" name="occurredOn" type="date" defaultValue={today} max={today} required className="h-11" />
      </Field>
      <Field id="tr-note" label={t("fNote")}><Input id="tr-note" name="note" className="h-11" /></Field>
    </FormSheet>
  );
}

export function AccountSheet({ companies, users, today }: { companies: Named[]; users: Named[]; today: string }) {
  const t = useTranslations("money");
  const form = useSheetForm(addAccount);
  return (
    <FormSheet form={form} title={t("newAccount")} trigger={<Button variant="ghost" className="h-10"><Plus />{t("newAccount")}</Button>}>
      <Field id="acc-name" label={t("fName")}><Input id="acc-name" name="name" required className="h-11" placeholder="Asosiy kassa" /></Field>
      <Field id="acc-company" label={t("fCompany")}>
        <Picker id="acc-company" name="companyId" items={companies.map((c) => ({ value: c.id, label: c.name }))}
          value={companies.length === 1 ? companies[0]!.id : undefined} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="acc-type" label={t("fType")}><Picker id="acc-type" name="type" items={TYPES.map((k) => ({ value: k, label: t(`type_${k}`) }))} /></Field>
        <Field id="acc-currency" label={t("fCurrency")}><Picker id="acc-currency" name="currency" items={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
      </div>
      <Field id="acc-resp" label={t("fResponsible")}>
        <Picker id="acc-resp" name="responsibleUserId" required={false}
          items={[{ value: "none", label: t("fNobody") }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="acc-opening" label={t("fOpening")}><Input id="acc-opening" name="openingBalance" inputMode="decimal" autoComplete="off" className="h-11" /></Field>
        <Field id="acc-opening-on" label={t("fOpeningOn")}><Input id="acc-opening-on" name="openingOn" type="date" defaultValue={today} max={today} className="h-11" /></Field>
      </div>
    </FormSheet>
  );
}

export function CancelSheet({ id }: { id: string }) {
  const t = useTranslations("money");
  const form = useSheetForm(cancelTx);
  return (
    <FormSheet form={form} title={t("cancelTitle")} description={t("cancelHint")} trigger={
      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={t("cancel")} title={t("cancel")}><Undo2 /></Button>
    }>
      <input type="hidden" name="id" value={id} />
      <Field id={`reason-${id}`} label={t("reason")}><Input id={`reason-${id}`} name="reason" required className="h-11" /></Field>
    </FormSheet>
  );
}
