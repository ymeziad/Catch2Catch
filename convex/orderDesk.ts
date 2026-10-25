import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizePhone } from "./lib/phone";

/**
 * Dashboard view of orders that came from calls: what Claude extracted, who it was sent to,
 * and the controls to attach the caller to a shop. Confirming uses orders.confirmManually.
 */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").order("desc").take(100);
    const shops = await ctx.db.query("shops").take(200);
    const shopName = new Map(shops.map((s) => [s._id as string, s.name]));
    const rows = [];
    for (const order of orders) {
      const call = await ctx.db.get(order.callId);
      const invoice = await ctx.db.query("invoices").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).first();
      rows.push({
        order,
        shopName: order.shopId ? shopName.get(order.shopId) ?? null : null,
        buyerPhone: call?.buyerPhone ?? null,
        sellerPhone: call?.sellerPhone ?? null,
        callId: call?._id ?? null,
        invoiceId: invoice?._id ?? null,
      });
    }
    return { rows, shops: shops.map((s) => ({ _id: s._id, name: s.name, phone: s.phone })) };
  },
});

/** Attach an order (and its call) to an existing shop so it can be billed. */
export const attachShop = mutation({
  args: { orderId: v.id("orders"), shopId: v.id("shops") },
  handler: async (ctx, { orderId, shopId }) => {
    const order = await ctx.db.get(orderId);
    const shop = await ctx.db.get(shopId);
    if (!order || !shop) throw new Error("Order or shop not found");
    await ctx.db.patch(orderId, { shopId });
    const call = await ctx.db.get(order.callId);
    if (call && !call.shopId) await ctx.db.patch(call._id, { shopId });
    await ctx.runMutation(internal.audit.log, {
      actor: "owner", action: "order_shop_attached", entityType: "order", entityId: orderId,
      reason: `Owner attached this order to ${shop.name} from the dashboard`,
    });
  },
});

/** Create a shop for an unknown caller (their phone comes from the call) and attach the order to it. */
export const createShopForOrder = mutation({
  args: { orderId: v.id("orders"), name: v.string(), contactName: v.optional(v.string()) },
  handler: async (ctx, { orderId, name, contactName }) => {
    const order = await ctx.db.get(orderId);
    if (!order) throw new Error("Order not found");
    const call = await ctx.db.get(order.callId);
    const phone = normalizePhone(call?.buyerPhone);
    if (!name.trim()) throw new Error("Give the shop a name");
    const existing = phone ? await ctx.db.query("shops").withIndex("by_phone", (q) => q.eq("phone", phone)).first() : null;
    const shopId = existing?._id ?? (await ctx.db.insert("shops", {
      name: name.trim(),
      phone,
      contactName: contactName?.trim() || name.trim(),
      language: "en",
      paymentTermsDays: 14,
      autoApproveLimitCents: 5000,
    }));
    await ctx.db.patch(orderId, { shopId });
    if (call) await ctx.db.patch(call._id, { shopId });
    await ctx.runMutation(internal.audit.log, {
      actor: "owner", action: existing ? "order_shop_attached" : "shop_created_from_call", entityType: "order", entityId: orderId,
      reason: existing ? `Caller ${phone} already belonged to ${existing.name}; attached the order` : `Owner created shop "${name.trim()}" for caller ${phone} and attached the order`,
    });
    return shopId;
  },
});
