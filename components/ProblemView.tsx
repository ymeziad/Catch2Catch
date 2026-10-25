"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { celebrate } from "@/components/celebrate";
import { AI, BackButton, Checking, Oops, cleanError, sectionTitle, subTitle, disputeHeadline, recAction, recSentence, shortReason, usd, when } from "@/components/money";
import { t, useTr } from "@/components/i18n";
import { ReadAloud } from "@/components/ReadAloud";

/** One problem, everything about it: the suggestion, the decision, the proof. */
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
  const headlineText = data ? (data.dispute.shopMessage ? disputeHeadline({ ...data.dispute, shopName: data.shop.name }) : data.dispute.summary ?? disputeHeadline({ ...data.dispute, shopName: data.shop.name })) : "";
  const tr = useTr([headlineText, data ? shortReason(data.dispute.reasoning, 4) : ""]);

  if (data === undefined) return <p className="text-ink/60">{t("Loading…")}</p>;
  if (data === null) return <p className="text-ink/60">{t("We couldn’t find this problem.")}</p>;

  const { dispute: d, invoice, order, shop, packing, photos, linePhotos, segments, payments, history, audit } = data;
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
      a.action === "dispute_opened_sms" ? t("{shop} texted about the problem.", { shop: shop.name })
      : a.action === "dispute_opened_short_payment" ? t("{shop} paid less than the bill, so C2C texted them to ask why.", { shop: shop.name })
      : a.action === "dispute_message_added" ? t("{shop} sent another text.", { shop: shop.name })
      : a.action === "dispute_recommendation" ? t("The {ai} looked into it and made a suggestion.", { ai: AI })
      : a.action === "auto_approve_rule_applied" ? t("House rules handled it automatically.")
      : a.action === "dispute_rejected" ? t("You said no.")
      : a.action === "dispute_closed_not_about_order" ? t("Closed automatically: the message wasn’t about the order.")
      : a.action.startsWith("dispute_approved_") ? t(a.actor === "owner" ? "You approved it." : "It was carried out.")
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
        <div className="flex items-center justify-between gap-4">
          <BackButton />
          {!thinking && <ReadAloud text={() => [tr(headlineText), `${t("C2C Suggestion:")} ${recSentence(d.recommendation, d.amountCents)}`, tr(shortReason(d.reasoning, 4))].join(" ")} />}
        </div>
        <h1 className="mt-4 text-3xl leading-snug">
          {(() => {
            const text = tr(headlineText);
            const rest = text.startsWith(shop.name) ? text.slice(shop.name.length) : null;
            const link = <a href={`/shops/${shop._id}`} target="_blank" rel="noopener" className="decoration-2 underline-offset-4 hover:underline">{shop.name}</a>;
            return rest !== null ? <>{link}{rest}</> : text;
          })()}
        </h1>
        {/* Bill = neutral navy; Paid = teal (money in); Still owed = rust while anything is owed, teal once it's settled */}
        <dl className="mt-8 grid grid-cols-3 gap-6">
          <div><dt className="text-base text-ink/50">{t("Bill")}</dt><dd className="text-2xl text-ink">{usd(invoice.amountCents)}</dd></div>
          <div><dt className="text-base text-ink/50">{t("Paid")}</dt><dd className={`text-2xl ${paid > 0 ? "text-teal" : "text-ink/35"}`}>{usd(paid)}</dd></div>
          <div><dt className="text-base text-ink/50">{t("Still owed")}</dt><dd className={`text-2xl ${invoice.balanceCents > 0 ? "text-late" : "text-teal"}`}>{usd(invoice.balanceCents)}</dd></div>
        </dl>
      </header>

      {/* Suggestion + decision */}
      <section>
        <h2 className={h2}>{t("C2C Suggestion:")}</h2>
        {thinking ? (
          <div className="mt-3"><Checking>{t("The {ai} is checking the call, the packing scan, and the payments…", { ai: AI })}</Checking></div>
        ) : (
          <>
            <p className="mt-3 text-xl">{recSentence(d.recommendation, d.amountCents)}</p>
            <p className="mt-3 max-w-3xl leading-relaxed text-ink/70">{tr(shortReason(d.reasoning, 4))}</p>
            {!pending && (
              <p className="mt-4 text-ink/60">
                {d.decidedBy === data.autoRule
                  ? t("This was handled automatically: it was a small amount, the shop has a clean record, and the packing scan proves it. A fixed rule made the call, not the AI.")
                  : d.decidedBy === "rule:not_about_the_order" ? t("This message wasn’t about the order, so it was closed automatically and the shop was asked what was actually wrong.")
                  : d.status === "rejected" ? t("You said no on {date}.", { date: when(d.decidedAt) }) : t("You approved this on {date}.", { date: when(d.decidedAt) })}
              </p>
            )}
          </>
        )}

        {pending && !thinking && !chooseOther && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!unsure && <button disabled={busy} onClick={() => act(true)} className="btn bg-go px-4 py-2 text-base text-white">{recAction(d.recommendation, d.amountCents)}</button>}
            <button onClick={() => setChooseOther(true)} className={`btn px-4 py-2 text-base ${unsure ? "bg-ink text-white" : "bg-white"}`}>{t(unsure ? "Decide" : "Do something else")}</button>
            {!unsure && <button disabled={busy} onClick={() => act(false)} className="px-2 text-base text-ink/60 hover:text-ink">{t("No, leave it")}</button>}
          </div>
        )}

        {pending && chooseOther && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {([["credit", "Take money off (bill not paid yet)"], ["cash_refund", "Refund (bill already paid)"], ["replacement", "Send it again"], ["reject_with_evidence", "Tell them no"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setOutcome(k)} className={`rounded-lg px-4 py-2 text-base ${outcome === k ? "bg-go text-white" : "bg-mist hover:bg-ink/10"}`}>{t(label)}</button>
              ))}
            </div>
            {(outcome === "credit" || outcome === "cash_refund") && (
              <label className="flex items-center gap-2">{t("How much?")} $
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={d.amountCents ? (d.amountCents / 100).toFixed(2) : "0.00"} className="w-28 rounded-lg bg-mist px-3 py-2" />
              </label>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Add a note (optional)")} className="w-full rounded-lg bg-mist px-3 py-2" />
            <div className="flex items-center gap-3">
              <button disabled={busy} onClick={() => act(true, true)} className="btn bg-go px-4 py-2 text-base text-white">{t("Confirm")}</button>
              <button onClick={() => setChooseOther(false)} className="px-2 text-base text-ink/60 hover:text-ink">{t("Cancel")}</button>
            </div>
          </div>
        )}
        <div className="mt-4"><Oops msg={err} /></div>
      </section>

      {/* Ordered vs packed */}
      <section>
        <h2 className={h2}>{t("What they ordered and what we packed")}</h2>
        <table className="mt-4 w-full">
          <thead className="text-left text-base text-ink/50"><tr><th className="pb-2 font-normal">{t("Item")}</th><th className="pb-2 text-right font-normal">{t("Ordered")}</th><th className="pb-2 text-right font-normal">{t("Packed")}</th></tr></thead>
          <tbody>
            {order.lines.map((l) => {
              const scanned = latestPack ? latestPack.scans.filter((s) => s.sku === l.sku).reduce((s, x) => s + x.qty, 0) : undefined;
              const off = scanned !== undefined && scanned !== l.qty;
              return (
                <tr key={l.sku} className={off ? "bg-red-50" : claimed.has(l.sku) ? "bg-late/10" : ""}>
                  <td className="py-2.5 pl-2 pr-2">{l.description}</td>
                  <td className="py-2.5 text-right">{l.qty}</td>
                  <td className={`py-2.5 pr-2 text-right ${off ? "font-semibold text-red-700" : ""}`}>
                    {scanned ?? t("Not scanned")}
                    {off && scanned !== undefined && <span className="ml-2 text-base font-normal">({t(scanned < l.qty ? "{n} missing" : "{n} extra", { n: Math.abs(l.qty - scanned) })})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Everything else, one column */}
      <section>
        <h2 className={h2}>{t("Details")}</h2>

        <div className="mt-8 space-y-10">
          <div>
            <h3 className={h3}>{t("The phone call")}</h3>
            {/* Laid out like a text chat: the shop on the left, you on the right. */}
            <div className="mt-4 flex flex-col gap-3">
              {segments.length === 0 && <p className="text-ink/60">{t("There’s no recording for this order.")}</p>}
              {segments.map((s) => {
                const mine = s.role === "seller";
                return (
                  <div key={s._id} className={`flex max-w-[80%] flex-col ${mine ? "self-end items-end" : "self-start items-start"}`}>
                    <span className="mb-1 px-1 text-sm text-teal">{mine ? t("You") : shop.contactName || shop.name}</span>
                    <p className={`rounded-2xl px-4 py-2.5 text-base leading-relaxed ${mine ? "rounded-br-md bg-sun/15 text-ink" : "rounded-bl-md bg-white text-ink ring-1 ring-line"} ${refIds.has(s._id) ? "!ring-2 !ring-sun/60" : ""}`}>
                      {s.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className={h3}>{t("The packing scan")}</h3>
            <p className="mt-2 text-ink/70">
              {latestPack ? t("Scanned by {name} on {date}.", { name: latestPack.packerName, date: when(latestPack.checkedAt) }) : t("Nobody scanned the boxes for this order.")}
            </p>
            {linePhotos.length > 0 ? (
              // One photo per item, labeled with what it should show ("Dr Pepper 12 oz can × 5").
              <div className="mt-4 flex flex-wrap gap-4">
                {linePhotos.map((p) => {
                  const line = order.lines.find((l) => l.sku === p.sku);
                  return (
                    <a key={p.url} href={p.url} target="_blank" rel="noopener" className="w-32">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={t("Photo of {name}", { name: line?.description ?? p.sku })} className={`h-32 w-32 rounded-lg object-cover ring-1 ${claimed.has(p.sku) ? "ring-2 ring-sun" : "ring-line"}`} />
                      <span className="mt-1 block text-sm leading-snug text-ink/60">{line?.description ?? p.sku} × {line?.qty ?? "?"}</span>
                    </a>
                  );
                })}
              </div>
            ) : photos.length > 0 && (
              <div className="mt-4 flex gap-3">
                {photos.map((p, i) => p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={p.url} alt={t("Photo of the packed box")} className="h-28 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className={h3}>{t("{shop}’s record", { shop: shop.name })}</h3>
            <p className="mt-2 text-ink/70">
              {history.length === 0 ? t("No other problems in the last 3 months.") : history.length === 1 ? t("1 other problem in the last 3 months.") : t("{n} other problems in the last 3 months.", { n: history.length })}
              {" "}{t("Problems up to {amount} are fixed automatically when the proof is clear and the shop has a clean record.", { amount: usd(shop.autoApproveLimitCents) })}
            </p>
          </div>

          <div>
            <h3 className={h3}>{t("History")}</h3>
            <ul className="mt-3 space-y-2">
              {historyLines.map((h, i) => (
                <li key={i} className="grid gap-x-6 sm:grid-cols-[9rem_1fr]">
                  <span className="whitespace-nowrap text-base text-ink/50">{when(h.at)}</span>
                  <span className="text-ink/80">{h.text}</span>
                </li>
              ))}
            </ul>
            {pending && <button onClick={() => reanalyze({ disputeId })} className="mt-4 text-base text-teal hover:underline underline-offset-4">{t("Ask the {ai} to check again", { ai: AI })}</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
