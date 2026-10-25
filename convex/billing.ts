import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { DAY, demoNow, shortDate, shortId, usd } from "./lib/clock";
import { pair, postEntryGroup } from "./ledger";
import { cancelInvoiceReminders, cancelOrderReminders, scheduleInvoiceReminders } from "./reminders";
import { openDisputeForShortPayment } from "./disputes";
import { orderLink } from "./orderEdits";

/**
 * Invoices and payments.
 * Contract: internal.billing.createInvoiceForOrder({ orderId }) — called by orders.confirmOrder when both confirmed.
 */

export const createInvoiceForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<Id<"invoices"> | null> => {
    const now = await demoNow(ctx);
    const order = await ctx.db.get(orderId);
    if (!order) return null;

    // Idempotent: one invoice per order.
    const existing = await ctx.db.query("invoices").withIndex("by_orderId", (q) => q.eq("orderId", orderId)).first();
    if (existing) return existing._id;

    const fromLines = order.lines.reduce((s, l) => s + (l.lineTotalCents ?? (l.unitPriceCents !== undefined ? l.unitPriceCents * l.qty : 0)), 0);
    const amountCents = order.totalCents ?? fromLines;
    if (!order.shopId || !Number.isInteger(amountCents) || amountCents <= 0) {
      await ctx.db.insert("auditLog", {
        actor: "agent", action: "invoice_needs_review", entityType: "order", entityId: orderId,
        reason: !order.shopId ? "Not invoiced: order has no shop attached" : `Not invoiced: order total is missing or invalid (${amountCents}). Needs review rather than a guess.`,
        at: now,
      });
      return null;
    }
    const shop = await ctx.db.get(order.shopId);
    if (!shop) return null;

    const dueAt = now + shop.paymentTermsDays * DAY;
    const invoiceId = await ctx.db.insert("invoices", { orderId, shopId: shop._id, amountCents, balanceCents: amountCents, issuedAt: now, dueAt, status: "open" });
    await postEntryGroup(ctx, pair("accounts_receivable", "sales", amountCents), "invoice", invoiceId, `Invoice for order ${shortId(orderId)} — ${shop.name}`, now);

    await cancelOrderReminders(ctx, orderId, "order confirmed by both parties", now);
    const invoice = (await ctx.db.get(invoiceId))!;
    await scheduleInvoiceReminders(ctx, invoice, now);

    const es = shop.language === "es";
    const body = es
      ? `Factura del pedido ${shortId(orderId)}: ${usd(amountCents)}, vence el ${shortDate(dueAt)}. ¿Quiere cambiar cantidades antes de que lo empaquemos? ${orderLink(orderId)} Responda si algo falta o está dañado.`
      : `Invoice for order ${shortId(orderId)}: ${usd(amountCents)}, due ${shortDate(dueAt)}. Want to change amounts before we pack it? ${orderLink(orderId)} Reply if anything is missing or damaged.`;
    await ctx.scheduler.runAfter(0, internal.messaging.sendSms, { to: shop.phone, body, relatedType: "invoice", relatedId: invoiceId });

    await ctx.db.insert("auditLog", {
      actor: "agent", action: "invoice_created", entityType: "invoice", entityId: invoiceId,
      reason: `Both parties confirmed order ${shortId(orderId)}; invoiced ${shop.name} ${usd(amountCents)}, due in ${shop.paymentTermsDays} days. Posted Dr AR / Cr Sales.`,
      evidenceRefs: [{ type: "order", id: orderId, detail: order.summaryText.slice(0, 120) }], at: now,
    });
    return invoiceId;
  },
});

/** Dashboard "Record payment" button. */
export const recordPayment = mutation({
  args: { invoiceId: v.id("invoices"), amountCents: v.number(), method: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { invoiceId, amountCents, method, note }) => {
    const now = await demoNow(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) throw new Error("Invoice not found");
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Payment must be a positive amount in cents");
    if (amountCents > inv.balanceCents) throw new Error(`Payment ${usd(amountCents)} is more than the balance ${usd(inv.balanceCents)}`);
    const shop = await ctx.db.get(inv.shopId);

    const paymentId = await ctx.db.insert("payments", { invoiceId, amountCents, method, receivedAt: now, note });
    await postEntryGroup(ctx, pair("cash", "accounts_receivable", amountCents), "payment", paymentId, `Payment ${method} for order ${shortId(inv.orderId)}`, now);
    const balanceCents = inv.balanceCents - amountCents;

    await ctx.db.insert("auditLog", {
      actor: "owner", action: "payment_recorded", entityType: "invoice", entityId: invoiceId,
      reason: `Received ${usd(amountCents)} by ${method} from ${shop?.name ?? "shop"}; balance now ${usd(balanceCents)}. Posted Dr Cash / Cr AR.${now > inv.dueAt ? ` Paid late (due ${shortDate(inv.dueAt)}).` : ""}`,
      evidenceRefs: [{ type: "payment", id: paymentId, detail: `${usd(amountCents)} ${method}` }], at: now,
    });

    if (balanceCents === 0) {
      await ctx.db.patch(invoiceId, { balanceCents, status: inv.status === "disputed" ? "disputed" : "paid" });
      await cancelInvoiceReminders(ctx, invoiceId, "invoice paid in full", now);
      return { status: "paid" as const, paymentId };
    }

    // Short payment. If no dispute is open, the agent asks the shop what happened and opens one itself.
    const openDispute = (await ctx.db.query("disputes").withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId)).collect())
      .find((d) => d.status === "open" || d.status === "awaiting_approval");
    if (inv.status === "disputed" || openDispute) {
      await ctx.db.patch(invoiceId, { balanceCents });
      return { status: "partially_paid_dispute_open" as const, paymentId };
    }
    await ctx.db.patch(invoiceId, { balanceCents, status: "partially_paid" });
    if (shop) {
      const totalPaid = inv.amountCents - balanceCents;
      const es = shop.language === "es";
      const body = es
        ? `Recibimos ${usd(totalPaid)} de ${usd(inv.amountCents)} del pedido ${shortId(inv.orderId)}. ¿Faltó algo o llegó dañado? Responda con detalles.`
        : `We received ${usd(totalPaid)} of ${usd(inv.amountCents)} for order ${shortId(inv.orderId)}. Was something missing or damaged? Reply with details.`;
      await ctx.scheduler.runAfter(0, internal.messaging.sendSms, { to: shop.phone, body, relatedType: "invoice", relatedId: invoiceId });
      await openDisputeForShortPayment(ctx, inv._id, balanceCents, now);
    }
    return { status: "short_payment_dispute_opened" as const, paymentId };
  },
});

// --------------------------------------------------------------------------- dashboard reads

export const listInvoices = query({
  args: {},
  handler: async (ctx) => {
    const now = await demoNow(ctx);
    const invoices = await ctx.db.query("invoices").order("desc").take(200);
    const out = [];
    for (const inv of invoices) {
      const shop = await ctx.db.get(inv.shopId);
      const payments = await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect();
      const escalated = (await ctx.db.query("reminders").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect())
        .some((r) => r.kind === "escalate_owner" && r.status === "sent");
      out.push({
        ...inv,
        shopName: shop?.name ?? "?",
        payments,
        overdue: inv.balanceCents > 0 && now > inv.dueAt && inv.status !== "disputed",
        escalated,
        orderRef: shortId(inv.orderId),
      });
    }
    return out;
  },
});

export const listShops = query({
  args: {},
  handler: async (ctx) => ctx.db.query("shops").collect(),
});
