"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";

export default function LoginPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const { data, error } = await authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")) });
    setPending(false);
    if (error) return toast.error(t("badCredentials"));
    // 2FA yoqilgan bo'lsa twoFactorClient o'zi /kirish/kod ga yo'naltiradi
    if (!(data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) router.replace("/");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("loginTitle")}</CardTitle>
        <CardDescription>{t("loginDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <PasswordInput id="password" name="password" autoComplete="current-password" required className="h-11" />
          </div>
          <Button type="submit" disabled={pending} className="h-11">{pending ? tc("checking") : t("login")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
