"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Card, DemoClock, statusTone, usd, when } from "@/components/money";

export default function InvoicesPage() {
  const invoices = useQuery(api.billing.listInvoices, {});
  const shops = useQuery(api.billing.listShops, {});
  const createDemo = useAction(api.seed.createDemoOrder);
  const pay = useMutation(api.billing.recordPayment);
  const text = useMutation(api.seed.simulateShopText);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr("");
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : String(e)); }
    setBusy("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoices & payments</h1>
        <p className="mt-1 text-sm text-zinc-600">Invoices are created when both sides confirm an order. Short payments make the agent text the shop and open a dispute.</p>
      </div>
      <DemoClock />
      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}

      <Card title="Demo controls" right={busy && <span className="text-xs text-zinc-500">{busy}…</span>}>
        <div className="space-y-3 text-sm">
          {shops?.map((s) => (
            <div key={s._id} className="flex flex-wrap items-center gap-2">
              <span className="w-44 font-medium">{s.name} <span className="text-xs text-zinc-500">({s.language})</span></span>
              <span className="text-xs text-zinc-500">New confirmed order:</span>
              {(["match", "short", "none"] as const).map((p) => (
                <button key={p} disabled={!!busy} onClick={() => run("Creating order", () => createDemo({ shopId: s._id, packing: p }))}
                  className="rounded border px-2 py-1 hover:bg-zinc-50 disabled:opacity-50">
                  {p === "match" ? "packed right" : p === "short" ? "packed short" : "no packing check"}
                </button>
              ))}
              <TextShop disabled={!!busy} onSend={(body) => run("Sending text", () => text({ shopId: s._id, body }))} />
            </div>
          ))}
          {shops?.length === 0 && <p className="text-zinc-500">No shops. Run <code>npx convex run seed:seedDemo</code>.</p>}
        </div>
      </Card>

      <Card title="Invoices">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr><th className="py-1">Order</th><th>Shop</th><th>Amount</th><th>Balance</th><th>Due</th><th>Status</th><th className="text-right">Record payment</th></tr>
          </thead>
          <tbody>
            {invoices?.map((inv) => (
              <tr key={inv._id} className="border-t align-top">
                <td className="py-2 font-mono">{inv.orderRef}</td>
                <td>{inv.shopName}</td>
                <td>{usd(inv.amountCents)}</td>
                <td className="font-medium">{usd(inv.balanceCents)}</td>
                <td>{when(inv.dueAt)}</td>
                <td className="space-x-1">
                  <Badge tone={statusTone[inv.status]}>{inv.status.replace("_", " ")}</Badge>
                  {inv.overdue && <Badge tone="red">overdue</Badge>}
                  {inv.escalated && <Badge tone="red">escalated to owner</Badge>}
                  {inv.status === "disputed" && <Link href="/disputes" className="text-xs underline">view dispute</Link>}
                </td>
                <td className="text-right">
                  {inv.balanceCents > 0 && (
                    <PayBox balance={inv.balanceCents} disabled={!!busy}
                      onPay={(cents) => run("Recording payment", () => pay({ invoiceId: inv._id as Id<"invoices">, amountCents: cents, method: "check" }))} />
                  )}
                  {inv.payments.length > 0 && (
                    <div className="mt-1 text-xs text-zinc-500">paid {inv.payments.map((p) => usd(p.amountCents)).join(" + ")}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices?.length === 0 && <p className="text-sm text-zinc-500">No invoices yet. Use the demo controls above.</p>}
      </Card>
    </div>
  );
}

function PayBox({ balance, onPay, disabled }: { balance: number; onPay: (cents: number) => void; disabled: boolean }) {
  const [amt, setAmt] = useState("");
  return (
    <div className="inline-flex items-center gap-1">
      <button disabled={disabled} onClick={() => onPay(balance)} className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50">Full {usd(balance)}</button>
      <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="$ amount" className="w-20 rounded border px-1 py-1 text-xs" />
      <button disabled={disabled || !amt} onClick={() => { const c = Math.round(parseFloat(amt) * 100); if (c > 0) onPay(c); setAmt(""); }}
        className="rounded border px-2 py-1 text-xs disabled:opacity-50">Pay</button>
    </div>
  );
}

function TextShop({ onSend, disabled }: { onSend: (body: string) => void; disabled: boolean }) {
  const [body, setBody] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Shop texts us… (e.g. missing 2 cases of Dr Pepper)" className="w-80 rounded border px-2 py-1 text-xs" />
      <button disabled={disabled || !body} onClick={() => { onSend(body); setBody(""); }} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Send as shop</button>
    </span>
  );
}
