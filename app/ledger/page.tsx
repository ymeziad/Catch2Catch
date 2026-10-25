"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader, SectionTitle, usd, when } from "@/components/money";

/** OWNER: Amaan. The books: every dollar written down twice, so it always adds up. */
const names: Record<string, string> = { cash: "Cash", accounts_receivable: "Owed to you", sales: "Sales", sales_returns: "Taken off bills and refunds" };

export default function LedgerPage() {
  const tb = useQuery(api.ledger.trialBalance, {});
  const journal = useQuery(api.ledger.journal, { limit: 60 });
  return (
    <div className="space-y-12">
      <PageHeader title="Books" />

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <SectionTitle>Does it add up?</SectionTitle>
          {tb && <span className={`text-lg ${tb.balanced ? "text-teal" : "text-late"}`}>{tb.balanced ? "Yes, it adds up." : "No, something is off."}</span>}
        </div>
        <table className="mt-4 w-full text-lg">
          <thead className="text-left text-base text-ink/50">
            <tr><th className="pb-2 font-normal">Account</th><th className="pb-2 text-right font-normal">In</th><th className="pb-2 text-right font-normal">Out</th><th className="pb-2 text-right font-normal">Balance</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tb?.accounts.map((a) => (
              <tr key={a.account}>
                <td className="py-3">{names[a.account]}</td>
                <td className="py-3 text-right">{usd(a.debitCents)}</td>
                <td className="py-3 text-right">{usd(a.creditCents)}</td>
                <td className="py-3 text-right">{usd(a.balanceCents)}</td>
              </tr>
            ))}
            {tb && (
              <tr className="font-semibold">
                <td className="py-3">Total</td>
                <td className="py-3 text-right">{usd(tb.totalDebits)}</td>
                <td className="py-3 text-right">{usd(tb.totalCredits)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <SectionTitle>Every entry</SectionTitle>
        {journal?.length === 0 && <p className="mt-4 text-lg text-ink/60">Nothing has been written down yet.</p>}
        <ul className="mt-4 divide-y divide-line">
          {journal?.map((g) => (
            <li key={g.entryGroupId} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6">
                <span className="text-lg">{g.memo.replace(/^SIMULATED /, "")}</span>
                <span className="whitespace-nowrap text-base text-ink/50">{when(g.date)}</span>
              </div>
              <table className="mt-2 w-full text-base text-ink/70">
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l._id}>
                      <td className={l.creditCents ? "pl-6" : ""}>{names[l.account]}</td>
                      <td className="w-28 text-right">{l.debitCents ? usd(l.debitCents) : ""}</td>
                      <td className="w-28 text-right">{l.creditCents ? usd(l.creditCents) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
