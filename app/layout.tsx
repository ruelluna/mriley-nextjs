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
  title: "Gerber Furniture · Product Catalog",
  description:
    "Browse the Gerber Furniture product catalog — every staged product with pricing, specifications and per-SKU pages.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/[.08] dark:border-white/[.145]">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Gerber Furniture <span className="font-normal text-zinc-500">· catalog</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-500">
              <Link href="/products" className="hover:text-black dark:hover:text-zinc-100">Products</Link>
              <Link href="/plan" className="hover:text-black dark:hover:text-zinc-100">Plan</Link>
              <Link href="/api/products?per=5" className="hover:text-black dark:hover:text-zinc-100">API</Link>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-black/[.08] py-6 dark:border-white/[.145]">
          <p className="mx-auto w-full max-w-7xl px-6 text-xs text-zinc-500">
            Data source: Gerber staging database (SQLite). Prices shown are source display prices —
            confirm on gerbersfurniture.com before publishing.
          </p>
        </footer>
      </body>
    </html>
  );
}
