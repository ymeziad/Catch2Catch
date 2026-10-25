import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { demoNow, shortId, usd } from "./lib/clock";
import { pair, postEntryGroup } from "./ledger";

/**
 * The shop (buyer) changes its own order from a texted link: more or fewer cases, or an item removed.
 * Allowed only until the boxes are packed and before anything is paid. If the order is already billed,
 * the bill and the books move by the difference (Dr AR / Cr Sales up, or the reverse down), so it always adds up.
 */

const MAX_QTY = 500;

/** Price of one unit on a line (agreed price, or the line total spread over the quantity). */
function unitCents(l: Doc<"orders">["lines"][number]): number | undefined {
  if (l.unitPriceCents !== undefined) return l.unitPriceCents;
  if (l.lineTotalCents !== undefined && l.qty > 0) return l.lineTotalCents / l.qty;
  return undefined;
}

async function whyLocked(ctx: QueryCtx, order: Doc<"orders">): Promise<string | null> {
  if (order.status === "cancelled" || order.status === "no_agreement") return "cancelled";
  if (order.status === "disputed") return "problem";
  const packed = await ctx.db.query("packingChecks").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).first();
  if (packed) return "packed";
  const inv = await ctx.db.query("invoices").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).first();
  if (inv) {
    if (inv.status !== "open") return inv.status === "disputed" ? "problem" : "paid";
    const paid = await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).first();
    if (paid) return "paid";
  }
  return null;
}

/** Everything the shop's order page needs. */
export const forShop = query({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    const id = ctx.db.normalizeId("orders", orderId);
    const order = id ? await ctx.db.get(id) : null;
    if (!order) return null;
    const shop = order.shopId ? await ctx.db.get(order.shopId) : null;
    return {
      orderRef: shortId(order._id),
      shopName: shop?.name ?? "",
      lang: shop?.language === "es" ? ("es" as const) : ("en" as const),
      deliveryDate: order.deliveryDate ?? null,
      lines: order.lines.map((l) => ({ sku: l.sku, description: l.description, qty: l.qty, unit: l.unit, unitCents: unitCents(l) ?? null })),
      totalCents: order.totalCents ?? order.lines.reduce((s, l) => s + (l.lineTotalCents ?? (unitCents(l) ?? 0) * l.qty), 0),
      locked: await whyLocked(ctx, order), // null = the shop can still change it
    };
  },
});

/** The shop taps Save. `lines` lists every item's new quantity (0 = take it off). */
export const saveChanges = mutation({
  args: { orderId: v.string(), lines: v.array(v.object({ sku: v.string(), qty: v.number() })) },
  handler: async (ctx, args) => {
    const now = await demoNow(ctx);
    const id = ctx.db.normalizeId("orders", args.orderId);
    const order = id ? await ctx.db.get(id) : null;
    if (!order || !order.shopId) throw new Error("We couldn't find this order.");
    const shop = await ctx.db.get(order.shopId);
    if (!shop) throw new Error("We couldn't find this order.");
    const es = shop.language === "es";
    const locked = await whyLocked(ctx, order);
    if (locked) throw new Error(es ? "Este pedido ya no se puede cambiar. Llámenos si necesita algo." : "This order can't be changed anymore. Please call us if you need something.");

    const wanted = new Map(args.lines.map((l) => [l.sku, l.qty]));
    const changes: string[] = [];
    const lines: Doc<"orders">["lines"] = [];
    for (const l of order.lines) {
      const qty = wanted.has(l.sku) ? wanted.get(l.sku)! : l.qty;
      if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) throw new Error(es ? "Revise las cantidades." : "Please check the amounts.");
      if (qty === l.qty) { lines.push(l); continue; }
      changes.push(qty === 0 ? `removed ${l.description}` : `${l.description} ${l.qty} → ${qty}`);
      if (qty === 0) continue;
      const unit = unitCents(l);
      lines.push({ ...l, qty, lineTotalCents: unit !== undefined ? Math.round(unit * qty) : l.lineTotalCents });
    }
    if (changes.length === 0) return { changed: false, totalCents: order.totalCents ?? 0 };
    if (lines.length === 0) throw new Error(es ? "Deje al menos un producto. Para cancelar todo el pedido, llámenos." : "Keep at least one item. To cancel the whole order, please call us.");

    const oldTotal = order.totalCents ?? order.lines.reduce((s, l) => s + (l.lineTotalCents ?? 0), 0);
    const newTotal = lines.reduce((s, l) => s + (l.lineTotalCents ?? 0), 0);
    await ctx.db.patch(order._id, { lines, totalCents: newTotal });

    // Already billed? Move the bill and the books by the difference.
    const inv = await ctx.db.query("invoices").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).first();
    const delta = newTotal - oldTotal;
    if (inv && delta !== 0) {
      await ctx.db.patch(inv._id, { amountCents: inv.amountCents + delta, balanceCents: inv.balanceCents + delta });
      const memo = `${shop.name} changed order ${shortId(order._id)}`;
      await postEntryGroup(ctx, delta > 0 ? pair("accounts_receivable", "sales", delta) : pair("sales", "accounts_receivable", -delta), "invoice", inv._id, memo, now);
    }

    await ctx.db.insert("auditLog", {
      actor: "shop", action: "order_changed_by_shop", entityType: "order", entityId: order._id,
      reason: `${shop.name} changed their order ${shortId(order._id)}: ${changes.join("; ")}. New total ${usd(newTotal)}${inv ? " (bill updated)" : ""}.`,
      at: now,
    });

    const list = lines.map((l) => `${l.qty} ${l.description}`).join(", ");
    const body = es
      ? `Listo. Su pedido ${shortId(order._id)} ahora es: ${list}. Nuevo total: ${usd(newTotal)}.`
      : `Got it. Your order ${shortId(order._id)} is now: ${list}. New total: ${usd(newTotal)}.`;
    await ctx.scheduler.runAfter(0, internal.messaging.sendSms, { to: shop.phone, body, relatedType: "order", relatedId: order._id as Id<"orders"> });
    return { changed: true, totalCents: newTotal };
  },
});

/** Link the shop opens to change its order (APP_URL = where the dashboard is hosted). */
export function orderLink(orderId: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/order/${orderId}`;
}
