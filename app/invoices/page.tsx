"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { celebrate } from "@/components/celebrate";
import { DemoTools, GotPaid, Oops, PageHeader, SectionTitle, cleanError, dueText, usd } from "@/components/money";

/** OWNER: Amaan. Bills: who owes what, and a "Got paid" button. */
// Fixed column widths (inline, so they never depend on CSS being rebuilt) keep amounts and buttons lined up.
const AMOUNT_W = "8rem";
const ACTION_W = "19rem";
export default function InvoicesPage() {
  const invoices = useQuery(api.billing.listInvoices, {});
  const clock = useQuery(api.reminders.clock, {});
  const pay = useMutation(api.billing.recordPayment);
  const [err, setErr] = useState("");
  const now = clock?.demoNow ?? 0;
  const unpaid = (invoices ?? []).filter((i) => i.balanceCents > 0);
  const paid = (invoices ?? []).filter((i) => i.balanceCents === 0);

  return (
    <div className="space-y-12">
      <PageHeader title="Bills" />
      <Oops msg={err} />

      <section>
        <SectionTitle>Not paid yet</SectionTitle>
        {invoices !== undefined && unpaid.length === 0 && <p className="mt-4 text-lg text-ink/60">Everyone is paid up.</p>}
        <ul className="mt-4 divide-y divide-line text-lg">
          {unpaid.map((inv) => {
            const due = dueText(inv.dueAt, now);
            const onHold = inv.status === "disputed";
            return (
              <li key={inv._id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
                <div className="min-w-0 flex-1">
                  <a href={`/shops/${inv.shopId}`} target="_blank" rel="noopener" className="underline-offset-4 hover:underline">{inv.shopName}</a>
                  <div className={`text-base ${onHold ? "text-wait" : due.late ? "text-late" : "text-ink/60"}`}>
                    {onHold ? <Link href="/disputes" className="underline-offset-4 hover:underline">On hold because of a problem</Link> : due.late ? `${due.text.charAt(0).toUpperCase()}${due.text.slice(1)}` : `Due ${due.text.replace(/^due /, "")}`}
                  </div>
                </div>
                <div className="shrink-0 text-right" style={{ width: AMOUNT_W }}>{usd(inv.balanceCents)}</div>
                <div className="flex shrink-0 justify-end" style={{ width: ACTION_W }}>
                  {!onHold && (
                    <GotPaid balance={inv.balanceCents} onPay={async (c) => {
                      setErr("");
                      try {
                        const r = await pay({ invoiceId: inv._id as Id<"invoices">, amountCents: c, method: "check" });
                        if (r.status === "paid") celebrate(); // bill fully paid: task done
                      } catch (e) { setErr(cleanError(e)); }
                    }} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {paid.length > 0 && (
        <section>
          <SectionTitle>Paid</SectionTitle>
          <ul className="mt-4 divide-y divide-line text-lg">
            {paid.map((inv) => (
              <li key={inv._id} className="flex flex-wrap items-center gap-x-6 py-4">
                <a href={`/shops/${inv.shopId}`} target="_blank" rel="noopener" className="min-w-0 flex-1 text-ink/80 underline-offset-4 hover:underline">{inv.shopName}</a>
                <span className="shrink-0 text-right text-ink/70" style={{ width: AMOUNT_W }}>{usd(inv.amountCents)}</span>
                <span className="shrink-0 text-right text-base text-teal" style={{ width: ACTION_W }}>{inv.status === "credited" ? "Settled" : "Paid"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DemoTools />
    </div>
  );
}
