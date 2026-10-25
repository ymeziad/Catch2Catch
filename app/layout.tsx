import type { Metadata } from "next";
import { Suspense } from "react";
import { Public_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Nav } from "@/components/Nav";
import { LangProvider } from "@/components/i18n";
import { TimeBackdrop } from "@/components/TimeBackdrop";

const appSans = Public_Sans({ variable: "--font-app", subsets: ["latin"], weight: ["400", "500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Catch2Catch",
  description: "AI order witness and back office for small drink wholesalers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${appSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col text-ink">
        <ConvexClientProvider>
          <LangProvider>
          <TimeBackdrop />
          <Suspense fallback={<div className="h-16 bg-white" />}><Nav /></Suspense>
          <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-8 sm:px-6 sm:py-10">
            {/* Everything you read sits on one white card over the time-of-day background. */}
            <div className="rounded-3xl bg-white px-6 py-9 shadow-[0_24px_60px_-24px_rgba(11,42,58,0.45)] ring-1 ring-black/5 sm:px-10 sm:py-11">
              {/* Everything below the header is drawn 20% smaller; the header keeps its size. */}
              <div style={{ zoom: 0.8 }}>{children}</div>
            </div>
          </main>
          </LangProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
