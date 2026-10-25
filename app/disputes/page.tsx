"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { PageHeader, SectionTitle, cap, disputeHeadline, usd, when } from "@/components/money";

/** Every problem, newest first. Each opens its own page. */
export default function DisputesPage() {
  const disputes = useQuery(api.disputes.list, {});
  const open = (disputes ?? []).filter((d) => d.status === "open" || d.status === "awaiting_approval");
  const closed = (disputes ?? []).filter((d) => !(d.status === "open" || d.status === "awaiting_approval"));

  return (
    <div className="space-y-12">
      <PageHeader title="Problems" />
      <section>
        <SectionTitle>Waiting on you</SectionTitle>
        {disputes !== undefined && open.length === 0 && <p className="mt-4 text-lg text-ink/60">Nothing is waiting on you.</p>}
        <List rows={open} />
      </section>
      {closed.length > 0 && (
        <section>
          <SectionTitle>Sorted out</SectionTitle>
          <List rows={closed} muted />
        </section>
      )}
    </div>
  );
}

function List({ rows, muted = false }: { rows: FunctionReturnType<typeof api.disputes.list>; muted?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-4 divide-y divide-line text-lg">
      {rows.map((d) => (
        <li key={d._id}>
          <Link href={`/disputes/${d._id}`} className="group grid items-baseline gap-x-6 gap-y-1 py-4 sm:grid-cols-[9rem_1fr_6rem]">
            <span className="whitespace-nowrap text-base text-ink/50">{when(d.decidedAt ?? d._creationTime)}</span>
            <span className={`underline-offset-4 group-hover:underline ${muted ? "text-ink/70" : ""}`}>{cap(d.summary ?? disputeHeadline(d))}</span>
            <span className="text-base text-ink/60 sm:text-right">{d.amountCents ? usd(d.amountCents) : ""}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
