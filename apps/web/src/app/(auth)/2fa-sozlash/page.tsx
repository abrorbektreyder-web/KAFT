"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

// CORE-05: ega va moliya rollari uchun majburiy
export default function TwoFactorSetupPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<{ uri: string; secret: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const { data, error } = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get("password")) });
    setPending(false);
    if (error || !data || !("totpURI" in data)) return toast.error("Parol noto‘g‘ri");
    setSetup({ uri: data.totpURI, secret: new URL(data.totpURI).searchParams.get("secret") ?? "", backupCodes: data.backupCodes });
  }

  async function confirm(value = code) {
    if (value.length !== 6) return;
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: value });
    setPending(false);
    if (error) {
      setCode("");
      return toast.error("Kod noto‘g‘ri");
    }
    toast.success("Ikki bosqichli kirish yoqildi");
    router.replace("/");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Ikki bosqichli kirish</CardTitle>
        <CardDescription>Sizning rolingiz uchun majburiy: parol + telefondagi kod</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!setup ? (
          <form onSubmit={start} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="password">Kirish parolingiz</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
              <p className="text-xs text-muted-foreground">Hozirgina kirgan parolingiz — shaxsingizni tasdiqlash uchun</p>
            </div>
            <Button type="submit" disabled={pending} className="h-11">Davom etish</Button>
          </form>
        ) : (
          <>
            <ol className="grid list-decimal gap-2 pl-5 text-sm text-muted-foreground">
              <li>Telefoningizga Google Authenticator yoki shunga o‘xshash ilova o‘rnating.</li>
              <li><a href={setup.uri} className="font-medium text-primary underline">Shu havolani oching</a> yoki kalitni qo‘lda kiriting:</li>
            </ol>
            <code className="break-all rounded-md bg-muted px-3 py-2 text-center font-mono text-sm tracking-wider">{setup.secret}</code>
            <Alert>
              <AlertTitle>Zaxira kodlar — xavfsiz joyga yozib qo‘ying</AlertTitle>
              <AlertDescription className="grid grid-cols-2 gap-x-4 font-mono text-xs">
                {setup.backupCodes.map((c) => <span key={c}>{c}</span>)}
              </AlertDescription>
            </Alert>
            <div className="grid justify-items-center gap-3">
              <Label>Ilovadagi 6 xonali kod</Label>
              <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={confirm} inputMode="numeric">
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-11 text-lg" />)}
                </InputOTPGroup>
              </InputOTP>
              <Button className="h-11 w-full" disabled={pending || code.length !== 6} onClick={() => confirm()}>Yoqish</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
