import { Hand } from "lucide-react";
import { cn } from "@/lib/utils";

export function KaftLogo({ className, withTagline = false }: { className?: string; withTagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-white">
        <Hand className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold tracking-tight">Kaft</span>
        {withTagline && <span className="block text-xs text-sidebar-foreground/70">Kompaniyangiz kaftingizda</span>}
      </span>
    </div>
  );
}
