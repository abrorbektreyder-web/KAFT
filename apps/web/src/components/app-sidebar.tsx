"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Banknote, Box, Building2, CalendarClock, ClipboardCheck, FileText, Home, IdCard, Settings, ShieldAlert, ShoppingCart, Stamp, Target, Truck, Wallet,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KaftLogo } from "@/components/kaft-logo";

// PRD 5 modullari; hali qurilmaganlari — reliz belgisi bilan ("tez" — R0 ichida, UI keyin)
const NAV = [
  { group: "main", items: [
    { href: "/", key: "home", icon: Home },
    { href: "/pul", key: "money", icon: Wallet },
    { href: "/kontragentlar", key: "counterparties", icon: Building2, soon: "R1" },
    { href: "/savdo", key: "sales", icon: ShoppingCart, soon: "R1" },
    { href: "/xarid", key: "purchases", icon: Truck, soon: "R1" },
    { href: "/ombor", key: "warehouse", icon: Box, soon: "R2" },
  ] },
  { group: "team", items: [
    { href: "/kadrlar", key: "hr", icon: IdCard, soon: "tez" },
    { href: "/davomat", key: "attendance", icon: CalendarClock, soon: "R2" },
    { href: "/oylik", key: "payroll", icon: Banknote, soon: "R2" },
    { href: "/topshiriqlar", key: "tasks", icon: ClipboardCheck, soon: "R2" },
    { href: "/tasdiqlash", key: "approvals", icon: Stamp, soon: "R2" },
  ] },
  { group: "management", items: [
    { href: "/nazorat", key: "control", icon: ShieldAlert, soon: "R2" },
    { href: "/qarorlar", key: "decisions", icon: Target, soon: "R3" },
    { href: "/hujjatlar", key: "documents", icon: FileText, soon: "tez" },
  ] },
] as const;

export function AppSidebar({ brand, user }: { brand: string; user: { name: string; role: string } }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4">
        <KaftLogo tagline={tc("tagline")} />
        {brand !== "Kaft" && <p className="mt-2 truncate px-1 text-xs text-sidebar-foreground/70">{brand}</p>}
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => (
          <SidebarGroup key={g.group}>
            <SidebarGroupLabel className="text-sidebar-foreground/60">{t(g.group)}</SidebarGroupLabel>
            <SidebarMenu>
              {g.items.map((it) => {
                const soon = "soon" in it ? it.soon : undefined;
                const label = t(it.key);
                return (
                  <SidebarMenuItem key={it.href}>
                    {soon ? (
                      <SidebarMenuButton disabled aria-disabled className="opacity-60"
                        tooltip={`${label} — ${soon === "tez" ? t("soon") : t("inRelease", { release: soon })}`}>
                        <it.icon /><span>{label}</span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton asChild isActive={pathname === it.href}>
                        <Link href={it.href}><it.icon /><span>{label}</span></Link>
                      </SidebarMenuButton>
                    )}
                    {soon && <SidebarMenuBadge className="text-[10px] text-sidebar-foreground/60">{soon === "tez" ? t("soonShort") : soon}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled className="opacity-60"><Settings /><span>{t("settings")}</span></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <Avatar className="size-8"><AvatarFallback className="bg-sidebar-accent text-xs text-white">{initials}</AvatarFallback></Avatar>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{user.role}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
