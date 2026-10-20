import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Auditoria Pluviométrica",
  description: "Compara as estações UNISC com CEMADEN e Open-Meteo para achar pluviômetro falhando.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold">
              ☔ Auditoria Pluviométrica
            </Link>
            <span className="text-xs text-neutral-500">UNISC × CEMADEN × Open-Meteo</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-neutral-500">
          Coerência não garante exatidão. Endpoints do CEMADEN não são documentados e podem mudar.
          Open-Meteo é modelo em grade, não pluviômetro.
        </footer>
      </body>
    </html>
  );
}
