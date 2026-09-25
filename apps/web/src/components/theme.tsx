"use client";
import { useEffect, useState } from "react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Tanlov brauzerda saqlanadi; birinchi ochilishda — tizim sozlamasi
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("common");
  // Server mavzuni bilmaydi — yorliq faqat brauzerda aniqlanadi (aks holda gidratsiya nomuvofiqligi)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = resolvedTheme === "dark";
  const label = !mounted ? t("theme") : dark ? t("themeLight") : t("themeDark");
  return (
    <Button variant="ghost" size="icon" className={className ?? "size-10"} aria-label={label}
      onClick={() => setTheme(dark ? "light" : "dark")}>
      {/* SSR'da mavzu noma'lum — ikkala ikonka CSS bilan almashadi, sakrash bo'lmaydi */}
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
