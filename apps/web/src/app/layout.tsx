import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// O'zbek (lotin, oʻ/gʻ) va rus harflari uchun
const inter = Inter({ variable: "--font-sans", subsets: ["latin", "latin-ext", "cyrillic"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return { title: "Kaft", description: t("tagline") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    // next-themes <html> klassini o'zi qo'yadi — gidratsiya ogohlantirishi kutilgan
    <html lang={locale} className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans text-foreground">
        <NextIntlClientProvider>
          <ThemeProvider>
            {children}
            <Toaster richColors position="top-center" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
