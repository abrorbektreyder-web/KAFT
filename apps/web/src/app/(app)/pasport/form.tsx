"use client";
// Kompaniya pasportini tahrirlash (ega): matn maydonlari va maxfiylik darajasi.
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormSheet, Picker, useSheetForm } from "@/components/sheet-form";
import { saveProfile } from "./actions";
import { PROFILE_FIELDS } from "./fields";

type Profile = Partial<Record<(typeof PROFILE_FIELDS)[number], string | null>> & { visibility?: string };

export function ProfileSheet({ companyId, profile }: { companyId: string; profile: Profile | null }) {
  const t = useTranslations("passport");
  const form = useSheetForm(saveProfile);
  return (
    <FormSheet form={form} title={t("edit")} trigger={<Button variant="outline" className="h-10"><Pencil />{t("edit")}</Button>}>
      <input type="hidden" name="companyId" value={companyId} />
      {PROFILE_FIELDS.map((k) => (
        <Field key={k} id={`pp-${k}`} label={t(k)}>
          <textarea id={`pp-${k}`} name={k} defaultValue={profile?.[k] ?? ""} rows={k === "strategy" || k === "products" ? 4 : 2}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm" />
        </Field>
      ))}
      <Field id="pp-vis" label={t("visibility")}>
        <Picker id="pp-vis" name="visibility" defaultValue={profile?.visibility ?? "owner"}
          items={(["owner", "managers", "all"] as const).map((v) => ({ value: v, label: t(`vis_${v}`) }))} />
      </Field>
    </FormSheet>
  );
}
