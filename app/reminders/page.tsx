"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Card, DemoClock, statusTone, when } from "@/components/money";

const kindLabel: Record<string, string> = {
  order_unconfirmed: "Confirm your order",
  payment_due_soon: "Payment due soon",
  payment_due: "Payment due today",
  payment_late: "Payment overdue",
  escalate_owner: "Escalate to owner",
};

export default function RemindersPage() {
  const rows = useQuery(api.reminders.timeline, { limit: 150 });
  const clock = useQuery(api.reminders.clock, {});
  const now = clock?.demoNow ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <p className="mt-1 text-sm text-zinc-600">
          The agent chases payments on a schedule, escalates to the owner, and stops when paid or disputed. Shops that paid late twice in 90 days get escalated sooner.
          Use the demo clock to watch a week happen in seconds.
        </p>
      </div>
      <DemoClock />
      <Card title="Timeline">
        <ol className="relative space-y-2 border-l pl-4 text-sm">
          {rows?.length === 0 && <li className="text-zinc-500">No reminders yet. Create a demo order on the Invoices page.</li>}
          {rows?.map((r) => {
            const isNowLine = r.status === "scheduled" && r.scheduledFor > now;
            return (
              <li key={r._id} className={isNowLine ? "opacity-60" : ""}>
                <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${r.status === "sent" ? (r.kind === "escalate_owner" ? "bg-red-500" : "bg-green-500") : r.status === "cancelled" ? "bg-zinc-300" : "bg-blue-400"}`} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-36 font-mono text-xs text-zinc-500">{when(r.scheduledFor)}</span>
                  <span className="font-medium">{kindLabel[r.kind]}</span>
                  <span className="text-zinc-600">{r.shopName ?? ""}</span>
                  <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  {r.escalated && <Badge tone="red">owner flagged</Badge>}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
