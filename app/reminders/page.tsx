"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DemoTools, PageHeader, SectionTitle, statusWord, when } from "@/components/money";

/** Reminders the C2C AI Assistant sent or will send. */
const kindText: Record<string, (shop: string) => string> = {
  order_unconfirmed: (s) => `Ask ${s} to confirm their order`,
  payment_due_soon: (s) => `Remind ${s} that payment is coming up`,
  payment_due: (s) => `Remind ${s} that payment is due today`,
  payment_late: (s) => `Tell ${s} their payment is late`,
  escalate_owner: (s) => `Let you know ${s} still hasn't paid`,
};

export default function RemindersPage() {
  const rows = useQuery(api.reminders.timeline, { limit: 150 });
  const upcoming = (rows ?? []).filter((r) => r.status === "scheduled");
  const done = (rows ?? []).filter((r) => r.status !== "scheduled").reverse();

  const Row = ({ r, showStatus = true }: { r: NonNullable<typeof rows>[number]; showStatus?: boolean }) => (
    <li className={`grid items-baseline gap-x-6 gap-y-1 py-4 sm:grid-cols-[9rem_1fr_6rem] ${r.status === "cancelled" ? "text-ink/45" : ""}`}>
      <span className="whitespace-nowrap text-base text-ink/50">{when(r.scheduledFor)}</span>
      <span>{kindText[r.kind](r.shopName ?? "the shop")}</span>
      {showStatus && <span className={`text-base sm:text-right ${r.status === "sent" ? (r.kind === "escalate_owner" ? "text-wait" : "text-teal") : "text-ink/50"}`}>{cap1(statusWord[r.status])}</span>}
    </li>
  );

  return (
    <div className="space-y-12">
      <PageHeader title="Reminders" />
      <section>
        <SectionTitle>Coming up</SectionTitle>
        {rows !== undefined && upcoming.length === 0 && <p className="mt-4 text-lg text-ink/60">No reminders are scheduled.</p>}
        <ul className="mt-4 divide-y divide-line text-lg">{upcoming.map((r) => <Row key={r._id} r={r} showStatus={false} />)}</ul>
      </section>
      {done.length > 0 && (
        <section>
          <SectionTitle>Already handled</SectionTitle>
          <ul className="mt-4 divide-y divide-line text-lg">{done.map((r) => <Row key={r._id} r={r} />)}</ul>
        </section>
      )}
      <DemoTools />
    </div>
  );
}

function cap1(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
