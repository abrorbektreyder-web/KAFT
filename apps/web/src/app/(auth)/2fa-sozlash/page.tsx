"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";

// CORE-05: ega va moliya rollari uchun majburiy
export default function TwoFactorSetupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [setup, setSetup] = useState<{ uri: string; secret: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const { data, error } = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get("password")) });
    setPending(false);
    if (error || !data || !("totpURI" in data)) return toast.error(t("wrongPassword"));
    setSetup({ uri: data.totpURI, secret: new URL(data.totpURI).searchParams.get("secret") ?? "", backupCodes: data.backupCodes });
  }

  async function confirm(value = code) {
    if (value.length !== 6) return;
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: value });
    setPending(false);
    if (error) {
      setCode("");
      return toast.error(t("badCode"));
    }
    toast.success(t("enabled"));
    router.replace("/");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("setupTitle")}</CardTitle>
        <CardDescription>{t("setupDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!setup ? (
          <form onSubmit={start} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="password">{t("setupPassword")}</Label>
              <PasswordInput id="password" name="password" autoComplete="current-password" required className="h-11" />
              <p className="text-xs text-muted-foreground">{t("setupPasswordHint")}</p>
            </div>
            <Button type="submit" disabled={pending} className="h-11">{t("continue")}</Button>
          </form>
        ) : (
          <>
            <ol className="grid list-decimal gap-2 pl-5 text-sm text-muted-foreground">
              <li>{t("setupStep1")}</li>
              <li><a href={setup.uri} className="font-medium text-primary underline">{t("setupStep2Link")}</a> {t("setupStep2Rest")}</li>
            </ol>
            <code className="break-all rounded-md bg-muted px-3 py-2 text-center font-mono text-sm tracking-wider">{setup.secret}</code>
            <Alert>
              <AlertTitle>{t("backupCodes")}</AlertTitle>
              <AlertDescription className="grid grid-cols-2 gap-x-4 font-mono text-xs">
                {setup.backupCodes.map((c) => <span key={c}>{c}</span>)}
              </AlertDescription>
            </Alert>
            <div className="grid justify-items-center gap-3">
              <Label>{t("appCode")}</Label>
              <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={confirm} inputMode="numeric">
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-11 text-lg" />)}
                </InputOTPGroup>
              </InputOTP>
              <Button className="h-11 w-full" disabled={pending || code.length !== 6} onClick={() => confirm()}>{t("enable")}</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
