"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote, Box, Building2, CalendarClock, ClipboardCheck, FileText, Home, IdCard, Settings, ShieldAlert, ShoppingCart, Stamp, Target, Truck, Wallet,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KaftLogo } from "@/components/kaft-logo";

// PRD 5 modullari; hali qurilmaganlari — reliz belgisi bilan
const NAV = [
  { group: "Asosiy", items: [
    { href: "/", label: "Bosh sahifa", icon: Home },
    { href: "/pul", label: "Pul va kassalar", icon: Wallet, soon: "R1" },
    { href: "/kontragentlar", label: "Kontragentlar", icon: Building2, soon: "R1" },
    { href: "/savdo", label: "Savdo", icon: ShoppingCart, soon: "R1" },
    { href: "/xarid", label: "Xarid", icon: Truck, soon: "R1" },
    { href: "/ombor", label: "Ombor", icon: Box, soon: "R2" },
  ] },
  { group: "Jamoa", items: [
    { href: "/kadrlar", label: "Kadrlar", icon: IdCard, soon: "tez" },
    { href: "/davomat", label: "Davomat", icon: CalendarClock, soon: "R2" },
    { href: "/oylik", label: "Oylik", icon: Banknote, soon: "R2" },
    { href: "/topshiriqlar", label: "Topshiriqlar", icon: ClipboardCheck, soon: "R2" },
    { href: "/tasdiqlash", label: "Tasdiqlash", icon: Stamp, soon: "R2" },
  ] },
  { group: "Boshqaruv", items: [
    { href: "/nazorat", label: "Nazorat", icon: ShieldAlert, soon: "R2" },
    { href: "/qarorlar", label: "Qaror kartalari", icon: Target, soon: "R3" },
    { href: "/hujjatlar", label: "Hujjatlar", icon: FileText, soon: "tez" },
  ] },
];

export function AppSidebar({ brand, user }: { brand: string; user: { name: string; role: string } }) {
  const pathname = usePathname();
  const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4">
        <KaftLogo withTagline />
        {brand !== "Kaft" && <p className="mt-2 truncate px-1 text-xs text-sidebar-foreground/70">{brand}</p>}
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => (
          <SidebarGroup key={g.group}>
            <SidebarGroupLabel className="text-sidebar-foreground/60">{g.group}</SidebarGroupLabel>
            <SidebarMenu>
              {g.items.map((it) => (
                <SidebarMenuItem key={it.href}>
                  {it.soon ? (
                    <SidebarMenuButton disabled aria-disabled className="opacity-60" tooltip={`${it.label} — ${it.soon === "tez" ? "tez orada" : `${it.soon} relizida`}`}>
                      <it.icon /><span>{it.label}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild isActive={pathname === it.href}>
                      <Link href={it.href}><it.icon /><span>{it.label}</span></Link>
                    </SidebarMenuButton>
                  )}
                  {it.soon && <SidebarMenuBadge className="text-[10px] text-sidebar-foreground/60">{it.soon === "tez" ? "tez" : it.soon}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled className="opacity-60"><Settings /><span>Sozlamalar</span></SidebarMenuButton>
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
