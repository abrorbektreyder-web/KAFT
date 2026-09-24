import { Suspense } from "react";
import { requireCtx } from "@/lib/server";
import { loadShell } from "@/lib/dashboard";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const shell = await loadShell(ctx);
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar brand={shell.brand} user={shell.user} />
        <SidebarInset className="bg-background">
          <Suspense>
            <Topbar companies={shell.companies} notifications={shell.notifications} unread={shell.unread} />
          </Suspense>
          <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-16 md:px-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
