"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Parol maydoni: ko'z tugmasi bilan kiritilganini ko'rsatish/yashirish (xato terishni kamaytiradi). */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
