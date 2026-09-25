"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions";
import { cn } from "@/lib/utils";

const OPTIONS = [{ value: "uz", label: "O‘z" }, { value: "ru", label: "Ру" }] as const;

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label={t("language")} className={cn("flex rounded-lg bg-muted p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={locale === o.value} disabled={pending}
          onClick={() => start(async () => { await setLocale(o.value); router.refresh(); })}
          className={cn("min-h-9 min-w-10 rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors",
            locale === o.value && "bg-card text-foreground shadow-sm")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
