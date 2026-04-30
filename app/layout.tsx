import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sora = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Karate Club Pagamentos",
  description: "Portal de pagamentos para atletas, mensalidades e eventos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className={`${sora.variable} ${jetBrainsMono.variable} antialiased`}>
        <div className="min-h-screen">{children}</div>
        <footer className="border-t border-line/80 px-4 py-5 sm:px-6 md:px-8">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 text-sm text-zinc-600">
            <Link href="/termos-e-condicoes" className="hover:text-brand hover:underline">
              Termos e condicoes
            </Link>
            <span aria-hidden="true">|</span>
            <Link href="/politica-de-privacidade" className="hover:text-brand hover:underline">
              Politica de privacidade
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
