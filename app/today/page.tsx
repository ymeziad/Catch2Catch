"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DemoTools, cap, disputeHeadline, dueText } from "@/components/money";

/** OWNER: Amaan. The owner's first screen: a greeting and a plain numbered to-do list. */
export default function TodayPage() {
  const invoices = useQuery(api.billing.listInvoices, {});
  const disputes = useQuery(api.disputes.list, {});
  const clock = useQuery(api.reminders.clock, {});
  const loading = invoices === undefined || disputes === undefined;
  const now = clock?.demoNow ?? 0;

  const tasks: { key: string; text: string; href: string }[] = [
    ...(disputes ?? [])
      .filter((d) => d.status === "awaiting_approval" || d.status === "open")
      .map((d) => ({ key: d._id, href: `/disputes/${d._id}`, text: d.summary ?? disputeHeadline(d) })),
    ...(invoices ?? [])
      .filter((i) => i.balanceCents > 0 && i.status !== "disputed" && now > i.dueAt)
      .map((i) => ({ key: i._id, href: "/invoices", text: `${i.shopName} is ${dueText(i.dueAt, now).text} paying their bill.` })),
  ];
  const n = tasks.length;
  // Workload color: teal when clear, mustard for a couple of things, rust when it piles up.
  const tone = n === 0 ? "text-teal" : n <= 2 ? "text-sun" : "text-late";

  return (
    <div className="space-y-12 transition-[opacity,translate] duration-700 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none">
      <div>
        <h1 className="text-3xl leading-snug text-balance">
          {loading ? " " : n === 0 ? (
            <>Hello. You have <span className={tone}>nothing</span> to take care of today.</>
          ) : (
            <>Hello. You have <a href="#todo" className={`${tone} underline decoration-2 underline-offset-4`}>{n} {n === 1 ? "thing" : "things"}</a> to take care of today.</>
          )}
        </h1>
        {!loading && n === 0 && <p className="mt-3 text-lg text-ink/60">New problems and late bills will show up here.</p>}
      </div>

      {n > 0 && (
        <ol id="todo" className="list-decimal divide-y divide-line pl-7 text-xl marker:text-ink/50">
          {tasks.map((t) => (
            <li key={t.key} className="py-4 pl-3">
              <a href={t.href} target="_blank" rel="noopener" className="underline-offset-4 hover:underline">{cap(t.text)}</a>
            </li>
          ))}
        </ol>
      )}

      <DemoTools />
    </div>
  );
}
