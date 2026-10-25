import { Suspense } from "react";
import { ShopOrderView } from "@/components/ShopOrderView";

/** The page a shop opens from its text to change its own order. */
export default function ShopOrderPage() {
  return (
    <Suspense fallback={<p className="text-ink/60">Loading…</p>}>
      <ShopOrderView />
    </Suspense>
  );
}
