import { getTranslations } from "next-intl/server";
import { KaftLogo } from "@/components/kaft-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common");
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-8 bg-sidebar px-4 py-10">
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <LocaleSwitcher className="bg-white/10" />
        <ThemeToggle className="size-10 text-white hover:bg-white/10 hover:text-white" />
      </div>
      <KaftLogo className="text-white" />
      <div className="w-full max-w-sm">{children}</div>
      <p className="text-xs text-sidebar-foreground/70">{t("tagline")}.</p>
    </main>
  );
}
