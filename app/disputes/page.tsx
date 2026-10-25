"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Card, statusTone, usd, when } from "@/components/money";

const recLabel: Record<string, string> = {
  credit: "Credit the shop",
  cash_refund: "Cash refund (simulated)",
  replacement: "Send replacement",
  reject_with_evidence: "Reject with evidence",
  escalate: "Escalate to owner",
};
const recTone: Record<string, "green" | "violet" | "blue" | "red" | "amber"> = {
  credit: "violet", cash_refund: "violet", replacement: "blue", reject_with_evidence: "red", escalate: "amber",
};

export default function DisputesPage() {
  const disputes = useQuery(api.disputes.list, {});
  const [picked, setSelected] = useState<Id<"disputes"> | null>(null);
  const selected = picked ?? disputes?.[0]?._id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Disputes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          The agent recommends with evidence. The owner decides. Code enforces the limits: the agent never approves its own recommendation.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <ul className="space-y-2">
          {disputes === undefined && <li className="text-sm text-zinc-500">Loading…</li>}
          {disputes?.length === 0 && <li className="text-sm text-zinc-500">No disputes yet. Record a short payment or have a shop text a complaint on the Invoices page.</li>}
          {disputes?.map((d) => (
            <li key={d._id}>
              <button onClick={() => setSelected(d._id)}
                className={`w-full rounded-lg border p-3 text-left text-sm ${selected === d._id ? "border-zinc-900 bg-white" : "bg-white/60 hover:bg-white"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.shopName}</span>
                  <Badge tone={statusTone[d.status]}>{d.status.replace("_", " ")}</Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-500">Order {d.orderRef} · {d.recommendation ? recLabel[d.recommendation] : "analyzing…"}{d.amountCents ? ` · ${usd(d.amountCents)}` : ""}</div>
              </button>
            </li>
          ))}
        </ul>
        {selected ? <DisputeDetail id={selected} /> : <div />}
      </div>
    </div>
  );
}

function DisputeDetail({ id }: { id: Id<"disputes"> }) {
  const data = useQuery(api.disputes.detail, { disputeId: id });
  const decide = useMutation(api.disputes.decide);
  const reanalyze = useMutation(api.disputes.reanalyze);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState<"" | "credit" | "cash_refund" | "replacement" | "reject_with_evidence">("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");

  if (data === undefined) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (data === null) return <div className="text-sm text-zinc-500">Not found.</div>;
  const { dispute: d, invoice, order, shop, packing, photos, segments, payments, history, audit } = data;
  const pending = d.status === "open" || d.status === "awaiting_approval";
  const analyzing = d.status === "open" && !d.recommendation;
  const latestPack = [...packing].sort((a, b) => b.checkedAt - a.checkedAt)[0];
  const claimedSkus = new Set(d.claimedItems.map((c) => c.sku));
  const refIds = new Set(d.evidenceRefs.map((r) => r.id));

  async function act(approve: boolean) {
    setErr("");
    try {
      await decide({
        disputeId: id, approve, note: note || undefined,
        outcome: override || undefined,
        amountCents: amount ? Math.round(parseFloat(amount) * 100) : undefined,
      });
      setNote(""); setOverride(""); setAmount("");
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : String(e));
    }
  }

  return (
    <div className="space-y-4">
      {/* The recommendation */}
      <Card
        title={<span>{shop.name} · order {data.orderRef}</span>}
        right={<Badge tone={statusTone[d.status]}>{d.status.replace("_", " ")}</Badge>}
      >
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div><div className="text-xs text-zinc-500">Invoice</div><div>{usd(invoice.amountCents)} · balance <b>{usd(invoice.balanceCents)}</b></div></div>
          <div><div className="text-xs text-zinc-500">Paid</div><div>{payments.length ? payments.map((p) => usd(p.amountCents)).join(" + ") : "nothing yet"}</div></div>
          <div><div className="text-xs text-zinc-500">Opened by</div><div>{d.requestedBy === "agent" ? "Agent (short payment)" : "Shop text"}</div></div>
        </div>
        <div className="mt-3 rounded bg-zinc-50 p-3 text-sm">
          <div className="text-xs text-zinc-500">What the shop said</div>
          <div className="mt-1 whitespace-pre-wrap">{d.shopMessage || <i className="text-zinc-500">No message yet. The agent texted them to ask.</i>}</div>
        </div>

        <div className="mt-4 rounded-lg border-2 border-zinc-900 p-4">
          {analyzing ? (
            <div className="text-sm text-zinc-500">Claude is reviewing the order, transcript, packing scan and payment history…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-zinc-500">Agent recommends</span>
                {d.recommendation && <Badge tone={recTone[d.recommendation]}>{recLabel[d.recommendation]}</Badge>}
                {d.amountCents > 0 && <span className="text-lg font-semibold">{usd(d.amountCents)}</span>}
              </div>
              {d.claimedItems.length > 0 && (
                <div className="mt-2 text-sm">Claimed: {d.claimedItems.map((c) => `${c.qty} × ${order.lines.find((l) => l.sku === c.sku)?.description ?? c.sku} (${c.reason})`).join("; ")}</div>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{d.reasoning}</p>
              {d.evidenceRefs.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs">
                  {d.evidenceRefs.map((r, i) => (
                    <li key={i} className="flex gap-2"><Badge>{r.type.replace("_", " ")}</Badge><span className="text-zinc-700">{r.detail}</span></li>
                  ))}
                </ul>
              )}
              {d.decidedBy && (
                <div className="mt-3 text-xs text-zinc-500">Decided by <b>{d.decidedBy === data.autoRule ? `${d.decidedBy} (code rule, not the model)` : d.decidedBy}</b> · {when(d.decidedAt)}</div>
              )}
            </>
          )}
        </div>

        {pending && !analyzing && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select value={override} onChange={(e) => setOverride(e.target.value as typeof override)} className="rounded border px-2 py-1">
                <option value="">{d.recommendation === "escalate" ? "Pick an outcome…" : "Use recommendation"}</option>
                <option value="credit">Credit</option>
                <option value="cash_refund">Cash refund (simulated)</option>
                <option value="replacement">Replacement</option>
                <option value="reject_with_evidence">Reject with evidence</option>
              </select>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={d.amountCents ? (d.amountCents / 100).toFixed(2) : "$ amount"} className="w-24 rounded border px-2 py-1" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="min-w-40 flex-1 rounded border px-2 py-1" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => act(true)} className="rounded bg-zinc-900 px-4 py-2 text-white">Approve</button>
              <button onClick={() => act(false)} className="rounded border px-4 py-2">Reject recommendation</button>
              <button onClick={() => reanalyze({ disputeId: id })} className="ml-auto rounded px-3 py-2 text-zinc-500 hover:text-zinc-900">Re-analyze</button>
            </div>
            {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">{err}</div>}
          </div>
        )}
      </Card>

      {/* Evidence */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Order vs. packing scan">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500"><tr><th>Item</th><th>Ordered</th><th>Scanned</th><th>Price</th></tr></thead>
            <tbody>
              {order.lines.map((l) => {
                const scanned = latestPack ? latestPack.scans.filter((s) => s.sku === l.sku).reduce((s, x) => s + x.qty, 0) : undefined;
                const off = scanned !== undefined && scanned !== l.qty;
                return (
                  <tr key={l.sku} className={`border-t ${claimedSkus.has(l.sku) ? "bg-amber-50" : ""}`}>
                    <td className="py-1">{l.description}</td>
                    <td>{l.qty} {l.unit}</td>
                    <td className={off ? "font-semibold text-red-700" : ""}>{scanned ?? "—"}</td>
                    <td>{usd(l.unitPriceCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-zinc-500">
            {latestPack ? <>Packed by {latestPack.packerName} at {when(latestPack.checkedAt)} · result <b>{latestPack.result}</b>{latestPack.overrideBy ? ` (override by ${latestPack.overrideBy}: ${latestPack.overrideReason})` : ""}</> : "No packing check on file."}
          </div>
          {photos.length > 0 && (
            <div className="mt-3 flex gap-2">
              {photos.map((p, i) => p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p.url} alt="Packed box" className="h-24 rounded border object-cover" />
              ))}
            </div>
          )}
        </Card>

        <Card title="Call transcript">
          <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {segments.length === 0 && <div className="text-zinc-500">No transcript.</div>}
            {segments.map((s) => (
              <div key={s._id} className={`rounded px-2 py-1 ${refIds.has(s._id) ? "bg-yellow-100" : ""}`}>
                <span className={`mr-2 text-xs font-semibold uppercase ${s.role === "buyer" ? "text-blue-700" : "text-green-700"}`}>{s.role}</span>
                {s.text}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Shop history (90 days)">
          <div className="text-sm">
            {history.length === 0 ? "No other disputes." : history.map((h) => (
              <div key={h._id} className="border-t py-1 first:border-0">{h.recommendation ?? "?"} · {h.status} · “{h.shopMessage.slice(0, 60)}”</div>
            ))}
          </div>
          <div className="mt-2 text-xs text-zinc-500">Auto-approve limit: {usd(shop.autoApproveLimitCents)} · terms {shop.paymentTermsDays} days</div>
        </Card>
        <Card title="Decision log">
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {audit.sort((a, b) => a.at - b.at).map((a) => (
              <li key={a._id}><span className="text-zinc-500">{when(a.at)}</span> <b>{a.actor}</b> {a.action.replace(/_/g, " ")}: {a.reason}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
