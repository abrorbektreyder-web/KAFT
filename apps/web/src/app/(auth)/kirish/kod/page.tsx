"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function TotpPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function verify(value = code) {
    if (value.length !== 6) return;
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: value });
    setPending(false);
    if (error) {
      setCode("");
      return toast.error(t("badCode"));
    }
    router.replace("/");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("totpTitle")}</CardTitle>
        <CardDescription>{t("totpDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid justify-items-center gap-4">
        <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={verify} autoFocus inputMode="numeric">
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-11 text-lg" />)}
          </InputOTPGroup>
        </InputOTP>
        <Button className="h-11 w-full" disabled={pending || code.length !== 6} onClick={() => verify()}>
          {pending ? tc("checking") : t("confirm")}
        </Button>
      </CardContent>
    </Card>
  );
}
