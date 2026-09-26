"use client";
// Shtat rejasini belgilash: bo'lim, lavozim, rejadagi o'rinlar soni (mavjud bo'lsa — yangilanadi).
import { useTranslations } from "next-intl";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormSheet, Picker, useSheetForm } from "@/components/sheet-form";
import { savePlan } from "./actions";

type Named = { id: string; name: string };

export function PlanSheet({ departments, positions }: { departments: Named[]; positions: Named[] }) {
  const t = useTranslations("staffing");
  const form = useSheetForm(savePlan);
  return (
    <FormSheet form={form} title={t("setPlan")} trigger={<Button className="h-10"><ListPlus />{t("setPlan")}</Button>}>
      <Field id="st-dept" label={t("fDept")}><Picker id="st-dept" name="departmentId" items={departments.map((d) => ({ value: d.id, label: d.name }))} /></Field>
      <Field id="st-pos" label={t("fPosition")}><Picker id="st-pos" name="positionId" items={positions.map((p) => ({ value: p.id, label: p.name }))} /></Field>
      <Field id="st-planned" label={t("fPlanned")}><Input id="st-planned" name="planned" inputMode="numeric" required className="h-11" /></Field>
    </FormSheet>
  );
}
