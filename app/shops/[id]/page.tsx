import { Suspense } from "react";
import { ShopView } from "@/components/ShopView";

/** A shop's track record. */
export default function ShopPage() {
  return (
    <Suspense fallback={<p className="text-ink/60">Loading…</p>}>
      <ShopView />
    </Suspense>
  );
}
