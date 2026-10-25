import { Suspense } from "react";
import { ProblemView } from "@/components/ProblemView";

/** One problem, everything about it. */
export default function ProblemPage() {
  return (
    <Suspense fallback={<p className="text-ink/60">Loading…</p>}>
      <ProblemView />
    </Suspense>
  );
}
