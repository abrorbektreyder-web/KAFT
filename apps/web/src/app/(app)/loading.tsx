// Bo'limga o'tishda sahifa ma'lumoti kelguncha ko'rinadigan skelet (qobiq — yon panel va yuqori panel — joyida qoladi).
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-live="polite">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-5">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-5" style={{ width: `${90 - i * 8}%` }} />)}
      </div>
    </div>
  );
}
