import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { acceptInvite } from "@kaft/auth";
import { auth, db } from "@/lib/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";

const ERROR_KEYS = { qisqa: "errShort", "mos-emas": "errMismatch", yaroqsiz: "errInvalid" } as const;

export default async function InvitePage({ params, searchParams }: PageProps<"/taklif/[token]">) {
  const t = await getTranslations("auth");
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

  const errorKey = typeof xato === "string" && xato in ERROR_KEYS ? ERROR_KEYS[xato as keyof typeof ERROR_KEYS] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("inviteTitle")}</CardTitle>
        <CardDescription>{t("inviteDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accept} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">{t("newPassword")}</Label>
            <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} required className="h-11" />
            <p className="text-xs text-muted-foreground">{t("newPasswordHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">{t("repeatPassword")}</Label>
            <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required className="h-11" />
          </div>
          {errorKey && <p role="alert" className="text-sm text-bad">{t(errorKey)}</p>}
          <Button type="submit" className="h-11">{t("savePassword")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
