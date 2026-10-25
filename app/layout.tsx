import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Catch2Catch",
  description: "AI order witness and back office for small drink wholesalers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <ConvexClientProvider>
          <header className="border-b bg-white">
            <nav className="mx-auto max-w-5xl flex items-center gap-6 px-4 h-14 text-sm">
              <Link href="/" className="font-semibold">Catch2Catch</Link>
              <Link href="/calls" className="hover:underline">Calls</Link>
              <Link href="/invoices" className="hover:underline">Invoices</Link>
              <Link href="/disputes" className="hover:underline">Disputes</Link>
              <Link href="/reminders" className="hover:underline">Reminders</Link>
              <Link href="/ledger" className="hover:underline">Ledger</Link>
              <Link href="/audit" className="hover:underline">Audit</Link>
              <Link href="/messages" className="hover:underline">Messages</Link>
              <Link href="/admin/upload" className="hover:underline">Upload recording</Link>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
