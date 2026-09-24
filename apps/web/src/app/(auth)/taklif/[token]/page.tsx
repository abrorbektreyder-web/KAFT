import { redirect } from "next/navigation";
import { acceptInvite } from "@kaft/auth";
import { auth, db } from "@/lib/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRORS: Record<string, string> = {
  qisqa: "Parol kamida 10 belgidan iborat bo‘lsin",
  "mos-emas": "Parollar bir xil emas",
  yaroqsiz: "Taklifnoma yaroqsiz yoki muddati o‘tgan",
};

export default async function InvitePage({ params, searchParams }: PageProps<"/taklif/[token]">) {
  const { token } = await params;
  const { xato } = await searchParams;

  async function accept(form: FormData) {
    "use server";
    const password = String(form.get("password"));
    if (password.length < 10) redirect(`/taklif/${token}?xato=qisqa`);
    if (password !== String(form.get("confirm"))) redirect(`/taklif/${token}?xato=mos-emas`);
    let ok = true;
    try {
      await acceptInvite(db, auth, { token, password });
    } catch {
      ok = false;
    }
    redirect(ok ? "/kirish" : `/taklif/${token}?xato=yaroqsiz`);
  }

  const message = typeof xato === "string" ? ERRORS[xato] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Jamoaga xush kelibsiz</CardTitle>
        <CardDescription>Kirish uchun parol o‘rnating</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accept} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">Yangi parol</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="h-11" />
            <p className="text-xs text-muted-foreground">Kamida 10 belgi</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Parolni takrorlang</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="h-11" />
          </div>
          {message && <p role="alert" className="text-sm text-bad">{message}</p>}
          <Button type="submit" className="h-11">Parolni saqlash</Button>
        </form>
      </CardContent>
    </Card>
  );
}
