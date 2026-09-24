"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const { data, error } = await authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")) });
    setPending(false);
    if (error) return toast.error("Email yoki parol noto‘g‘ri");
    // 2FA yoqilgan bo'lsa twoFactorClient o'zi /kirish/kod ga yo'naltiradi
    if (!(data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) router.replace("/");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Kirish</CardTitle>
        <CardDescription>Taklifnomadagi email va o‘zingiz o‘rnatgan parol</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Parol</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
          </div>
          <Button type="submit" disabled={pending} className="h-11">{pending ? "Tekshirilmoqda…" : "Kirish"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
