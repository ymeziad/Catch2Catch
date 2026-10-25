import type { Metadata } from "next";
import { Suspense } from "react";
import { Public_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Nav } from "@/components/Nav";

const appSans = Public_Sans({ variable: "--font-app", subsets: ["latin"], weight: ["400", "500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Catch2Catch",
  description: "AI order witness and back office for small drink wholesalers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${appSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-ink">
        <ConvexClientProvider>
          <Suspense fallback={<div className="h-16 bg-white" />}><Nav /></Suspense>
          <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
            {/* Everything below the header is drawn 20% smaller; the header keeps its size. */}
            <div style={{ zoom: 0.8 }}>{children}</div>
          </main>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
