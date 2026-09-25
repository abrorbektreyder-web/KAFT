"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, LogOut, Search } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { timeAgo } from "@/lib/format";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";

type Notification = { id: string; title: string; body: string; createdAt: Date; read: boolean };

export function Topbar({ companies, notifications, unread }: { companies: { id: string; name: string }[]; notifications: Notification[]; unread: number }) {
  const t = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const company = params.get("kompaniya") ?? "all";

  function setCompany(v: string) {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("kompaniya"); else next.set("kompaniya", v);
    router.push(`/?${next}`);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-1.5 border-b bg-background/85 px-3 backdrop-blur md:gap-2 md:px-6">
      <SidebarTrigger className="size-10 md:hidden" aria-label={t("menu")} />
      {companies.length > 1 && (
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger aria-label={t("company")} className="h-10 w-[130px] bg-card font-medium sm:w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCompanies", { count: companies.length })}</SelectItem>
            {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <form action="/qidiruv" className="relative ml-auto hidden w-full max-w-sm md:block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" placeholder={t("searchPlaceholder")} aria-label={t("search")} className="h-10 bg-card pl-9" />
      </form>
      <Button asChild variant="ghost" size="icon" className="ml-auto size-10 md:hidden" aria-label={t("search")}>
        <a href="/qidiruv"><Search /></a>
      </Button>
      <LocaleSwitcher className="hidden sm:flex" />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative size-10" aria-label={unread ? t("notificationsUnread", { count: unread }) : t("notifications")}>
            <Bell />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("noNotifications")}</p>}
          {notifications.map((n) => (
            <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5 py-2">
              <span className="text-xs text-muted-foreground">{n.title} · {timeAgo(new Date(n.createdAt), t)}</span>
              <span className="text-sm">{n.body}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="sm:hidden" />
          <div className="p-1 sm:hidden"><LocaleSwitcher /></div>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" className="size-10" aria-label={t("logout")}
        onClick={async () => { await authClient.signOut(); router.replace("/kirish"); }}>
        <LogOut />
      </Button>
    </header>
  );
}
