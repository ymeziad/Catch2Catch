"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { celebrate } from "@/components/celebrate";
import { AI, BackButton, Checking, Oops, cleanError, sectionTitle, subTitle, disputeHeadline, recAction, recSentence, shortReason, usd, when } from "@/components/money";

/** OWNER: Amaan. One problem, everything about it: the suggestion, the decision, the proof. */
export function ProblemView() {
  const { id } = useParams<{ id: string }>();
  const disputeId = id as Id<"disputes">;
  const data = useQuery(api.disputes.detail, { disputeId });
  const decide = useMutation(api.disputes.decide);
  const reanalyze = useMutation(api.disputes.reanalyze);
  const [chooseOther, setChooseOther] = useState(false);
  const [outcome, setOutcome] = useState<"credit" | "cash_refund" | "replacement" | "reject_with_evidence">("credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (data === undefined) return <p className="text-ink/60">Loading…</p>;
  if (data === null) return <p className="text-ink/60">We couldn&apos;t find this problem.</p>;

  const { dispute: d, invoice, order, shop, packing, photos, segments, payments, history, audit } = data;
  const pending = d.status === "open" || d.status === "awaiting_approval";
  const thinking = d.status === "open" && !d.recommendation;
  const unsure = d.recommendation === "escalate";
  const paid = payments.reduce((s, p) => s + p.amountCents, 0);
  const latestPack = [...packing].sort((a, b) => b.checkedAt - a.checkedAt)[0];
  const claimed = new Set(d.claimedItems.map((c) => c.sku));
  const refIds = new Set(d.evidenceRefs.map((r) => r.id));

  async function act(approve: boolean, custom = false) {
    setErr(""); setBusy(true);
    try {
      await decide({
        disputeId, approve, note: note || undefined,
        outcome: custom ? outcome : undefined,
        amountCents: custom && amount ? Math.round(parseFloat(amount) * 100) : undefined,
      });
      setChooseOther(false); setAmount(""); setNote("");
      celebrate(); // task done
    } catch (e) { setErr(cleanError(e)); }
    setBusy(false);
  }

  // Plain-English history of this problem (no ids, cents or model names).
  const historyLines: { at: number; text: string }[] = [];
  for (const a of [...audit].sort((x, y) => x.at - y.at)) {
    const text =
      a.action === "dispute_opened_sms" ? `${shop.name} texted about the problem.`
      : a.action === "dispute_opened_short_payment" ? `${shop.name} paid less than the bill, so C2C texted them to ask why.`
      : a.action === "dispute_message_added" ? `${shop.name} sent another text.`
      : a.action === "dispute_recommendation" ? `The ${AI} looked into it and made a suggestion.`
      : a.action === "auto_approve_rule_applied" ? "House rules handled it automatically."
      : a.action === "dispute_rejected" ? "You said no."
      : a.action === "dispute_closed_not_about_order" ? "Closed automatically: the message wasn't about the order."
      : a.action.startsWith("dispute_approved_") ? (a.actor === "owner" ? "You approved it." : "It was carried out.")
      : null;
    if (text && historyLines[historyLines.length - 1]?.text !== text) historyLines.push({ at: a.at, text });
  }

  // One heading style for every section on this page: same size, same weight, same underline.
  const h2 = sectionTitle;
  const h3 = subTitle; // sub-headings under Details: smaller, no underline

  return (
    <div className="space-y-12 text-lg">
      {/* Header */}
      <header>
        <BackButton />
        <h1 className="mt-4 text-3xl leading-snug">
          {(() => {
            const text = d.shopMessage ? disputeHeadline({ ...d, shopName: shop.name }) : d.summary ?? disputeHeadline({ ...d, shopName: shop.name });
            const rest = text.startsWith(shop.name) ? text.slice(shop.name.length) : null;
            const link = <a href={`/shops/${shop._id}`} target="_blank" rel="noopener" className="decoration-2 underline-offset-4 hover:underline">{shop.name}</a>;
            return rest !== null ? <>{link}{rest}</> : text;
          })()}
        </h1>
        {/* Bill = neutral navy; Paid = teal (money in); Still owed = rust while anything is owed, teal once it's settled */}
        <dl className="mt-8 grid grid-cols-3 gap-6">
          <div><dt className="text-base text-ink/50">Bill</dt><dd className="text-2xl text-ink">{usd(invoice.amountCents)}</dd></div>
          <div><dt className="text-base text-ink/50">Paid</dt><dd className={`text-2xl ${paid > 0 ? "text-teal" : "text-ink/35"}`}>{usd(paid)}</dd></div>
          <div><dt className="text-base text-ink/50">Still owed</dt><dd className={`text-2xl ${invoice.balanceCents > 0 ? "text-late" : "text-teal"}`}>{usd(invoice.balanceCents)}</dd></div>
        </dl>
      </header>

      {/* Suggestion + decision */}
      <section>
        <h2 className={h2}>C2C Suggestion:</h2>
        {thinking ? (
          <div className="mt-3"><Checking>The {AI} is checking the call, the packing scan, and the payments…</Checking></div>
        ) : (
          <>
            <p className="mt-3 text-xl">{recSentence(d.recommendation, d.amountCents)}</p>
            <p className="mt-3 max-w-3xl leading-relaxed text-ink/70">{shortReason(d.reasoning, 4)}</p>
            {!pending && (
              <p className="mt-4 text-ink/60">
                {d.decidedBy === data.autoRule
                  ? "This was handled automatically: it was a small amount, the shop has a clean record, and the packing scan proves it. A fixed rule made the call, not the AI."
                  : d.decidedBy === "rule:not_about_the_order" ? "This message wasn't about the order, so it was closed automatically and the shop was asked what was actually wrong."
                  : d.status === "rejected" ? `You said no on ${when(d.decidedAt)}.` : `You approved this on ${when(d.decidedAt)}.`}
              </p>
            )}
          </>
        )}

        {pending && !thinking && !chooseOther && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!unsure && <button disabled={busy} onClick={() => act(true)} className="btn bg-go px-4 py-2 text-base text-white">{recAction(d.recommendation, d.amountCents)}</button>}
            <button onClick={() => setChooseOther(true)} className={`btn px-4 py-2 text-base ${unsure ? "bg-ink text-white" : "bg-white"}`}>{unsure ? "Decide" : "Do something else"}</button>
            {!unsure && <button disabled={busy} onClick={() => act(false)} className="px-2 text-base text-ink/60 hover:text-ink">No, leave it</button>}
          </div>
        )}

        {pending && chooseOther && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {([["credit", "Take money off (bill not paid yet)"], ["cash_refund", "Refund (bill already paid)"], ["replacement", "Send it again"], ["reject_with_evidence", "Tell them no"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setOutcome(k)} className={`rounded-lg px-4 py-2 text-base ${outcome === k ? "bg-go text-white" : "bg-mist hover:bg-ink/10"}`}>{label}</button>
              ))}
            </div>
            {(outcome === "credit" || outcome === "cash_refund") && (
              <label className="flex items-center gap-2">How much? $
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={d.amountCents ? (d.amountCents / 100).toFixed(2) : "0.00"} className="w-28 rounded-lg bg-mist px-3 py-2" />
              </label>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" className="w-full rounded-lg bg-mist px-3 py-2" />
            <div className="flex items-center gap-3">
              <button disabled={busy} onClick={() => act(true, true)} className="btn bg-go px-4 py-2 text-base text-white">Confirm</button>
              <button onClick={() => setChooseOther(false)} className="px-2 text-base text-ink/60 hover:text-ink">Cancel</button>
            </div>
          </div>
        )}
        <div className="mt-4"><Oops msg={err} /></div>
      </section>

      {/* Ordered vs packed */}
      <section>
        <h2 className={h2}>What they ordered and what we packed</h2>
        <table className="mt-4 w-full">
          <thead className="text-left text-base text-ink/50"><tr><th className="pb-2 font-normal">Item</th><th className="pb-2 text-right font-normal">Ordered</th><th className="pb-2 text-right font-normal">Packed</th></tr></thead>
          <tbody>
            {order.lines.map((l) => {
              const scanned = latestPack ? latestPack.scans.filter((s) => s.sku === l.sku).reduce((s, x) => s + x.qty, 0) : undefined;
              const off = scanned !== undefined && scanned !== l.qty;
              return (
                <tr key={l.sku} className={off ? "bg-red-50" : claimed.has(l.sku) ? "bg-late/10" : ""}>
                  <td className="py-2.5 pl-2 pr-2">{l.description}</td>
                  <td className="py-2.5 text-right">{l.qty}</td>
                  <td className={`py-2.5 pr-2 text-right ${off ? "font-semibold text-red-700" : ""}`}>
                    {scanned ?? "Not scanned"}
                    {off && scanned !== undefined && <span className="ml-2 text-base font-normal">({Math.abs(l.qty - scanned)} {scanned < l.qty ? "missing" : "extra"})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Everything else, one column */}
      <section>
        <h2 className={h2}>Details</h2>

        <div className="mt-8 space-y-10">
          <div>
            <h3 className={h3}>The phone call</h3>
            {/* Laid out like a text chat: the shop on the left, you on the right. */}
            <div className="mt-4 flex flex-col gap-3">
              {segments.length === 0 && <p className="text-ink/60">There&apos;s no recording for this order.</p>}
              {segments.map((s) => {
                const mine = s.role === "seller";
                return (
                  <div key={s._id} className={`flex max-w-[80%] flex-col ${mine ? "self-end items-end" : "self-start items-start"}`}>
                    <span className="mb-1 px-1 text-sm text-teal">{mine ? "You" : shop.contactName || shop.name}</span>
                    <p className={`rounded-2xl px-4 py-2.5 text-base leading-relaxed ${mine ? "rounded-br-md bg-sun/15 text-ink" : "rounded-bl-md bg-white text-ink ring-1 ring-line"} ${refIds.has(s._id) ? "!ring-2 !ring-sun/60" : ""}`}>
                      {s.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className={h3}>The packing scan</h3>
            <p className="mt-2 text-ink/70">
              {latestPack ? `Scanned by ${latestPack.packerName} on ${when(latestPack.checkedAt)}.` : "Nobody scanned the boxes for this order."}
            </p>
            {photos.length > 0 && (
              <div className="mt-4 flex gap-3">
                {photos.map((p, i) => p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={p.url} alt="Photo of the packed box" className="h-28 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className={h3}>{shop.name}&apos;s record</h3>
            <p className="mt-2 text-ink/70">
              {history.length === 0 ? "No other problems in the last 3 months." : `${history.length} other ${history.length === 1 ? "problem" : "problems"} in the last 3 months.`}
              {` Problems up to ${usd(shop.autoApproveLimitCents)} are fixed automatically when the proof is clear and the shop has a clean record.`}
            </p>
          </div>

          <div>
            <h3 className={h3}>History</h3>
            <ul className="mt-3 space-y-2">
              {historyLines.map((h, i) => (
                <li key={i} className="grid gap-x-6 sm:grid-cols-[9rem_1fr]">
                  <span className="whitespace-nowrap text-base text-ink/50">{when(h.at)}</span>
                  <span className="text-ink/80">{h.text}</span>
                </li>
              ))}
            </ul>
            {pending && <button onClick={() => reanalyze({ disputeId })} className="mt-4 text-base text-teal hover:underline underline-offset-4">Ask the {AI} to check again</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
