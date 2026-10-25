"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { type ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
// Module-level singleton (same pattern as the official Convex + Next.js template).
const client = new ConvexReactClient(url ?? "https://unconfigured.convex.cloud");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={client}>
      {!url && (
        <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2 text-center">
          NEXT_PUBLIC_CONVEX_URL is not set. Run <code>npx convex dev</code> once to create <code>.env.local</code>.
        </div>
      )}
      {children}
    </ConvexProvider>
  );
}
