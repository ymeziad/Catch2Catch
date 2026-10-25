import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { DAY, demoNow, shortId, usd } from "./lib/clock";
import { normalizePhone } from "./lib/phone";
import { pair, postEntryGroup } from "./ledger";
import { cancelInvoiceReminders, latePaymentCount, scheduleInvoiceReminders } from "./reminders";

/**
 * OWNER: Person 3. Disputes and refunds — the accounts-receivable clerk's judgment, with limits.
 *
 *  1. A dispute opens from a shop's text (openFromSms) or from a short payment (openDisputeForShortPayment).
 *  2. analyzeDispute gathers evidence and asks Claude for a recommendation with reasons and evidence refs.
 *  3. CODE (never the model) decides what happens next:
 *       - default: "awaiting_approval" — the owner decides;
 *       - narrow auto-approve rule "rule:auto_small_clean": amount <= shop.autoApproveLimitCents AND
 *         the shop has 0 other disputes in the last 90 days AND the packing check supports the claim;
 *       - segregation of duties: the requester (and the agent) can never be the decider.
 *  4. On approval, code posts the ledger entry, updates the invoice and texts the shop.
 *     Cash refunds are SIMULATED: a ledger entry is posted but no real money moves.
 */

export type Recommendation = NonNullable<Doc<"disputes">["recommendation"]>;
const RECOMMENDATIONS: Recommendation[] = ["credit", "cash_refund", "replacement", "reject_with_evidence", "escalate"];
const AUTO_RULE = "rule:auto_small_clean";
const MODEL = "claude-sonnet-5-5";

// --------------------------------------------------------------------------- opening disputes

async function markInvoiceDisputed(ctx: MutationCtx, invoiceId: Id<"invoices">, now: number) {
  await ctx.db.patch(invoiceId, { status: "disputed" });
  await cancelInvoiceReminders(ctx, invoiceId, "a dispute is open", now);
}

/** Short payment with no dispute open: the agent opens one itself (requestedBy "agent"). Called by billing.recordPayment. */
export async function openDisputeForShortPayment(ctx: MutationCtx, invoiceId: Id<"invoices">, shortfallCents: number, now: number) {
  const inv = (await ctx.db.get(invoiceId))!;
  const disputeId = await ctx.db.insert("disputes", {
    invoiceId, orderId: inv.orderId, shopId: inv.shopId,
    shopMessage: "", claimedItems: [], evidenceRefs: [],
    amountCents: shortfallCents, status: "open", requestedBy: "agent",
  });
  await markInvoiceDisputed(ctx, invoiceId, now);
  await ctx.db.insert("auditLog", {
    actor: "agent", action: "dispute_opened_short_payment", entityType: "dispute", entityId: disputeId,
    reason: `Shop paid ${usd(inv.amountCents - shortfallCents)} of ${usd(inv.amountCents)} with no dispute open. Texted the shop to ask what happened and opened a dispute for the ${usd(shortfallCents)} difference.`,
    evidenceRefs: [{ type: "invoice", id: invoiceId, detail: `short by ${usd(shortfallCents)}` }], at: now,
  });
  await ctx.scheduler.runAfter(0, internal.disputes.analyzeDispute, { disputeId });
  return disputeId;
}

/**
 * Contract: internal.disputes.openFromSms({ fromPhone, body }).
 * Yosef's SMS router calls this on DISPUTE or any free-text reply from a shop.
 */
export const openFromSms = internalMutation({
  args: { fromPhone: v.string(), body: v.string() },
  handler: async (ctx, { fromPhone, body }): Promise<Id<"disputes"> | null> => {
    const now = await demoNow(ctx);
    const phone = normalizePhone(fromPhone);
    const shop = await ctx.db.query("shops").withIndex("by_phone", (q) => q.eq("phone", phone)).first();
    if (!shop) {
      await ctx.db.insert("auditLog", { actor: "shop", action: "dispute_sms_unknown_shop", entityType: "phone", entityId: phone, reason: `Dispute text from ${phone}, but no shop has this number. Not opened. Message: "${body.slice(0, 160)}"`, at: now });
      return null;
    }

    // An open dispute for this shop absorbs the new message (e.g. reply to our short-payment text).
    const shopDisputes = await ctx.db.query("disputes").withIndex("by_shopId", (q) => q.eq("shopId", shop._id)).order("desc").take(20);
    const active = shopDisputes.find((d) => d.status === "open" || d.status === "awaiting_approval");
    if (active) {
      const shopMessage = active.shopMessage ? `${active.shopMessage}\n${body}` : body;
      await ctx.db.patch(active._id, { shopMessage, status: "open" });
      await ctx.db.insert("auditLog", { actor: "shop", action: "dispute_message_added", entityType: "dispute", entityId: active._id, reason: `${shop.name} texted: "${body.slice(0, 200)}". Re-analyzing with the new information.`, at: now });
      await ctx.scheduler.runAfter(0, internal.disputes.analyzeDispute, { disputeId: active._id });
      return active._id;
    }

    // Otherwise: the shop's most recent invoice with money still owed (or the most recent invoice at all).
    const invoices = await ctx.db.query("invoices").withIndex("by_shopId", (q) => q.eq("shopId", shop._id)).order("desc").take(20);
    const inv = invoices.find((i) => i.balanceCents > 0) ?? invoices[0];
    if (!inv) {
      await ctx.db.insert("auditLog", { actor: "shop", action: "dispute_sms_no_invoice", entityType: "shop", entityId: shop._id, reason: `${shop.name} texted "${body.slice(0, 160)}" but has no invoice yet. Logged for the owner; nothing to dispute financially.`, at: now });
      return null;
    }
    const disputeId = await ctx.db.insert("disputes", {
      invoiceId: inv._id, orderId: inv.orderId, shopId: shop._id,
      shopMessage: body, claimedItems: [], evidenceRefs: [],
      amountCents: 0, status: "open", requestedBy: "shop",
    });
    await markInvoiceDisputed(ctx, inv._id, now);
    await ctx.db.insert("auditLog", {
      actor: "shop", action: "dispute_opened_sms", entityType: "dispute", entityId: disputeId,
      reason: `${shop.name} disputed order ${shortId(inv.orderId)} by text: "${body.slice(0, 200)}"`,
      evidenceRefs: [{ type: "invoice", id: inv._id }], at: now,
    });
    await ctx.scheduler.runAfter(0, internal.disputes.analyzeDispute, { disputeId });
    return disputeId;
  },
});

// --------------------------------------------------------------------------- evidence

async function otherRecentDisputes(ctx: QueryCtx, shopId: Id<"shops">, exclude: Id<"disputes">) {
  const since = Date.now() - 90 * DAY;
  const all = await ctx.db.query("disputes").withIndex("by_shopId", (q) => q.eq("shopId", shopId)).collect();
  return all.filter((d) => d._id !== exclude && d._creationTime >= since);
}

export const gatherEvidence = internalQuery({
  args: { disputeId: v.id("disputes") },
  handler: async (ctx, { disputeId }): Promise<Evidence | null> => {
    const now = await demoNow(ctx);
    const dispute = await ctx.db.get(disputeId);
    if (!dispute) return null;
    const [invoice, order, shop] = await Promise.all([ctx.db.get(dispute.invoiceId), ctx.db.get(dispute.orderId), ctx.db.get(dispute.shopId)]);
    if (!invoice || !order || !shop) return null;
    const events = await ctx.db.query("orderEvents").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).collect();
    const segments = await ctx.db.query("transcriptSegments").withIndex("by_callId", (q) => q.eq("callId", order.callId)).take(150);
    const packing = await ctx.db.query("packingChecks").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).collect();
    const payments = await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id)).collect();
    const history = await otherRecentDisputes(ctx, shop._id, disputeId);
    const latePayments = await latePaymentCount(ctx, shop._id, now);
    const catalog: Record<string, string> = {};
    for (const l of order.lines) {
      const p = await ctx.db.query("catalogProducts").withIndex("by_sku", (q) => q.eq("sku", l.sku)).first();
      if (p) catalog[l.sku] = p.name;
    }
    return { dispute, invoice, order, shop, events, segments, packing, payments, history, latePayments, catalog, now };
  },
});

type Evidence = {
  dispute: Doc<"disputes">; invoice: Doc<"invoices">; order: Doc<"orders">; shop: Doc<"shops">;
  events: Doc<"orderEvents">[]; segments: Doc<"transcriptSegments">[]; packing: Doc<"packingChecks">[];
  payments: Doc<"payments">[]; history: Doc<"disputes">[]; latePayments: number; catalog: Record<string, string>; now: number;
};

function evidenceForModel(e: Evidence) {
  const pt = (ms: number) => new Date(ms).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return {
    dispute: { id: e.dispute._id, openedBy: e.dispute.requestedBy, shopMessage: e.dispute.shopMessage || "(no message from the shop yet)", shortfallCents: e.dispute.requestedBy === "agent" ? e.dispute.amountCents : undefined },
    shop: { id: e.shop._id, name: e.shop.name, language: e.shop.language },
    order: {
      id: e.order._id, status: e.order.status, summary: e.order.summaryText, totalCents: e.order.totalCents,
      lines: e.order.lines.map((l) => ({ sku: l.sku, name: e.catalog[l.sku] ?? l.description, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents, evidenceStartMs: l.evidenceStartMs })),
      openIssues: e.order.openIssues,
    },
    negotiation: e.events.map((x) => ({ id: x._id, field: x.field, value: x.value, proposedBy: x.proposedBy, acceptedBy: x.acceptedBy, rejectedBy: x.rejectedBy, quote: x.quote })),
    transcript: e.segments.map((s) => ({ id: s._id, role: s.role, startMs: s.startMs, text: s.text })),
    packingChecks: e.packing.map((p) => ({
      id: p._id, at: pt(p.checkedAt), packer: p.packerName, result: p.result,
      scannedBySku: p.scans.reduce<Record<string, number>>((acc, s) => { const k = s.sku ?? `barcode:${s.barcode}`; acc[k] = (acc[k] ?? 0) + s.qty; return acc; }, {}),
      mismatches: p.mismatches, photoCount: p.photoFileIds.length, photoIds: p.photoFileIds, override: p.overrideBy ? { by: p.overrideBy, reason: p.overrideReason } : undefined,
    })),
    invoice: { id: e.invoice._id, amountCents: e.invoice.amountCents, balanceCents: e.invoice.balanceCents, dueAt: pt(e.invoice.dueAt) },
    payments: e.payments.map((p) => ({ id: p._id, amountCents: p.amountCents, method: p.method, at: pt(p.receivedAt) })),
    shopHistory: { otherDisputesLast90Days: e.history.map((d) => ({ id: d._id, status: d.status, recommendation: d.recommendation, amountCents: d.amountCents, message: d.shopMessage.slice(0, 120) })), latePaymentsLast90Days: e.latePayments },
  };
}

const SYSTEM_PROMPT = `You are the accounts-receivable clerk for a small US wholesale drink distributor. A shop disputes an invoice or paid less than it owed. Read the evidence and recommend one outcome. You RECOMMEND only; the owner (or a narrow code rule) approves. You never move money.

Outcomes: credit (reduce what the shop owes), cash_refund (shop already paid; simulated refund), replacement (ship the missing/damaged goods again, no money), reject_with_evidence (the evidence contradicts the claim), escalate (unclear, conflicting, or needs a human).

Rules:
- Trust the packing scan over the shop's claim when the scan matched the order AND a photo exists. Then recommend reject_with_evidence.
- Trust the shop's claim when the packing check shows a mismatch for the claimed item, or when no packing check exists (but escalate if the amount is large relative to the order or the shop has several recent disputes).
- Damaged goods can't be seen in a barcode scan: if the shop credibly reports damage and the packing check doesn't contradict it, credit or replacement is reasonable; with a history of repeat claims, escalate.
- Price disagreements: compare the invoiced price with what the transcript/negotiation shows was agreed. If the transcript clearly supports the shop's price, credit the difference; if it supports ours, reject_with_evidence; if unclear, escalate.
- A short payment with no message and no packing mismatch: escalate (ask the owner to call), do not guess.
- When sources disagree, name both sources and what each says.
- Never invent a number. amountCents must be computed from prices in the order lines (qty × unitPriceCents) or the invoice/payments. Use 0 for reject_with_evidence and escalate.
- claimedItems: what the shop says is wrong, using order SKUs. Empty if the shop gave no details.
- reasoning: 3 to 5 plain sentences a busy owner can read in 10 seconds.
- evidenceRefs: point to the exact records (type = packing_check | transcript_segment | order | order_event | payment | invoice | dispute | photo) with ids from the evidence and a short detail.
When unsure, escalate.`;

const TOOL = {
  name: "record_recommendation",
  description: "Record the recommended resolution for this dispute.",
  input_schema: {
    type: "object",
    properties: {
      claimedItems: { type: "array", items: { type: "object", properties: { sku: { type: "string" }, qty: { type: "number" }, reason: { type: "string" } }, required: ["sku", "qty", "reason"] } },
      recommendation: { type: "string", enum: RECOMMENDATIONS },
      amountCents: { type: "integer" },
      reasoning: { type: "string" },
      evidenceRefs: { type: "array", items: { type: "object", properties: { type: { type: "string" }, id: { type: "string" }, detail: { type: "string" } }, required: ["type", "id", "detail"] } },
    },
    required: ["claimedItems", "recommendation", "amountCents", "reasoning", "evidenceRefs"],
  },
};

type Analysis = {
  claimedItems: { sku: string; qty: number; reason: string }[];
  recommendation: Recommendation;
  amountCents: number;
  reasoning: string;
  evidenceRefs: { type: string; id: string; detail: string }[];
  source: string;
};

async function askClaude(e: Evidence, apiKey: string): Promise<Analysis> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: `Evidence (JSON):\n${JSON.stringify(evidenceForModel(e))}` }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content: { type: string; name?: string; input?: unknown }[] };
  const block = data.content.find((c) => c.type === "tool_use");
  if (!block?.input) throw new Error("Claude returned no structured recommendation");
  const out = block.input as Omit<Analysis, "source">;
  return { ...out, source: MODEL };
}

/** Deterministic fallback when no ANTHROPIC_API_KEY is set (or the API fails): conservative, mostly escalates. */
function ruleBasedAnalysis(e: Evidence, why: string): Analysis {
  const pc = e.packing[e.packing.length - 1];
  const priceOf = (sku: string) => e.order.lines.find((l) => l.sku === sku)?.unitPriceCents;
  if (pc?.result === "mismatch" && pc.mismatches.some((m) => m.scannedQty < m.expectedQty)) {
    const claimed = pc.mismatches.filter((m) => m.scannedQty < m.expectedQty).map((m) => ({ sku: m.sku, qty: m.expectedQty - m.scannedQty, reason: "short-shipped per packing scan" }));
    const amount = claimed.reduce((s, c) => s + (priceOf(c.sku) ?? 0) * c.qty, 0);
    if (amount > 0) {
      return {
        claimedItems: claimed, recommendation: "credit", amountCents: amount, source: `rules (${why})`,
        reasoning: `The packing check shows fewer items scanned than ordered (${claimed.map((c) => `${c.qty} × ${c.sku}`).join(", ")}). That supports the shop. Credit the missing items at the agreed price.`,
        evidenceRefs: [{ type: "packing_check", id: pc._id, detail: "mismatch: scanned less than ordered" }],
      };
    }
  }
  if (pc && pc.result === "match" && pc.photoFileIds.length > 0 && e.dispute.shopMessage) {
    return {
      claimedItems: [], recommendation: "reject_with_evidence", amountCents: 0, source: `rules (${why})`,
      reasoning: `The packing scan matched the order and a photo of the box exists. That contradicts a shortage claim. Reply to the shop with the scan and photo.`,
      evidenceRefs: [{ type: "packing_check", id: pc._id, detail: "scan matched order; photo on file" }],
    };
  }
  return {
    claimedItems: [], recommendation: "escalate", amountCents: 0, source: `rules (${why})`,
    reasoning: `The evidence is not clear enough to recommend a money outcome automatically. The owner should review the order, packing check and the shop's message.`,
    evidenceRefs: [{ type: "dispute", id: e.dispute._id, detail: "needs human review" }],
  };
}

export const analyzeDispute = internalAction({
  args: { disputeId: v.id("disputes") },
  handler: async (ctx, { disputeId }) => {
    const e: Evidence | null = await ctx.runQuery(internal.disputes.gatherEvidence, { disputeId });
    if (!e) return;
    const key = process.env.ANTHROPIC_API_KEY;
    let analysis: Analysis;
    if (!key) {
      analysis = ruleBasedAnalysis(e, "ANTHROPIC_API_KEY not set");
    } else {
      try {
        analysis = await askClaude(e, key);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[disputes] Claude analysis failed: ${msg}`);
        analysis = { claimedItems: [], recommendation: "escalate", amountCents: 0, source: "error", reasoning: `Automatic analysis failed (${msg.slice(0, 120)}). Escalating to the owner rather than guessing.`, evidenceRefs: [] };
      }
    }
    await ctx.runMutation(internal.disputes.applyAnalysis, { disputeId, ...analysis });
  },
});

// --------------------------------------------------------------------------- code-enforced limits

function packingSupportsClaim(pc: Doc<"packingChecks"> | undefined, claimed: { sku: string; qty: number }[]): boolean {
  if (!pc || pc.result !== "mismatch" || claimed.length === 0) return false;
  return claimed.every((c) => pc.mismatches.some((m) => m.sku === c.sku && m.expectedQty - m.scannedQty >= c.qty));
}

export const applyAnalysis = internalMutation({
  args: {
    disputeId: v.id("disputes"),
    claimedItems: v.array(v.object({ sku: v.string(), qty: v.number(), reason: v.string() })),
    recommendation: v.string(),
    amountCents: v.number(),
    reasoning: v.string(),
    evidenceRefs: v.array(v.object({ type: v.string(), id: v.string(), detail: v.string() })),
    source: v.string(),
  },
  handler: async (ctx, a) => {
    const now = await demoNow(ctx);
    const d = await ctx.db.get(a.disputeId);
    if (!d || (d.status !== "open" && d.status !== "awaiting_approval")) return;
    const inv = (await ctx.db.get(d.invoiceId))!;
    const order = (await ctx.db.get(d.orderId))!;
    const shop = (await ctx.db.get(d.shopId))!;
    const notes: string[] = [];

    // Validate the model's output. Unknown outcome -> escalate.
    let rec: Recommendation = (RECOMMENDATIONS as string[]).includes(a.recommendation) ? (a.recommendation as Recommendation) : "escalate";
    if (rec !== a.recommendation) notes.push(`model returned unknown outcome "${a.recommendation}"; escalated`);
    const claimedItems = a.claimedItems
      .filter((c) => order.lines.some((l) => l.sku === c.sku) && Number.isFinite(c.qty) && c.qty > 0)
      .map((c) => ({ ...c, qty: Math.round(c.qty) }));

    // Amount: integer cents, never more than the value of the claimed goods at the agreed price, nor the invoice.
    let amount = Math.max(0, Math.round(Number.isFinite(a.amountCents) ? a.amountCents : 0));
    if (rec === "reject_with_evidence" || rec === "escalate") amount = 0;
    const claimedValue = claimedItems.reduce((s, c) => s + (order.lines.find((l) => l.sku === c.sku)?.unitPriceCents ?? 0) * c.qty, 0);
    const cap = Math.min(inv.amountCents, claimedValue > 0 ? claimedValue : d.requestedBy === "agent" ? d.amountCents : inv.amountCents);
    if (amount > cap) { notes.push(`amount capped from ${usd(amount)} to ${usd(cap)} (value of claimed goods / invoice)`); amount = cap; }
    if (rec === "credit" && amount > inv.balanceCents) { notes.push(`credit capped at the open balance ${usd(inv.balanceCents)}`); amount = inv.balanceCents; }
    const paid = (await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect()).reduce((s, p) => s + p.amountCents, 0);
    if (rec === "cash_refund" && amount > paid) { notes.push(`refund capped at what the shop paid, ${usd(paid)}`); amount = paid; }
    if ((rec === "credit" || rec === "cash_refund") && amount === 0) { notes.push("money outcome with no amount; escalated"); rec = "escalate"; }

    const reasoning = notes.length ? `${a.reasoning}\n[Checks: ${notes.join("; ")}.]` : a.reasoning;
    await ctx.db.patch(d._id, { claimedItems, recommendation: rec, amountCents: amount, reasoning, evidenceRefs: a.evidenceRefs, status: "awaiting_approval" });
    await ctx.db.insert("auditLog", {
      actor: "agent", action: "dispute_recommendation", entityType: "dispute", entityId: d._id,
      reason: `Recommended ${rec}${amount ? ` ${usd(amount)}` : ""} (by ${a.source}). ${a.reasoning.slice(0, 300)}`,
      evidenceRefs: a.evidenceRefs, at: now,
    });

    // Narrow auto-approve rule — decided by code, not the model.
    const latestPacking = (await ctx.db.query("packingChecks").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).collect()).sort((x, y) => y.checkedAt - x.checkedAt)[0];
    const others = await otherRecentDisputes(ctx, shop._id, d._id);
    const small = amount > 0 && amount <= shop.autoApproveLimitCents;
    const clean = others.length === 0;
    const supported = packingSupportsClaim(latestPacking, claimedItems);
    const eligible = (rec === "credit" || rec === "cash_refund" || rec === "replacement") && small && clean && supported;
    if (eligible) {
      await ctx.db.insert("auditLog", {
        actor: "system", action: "auto_approve_rule_applied", entityType: "dispute", entityId: d._id,
        reason: `${AUTO_RULE}: ${usd(amount)} <= limit ${usd(shop.autoApproveLimitCents)}, 0 other disputes in 90 days, packing check shows the shortage. Approved without waiting for the owner.`,
        evidenceRefs: latestPacking ? [{ type: "packing_check", id: latestPacking._id, detail: "mismatch supports claim" }] : undefined, at: now,
      });
      await executeDecision(ctx, d._id, AUTO_RULE, rec, amount, "Auto-approved by rule", now);
    } else {
      const why = [!small && "amount over the auto-approve limit or zero", !clean && `${others.length} other dispute(s) in 90 days`, !supported && "packing check does not confirm the claim", !(rec === "credit" || rec === "cash_refund" || rec === "replacement") && `outcome is ${rec}`].filter(Boolean).join("; ");
      await ctx.db.insert("auditLog", { actor: "system", action: "awaiting_owner_approval", entityType: "dispute", entityId: d._id, reason: `Owner must decide (${why}).`, at: now });
    }
  },
});

// --------------------------------------------------------------------------- decisions

function invoiceStatusAfter(balance: number, paid: number, credited: boolean): Doc<"invoices">["status"] {
  if (balance === 0) return credited ? "credited" : "paid";
  return paid > 0 ? "partially_paid" : "open";
}

function itemsText(d: Doc<"disputes">, order: Doc<"orders">): string {
  if (d.claimedItems.length === 0) return "";
  return d.claimedItems.map((c) => `${c.qty} ${order.lines.find((l) => l.sku === c.sku)?.unit ?? "x"} ${order.lines.find((l) => l.sku === c.sku)?.description ?? c.sku}`).join(", ");
}

async function evidenceText(ctx: QueryCtx, d: Doc<"disputes">, order: Doc<"orders">): Promise<string> {
  const pcs = await ctx.db.query("packingChecks").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).collect();
  const pc = pcs.sort((x, y) => y.checkedAt - x.checkedAt)[0];
  if (!pc) return (d.reasoning ?? "").split("\n")[0];
  const time = new Date(pc.checkedAt).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
  const skus = d.claimedItems.length ? d.claimedItems.map((c) => c.sku) : order.lines.map((l) => l.sku);
  const parts = skus.map((sku) => {
    const qty = pc.scans.filter((s) => s.sku === sku).reduce((s, x) => s + x.qty, 0);
    const line = order.lines.find((l) => l.sku === sku);
    return `${qty} ${line?.unit ?? ""}${qty === 1 ? "" : "s"} of ${line?.description ?? sku}`.replace("  ", " ");
  });
  return `Packing scan at ${time} shows ${parts.join(", ")}${pc.photoFileIds.length ? " and a photo of the box" : ""}.`;
}

/** Posts the ledger entry, updates the invoice, texts the shop. Only ever called after an approval. */
async function executeDecision(ctx: MutationCtx, disputeId: Id<"disputes">, decidedBy: string, outcome: Recommendation, amount: number, note: string, now: number) {
  const d = (await ctx.db.get(disputeId))!;
  if (decidedBy === "agent" || decidedBy === d.requestedBy) throw new Error("Segregation of duties: the requester cannot approve its own dispute");
  const inv = (await ctx.db.get(d.invoiceId))!;
  const order = (await ctx.db.get(d.orderId))!;
  const shop = (await ctx.db.get(d.shopId))!;
  const payments = await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect();
  const paid = payments.reduce((s, p) => s + p.amountCents, 0);
  const ref = shortId(order._id);
  const items = itemsText(d, order);
  const es = shop.language === "es";
  let balance = inv.balanceCents;
  let credited = false;
  let sms = "";

  if (outcome === "credit") {
    if (amount <= 0 || amount > inv.balanceCents) throw new Error(`Credit must be between $0.01 and the open balance ${usd(inv.balanceCents)}`);
    await postEntryGroup(ctx, pair("sales_returns", "accounts_receivable", amount), "dispute", d._id, `Credit note for order ${ref}${items ? `: ${items}` : ""}`, now);
    balance -= amount;
    credited = true;
    sms = es
      ? `Pedido ${ref}: le acreditamos ${usd(amount)}${items ? ` por ${items}` : ""}. Nuevo saldo: ${usd(balance)}.`
      : `Order ${ref}: we credited ${usd(amount)}${items ? ` for ${items}` : ""}. New balance: ${usd(balance)}.`;
  } else if (outcome === "cash_refund") {
    if (amount <= 0 || amount > paid) throw new Error(`Refund must be between $0.01 and what the shop paid (${usd(paid)})`);
    await postEntryGroup(ctx, pair("sales_returns", "cash", amount), "dispute", d._id, `SIMULATED cash refund for order ${ref} (no real money moved)`, now);
    sms = es ? `Pedido ${ref}: le reembolsaremos ${usd(amount)}${items ? ` por ${items}` : ""}.` : `Order ${ref}: we're refunding ${usd(amount)}${items ? ` for ${items}` : ""}.`;
  } else if (outcome === "replacement") {
    await ctx.db.insert("auditLog", { actor: "system", action: "replacement_shipment_logged", entityType: "dispute", entityId: d._id, reason: `Replacement approved for order ${ref}${items ? `: ${items}` : ""}. No ledger entry (inventory is not tracked in this demo).`, at: now });
    sms = es ? `Pedido ${ref}: le enviaremos el reemplazo${items ? ` de ${items}` : ""} en la próxima entrega.` : `Order ${ref}: we'll send a replacement${items ? ` for ${items}` : ""} on the next delivery.`;
  } else if (outcome === "reject_with_evidence") {
    const ev = await evidenceText(ctx, d, order);
    sms = es ? `Pedido ${ref}: revisamos su reclamo. ${ev} El saldo de ${usd(balance)} sigue pendiente.` : `Order ${ref}: we checked your claim. ${ev} The balance of ${usd(balance)} is still due.`;
  } else {
    throw new Error("Choose an outcome to approve (escalate is not an outcome)");
  }

  await ctx.db.patch(d._id, { status: "approved", recommendation: outcome, amountCents: amount, decidedBy, decidedAt: now });
  await ctx.db.patch(inv._id, { balanceCents: balance, status: invoiceStatusAfter(balance, paid, credited) });
  if (balance > 0) await scheduleInvoiceReminders(ctx, (await ctx.db.get(inv._id))!, now, { resume: true });
  await ctx.scheduler.runAfter(0, internal.messaging.sendSms, { to: shop.phone, body: sms, relatedType: "dispute", relatedId: d._id });
  await ctx.db.insert("auditLog", {
    actor: decidedBy === "owner" ? "owner" : "system", action: `dispute_approved_${outcome}`, entityType: "dispute", entityId: d._id,
    reason: `${decidedBy} approved ${outcome}${amount ? ` ${usd(amount)}` : ""} for ${shop.name}, order ${ref}. ${note}`.trim(),
    evidenceRefs: d.evidenceRefs, at: now,
  });
}

/** Owner approves (optionally with a different outcome/amount) or rejects the recommendation. */
export const decide = mutation({
  args: {
    disputeId: v.id("disputes"),
    approve: v.boolean(),
    note: v.optional(v.string()),
    outcome: v.optional(v.union(v.literal("credit"), v.literal("cash_refund"), v.literal("replacement"), v.literal("reject_with_evidence"))),
    amountCents: v.optional(v.number()),
  },
  handler: async (ctx, { disputeId, approve, note, outcome, amountCents }) => {
    const now = await demoNow(ctx);
    const decidedBy = "owner"; // the dashboard is the owner's seat
    const d = await ctx.db.get(disputeId);
    if (!d) throw new Error("Dispute not found");
    if (d.status !== "awaiting_approval" && d.status !== "open") throw new Error(`Dispute is already ${d.status}`);
    if (d.requestedBy === decidedBy) throw new Error("Segregation of duties: the requester cannot decide this dispute");

    if (approve) {
      const finalOutcome = outcome ?? (d.recommendation && d.recommendation !== "escalate" ? d.recommendation : undefined);
      if (!finalOutcome) throw new Error("This dispute was escalated: pick an outcome to approve");
      const amount = Math.round(amountCents ?? d.amountCents);
      await executeDecision(ctx, d._id, decidedBy, finalOutcome, amount, note ? `Owner note: ${note}` : "", now);
      return;
    }

    // Rejected: nothing moves. The invoice goes back to normal collection.
    const inv = (await ctx.db.get(d.invoiceId))!;
    const paid = (await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect()).reduce((s, p) => s + p.amountCents, 0);
    await ctx.db.patch(d._id, { status: "rejected", decidedBy, decidedAt: now });
    await ctx.db.patch(inv._id, { status: invoiceStatusAfter(inv.balanceCents, paid, false) });
    if (inv.balanceCents > 0) await scheduleInvoiceReminders(ctx, (await ctx.db.get(inv._id))!, now, { resume: true });
    await ctx.db.insert("auditLog", { actor: "owner", action: "dispute_rejected", entityType: "dispute", entityId: d._id, reason: `Owner rejected the recommendation (${d.recommendation ?? "none"}). ${note ?? ""}`.trim(), at: now });
  },
});

/** Re-run the analysis (e.g. after a packing check was added). */
export const reanalyze = mutation({
  args: { disputeId: v.id("disputes") },
  handler: async (ctx, { disputeId }) => {
    const d = await ctx.db.get(disputeId);
    if (!d || (d.status !== "open" && d.status !== "awaiting_approval")) throw new Error("Only open disputes can be re-analyzed");
    await ctx.db.patch(disputeId, { status: "open" });
    await ctx.scheduler.runAfter(0, internal.disputes.analyzeDispute, { disputeId });
  },
});

// --------------------------------------------------------------------------- dashboard reads

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("disputes").order("desc").take(100);
    const out = [];
    for (const d of rows) {
      const shop = await ctx.db.get(d.shopId);
      const inv = await ctx.db.get(d.invoiceId);
      out.push({ ...d, shopName: shop?.name ?? "?", orderRef: shortId(d.orderId), invoiceAmountCents: inv?.amountCents ?? 0, invoiceBalanceCents: inv?.balanceCents ?? 0 });
    }
    return out;
  },
});

export const detail = query({
  args: { disputeId: v.id("disputes") },
  handler: async (ctx, { disputeId }) => {
    const d = await ctx.db.get(disputeId);
    if (!d) return null;
    const [inv, order, shop] = await Promise.all([ctx.db.get(d.invoiceId), ctx.db.get(d.orderId), ctx.db.get(d.shopId)]);
    if (!inv || !order || !shop) return null;
    const packing = await ctx.db.query("packingChecks").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).collect();
    const photos: { checkId: string; url: string | null }[] = [];
    for (const p of packing) for (const f of p.photoFileIds) photos.push({ checkId: p._id, url: await ctx.storage.getUrl(f) });
    const segments = await ctx.db.query("transcriptSegments").withIndex("by_callId", (q) => q.eq("callId", order.callId)).take(150);
    const payments = await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect();
    const history = await otherRecentDisputes(ctx, shop._id, d._id);
    const audit = await ctx.db.query("auditLog").withIndex("by_entity", (q) => q.eq("entityType", "dispute").eq("entityId", d._id)).collect();
    return { dispute: d, invoice: inv, order, shop, packing, photos, segments, payments, history, audit, orderRef: shortId(order._id), autoRule: AUTO_RULE };
  },
});
