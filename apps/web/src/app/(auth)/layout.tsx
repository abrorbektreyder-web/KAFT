import { KaftLogo } from "@/components/kaft-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-sidebar px-4 py-10">
      <KaftLogo className="text-white" />
      <div className="w-full max-w-sm">{children}</div>
      <p className="text-xs text-sidebar-foreground/70">Kompaniyangiz kaftingizda.</p>
    </main>
  );
}
