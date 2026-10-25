import { action, internalMutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { demoNow } from "./lib/clock";

/**
 * A shop's track record: every purchase, how they paid, every problem,
 * and a short plain-English summary written by the C2C AI Assistant (Claude).
 */

const MODEL = "claude-sonnet-5-5";
const DAY = 86_400_000;

export const profile = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop) return null;
    const now = await demoNow(ctx);

    const invoices = await ctx.db.query("invoices").withIndex("by_shopId", (q) => q.eq("shopId", shopId)).order("desc").collect();
    const purchases = [];
    for (const inv of invoices) {
      const order = await ctx.db.get(inv.orderId);
      const payments = await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect();
      const lastPaid = payments.length ? Math.max(...payments.map((p) => p.receivedAt)) : undefined;
      const daysLate = inv.balanceCents === 0 && lastPaid !== undefined ? Math.max(0, Math.floor((lastPaid - inv.dueAt) / DAY)) : undefined;
      const overdueDays = inv.balanceCents > 0 && now > inv.dueAt ? Math.floor((now - inv.dueAt) / DAY) : 0;
      purchases.push({
        invoiceId: inv._id,
        date: inv.issuedAt,
        items: (order?.lines ?? []).map((l) => `${l.qty} ${l.description}`),
        amountCents: inv.amountCents,
        balanceCents: inv.balanceCents,
        status: inv.status,
        daysLate,
        overdueDays,
      });
    }

    const disputes = (await ctx.db.query("disputes").withIndex("by_shopId", (q) => q.eq("shopId", shopId)).collect())
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((d) => ({
        _id: d._id, date: d._creationTime, summary: d.summary, shopMessage: d.shopMessageClean ?? d.shopMessage,
        requestedBy: d.requestedBy, recommendation: d.recommendation, amountCents: d.amountCents, status: d.status,
      }));

    const settled = purchases.filter((p) => p.balanceCents === 0 && p.daysLate !== undefined);
    const stats = {
      orders: purchases.length,
      billedCents: purchases.reduce((s, p) => s + p.amountCents, 0),
      owedCents: purchases.reduce((s, p) => s + p.balanceCents, 0),
      paidOnTime: settled.filter((p) => (p.daysLate ?? 0) === 0).length,
      paidLate: settled.filter((p) => (p.daysLate ?? 0) > 0).length,
      overdueNow: purchases.filter((p) => p.overdueDays > 0).length,
      problems: disputes.length,
      problemsInTheirFavor: disputes.filter((d) => d.status === "approved" && d.recommendation !== "reject_with_evidence").length,
    };
    // Something happened since the summary was written? Then it should be rewritten.
    const lastActivity = Math.max(0, ...purchases.map((p) => p.date), ...disputes.map((d) => d.date));
    const summaryStale = !shop.trackRecordSummary || (shop.trackRecordAt ?? 0) < lastActivity;
    return { shop, purchases, disputes, stats, summaryStale };
  },
});

export const saveSummary = internalMutation({
  args: { shopId: v.id("shops"), summary: v.string() },
  handler: async (ctx, { shopId, summary }) => {
    await ctx.db.patch(shopId, { trackRecordSummary: summary, trackRecordAt: Date.now() });
  },
});

/** Writes (or rewrites) the C2C AI Assistant's track-record summary for a shop. */
export const summarize = action({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }): Promise<string | null> => {
    const p = await ctx.runQuery(api.shops.profile, { shopId });
    if (!p) return null;
    const { shop, stats, purchases, disputes } = p;
    const fallback =
      `${shop.name} has placed ${stats.orders} ${stats.orders === 1 ? "order" : "orders"}. ` +
      `They paid ${stats.paidOnTime} on time and ${stats.paidLate} late` +
      (stats.problems ? `, and raised ${stats.problems} ${stats.problems === 1 ? "problem" : "problems"}.` : ", with no problems raised.");

    const key = process.env.ANTHROPIC_API_KEY;
    let summary = fallback;
    if (key) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 300,
            system:
              "You help the owner of a small drink distributor understand one of their customer shops. Write 2 or 3 short, plain sentences about this shop's track record: how reliably they pay, how often they raise problems and whether those problems held up, and anything the owner should keep an eye on. Talk about the shop as \"they\". Use correct grammar and capitalization, and write product names properly (Dr Pepper, Coca-Cola). No jargon (say bill, not invoice). Only use the facts given; never invent numbers. Reply with the sentences only.",
            messages: [{ role: "user", content: JSON.stringify({ shop: shop.name, stats, purchases: purchases.slice(0, 20), problems: disputes.slice(0, 20) }) }],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { content: { type: string; text?: string }[] };
          const text = data.content.find((c) => c.type === "text")?.text?.trim();
          if (text) summary = text;
        }
      } catch {
        // keep the plain fallback
      }
    }
    await ctx.runMutation(internal.shops.saveSummary, { shopId, summary });
    return summary;
  },
});
