import { FileText, IdCard, Search } from "lucide-react";
import { search } from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function SearchPage({ searchParams }: PageProps<"/qidiruv">) {
  const ctx = await requireCtx();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const hits = query ? await search(db, ctx, query) : [];

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Qidiruv</h1>
      <form className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={query} autoFocus placeholder="Xodim ismi, hujjat nomi…" aria-label="Qidiruv so‘zi" className="h-12 bg-card pl-9 text-base" />
      </form>
      {query && (
        <Card>
          <CardContent className="grid pt-2">
            {hits.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">«{query}» bo‘yicha hech narsa topilmadi</p>}
            {hits.map((h) => (
              <div key={`${h.type}-${h.id}`} className="flex items-center gap-3 border-t py-3 first:border-t-0">
                {h.type === "employee" ? <IdCard className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
                <div className="min-w-0">
                  <p className="font-medium">{h.title}</p>
                  {h.subtitle && <p className="text-xs text-muted-foreground">{h.subtitle}</p>}
                </div>
                <span className="ml-auto text-xs text-muted-foreground">{h.type === "employee" ? "Xodim" : "Hujjat"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
