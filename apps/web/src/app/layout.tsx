import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// O'zbek (lotin, oʻ/gʻ) va rus harflari uchun
const inter = Inter({ variable: "--font-sans", subsets: ["latin", "latin-ext", "cyrillic"] });

export const metadata: Metadata = {
  title: "Kaft",
  description: "Kompaniyangiz kaftingizda — biznes boshqaruv platformasi",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
