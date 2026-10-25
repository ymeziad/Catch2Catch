"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Card, usd, when } from "@/components/money";

const names: Record<string, string> = { cash: "Cash", accounts_receivable: "Accounts receivable", sales: "Sales", sales_returns: "Sales returns" };

export default function LedgerPage() {
  const tb = useQuery(api.ledger.trialBalance, {});
  const journal = useQuery(api.ledger.journal, { limit: 60 });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ledger</h1>
        <p className="mt-1 text-sm text-zinc-600">Double-entry books. Every money event posts balanced debits and credits. Cash refunds are simulated: the entry is real, no money moves.</p>
      </div>

      <Card title="Trial balance" right={tb && (tb.balanced ? <Badge tone="green">Balanced ✓</Badge> : <Badge tone="red">OUT OF BALANCE</Badge>)}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500"><tr><th className="py-1">Account</th><th className="text-right">Debits</th><th className="text-right">Credits</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            {tb?.accounts.map((a) => (
              <tr key={a.account} className="border-t">
                <td className="py-1">{names[a.account]}</td>
                <td className="text-right">{usd(a.debitCents)}</td>
                <td className="text-right">{usd(a.creditCents)}</td>
                <td className="text-right font-medium">{usd(a.balanceCents)}</td>
              </tr>
            ))}
            {tb && (
              <tr className="border-t-2 font-semibold">
                <td className="py-1">Total</td>
                <td className="text-right">{usd(tb.totalDebits)}</td>
                <td className="text-right">{usd(tb.totalCredits)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Journal">
        <ul className="space-y-3 text-sm">
          {journal?.length === 0 && <li className="text-zinc-500">No entries yet.</li>}
          {journal?.map((g) => (
            <li key={g.entryGroupId} className="border-t pt-2 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>{when(g.date)}</span><Badge>{g.refType}</Badge><span className="text-zinc-800">{g.memo}</span>
              </div>
              <table className="mt-1 w-full font-mono text-xs">
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l._id}>
                      <td className={l.creditCents ? "pl-8" : ""}>{l.debitCents ? "Dr" : "Cr"} {names[l.account]}</td>
                      <td className="w-28 text-right">{l.debitCents ? usd(l.debitCents) : ""}</td>
                      <td className="w-28 text-right">{l.creditCents ? usd(l.creditCents) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
