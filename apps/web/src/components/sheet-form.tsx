"use client";
// Yon paneldagi forma: server action natijasi — muvaffaqiyatda xabar va yopiladi, xatoda xabar ko'rsatiladi.
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type ActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; error: string; details?: string[] }
  | null;

export function useSheetForm(action: (s: ActionResult, f: FormData) => Promise<ActionResult>, onDone?: (res: { ok: true; id?: string }) => void) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, f: FormData) => {
    const res = await action(prev, f);
    if (res?.ok) {
      toast.success(res.message ?? t("saved"));
      setOpen(false);
      onDone?.(res);
    } else if (res) {
      toast.error(res.error);
    }
    return res;
  }, null);
  return { open, setOpen, formAction, pending, state };
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Picker({ id, name, items, value, defaultValue, onChange, required = true }: {
  id: string; name: string; items: { value: string; label: string }[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; required?: boolean;
}) {
  const t = useTranslations("common");
  return (
    <Select name={name} value={value} defaultValue={defaultValue} onValueChange={onChange} required={required}>
      <SelectTrigger id={id} className="h-11 w-full"><SelectValue placeholder={t("choose")} /></SelectTrigger>
      <SelectContent>
        {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function FormSheet({ trigger, title, description, form, submit, children }: {
  trigger: React.ReactNode; title: string; description?: string; form: ReturnType<typeof useSheetForm>; submit?: string; children: React.ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <Sheet open={form.open} onOpenChange={form.setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <form action={form.formAction} className="grid gap-4 px-4 pb-6">
          {children}
          <Button type="submit" disabled={form.pending} className="h-11">{submit ?? t("save")}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
