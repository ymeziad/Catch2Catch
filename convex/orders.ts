import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * OWNER: Person 2 (order brain). These are STUBS with the agreed names and arguments
 * so Yosef's pipeline compiles and runs end to end. Replace the bodies, keep the signatures.
 */

/** Called by Yosef once transcript segments are saved and the call is in status "analyzing". */
export const analyzeCall = internalAction({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) => {
    console.log(`[stub] internal.orders.analyzeCall(${callId}) — Person 2 to implement Claude analysis`);
    await ctx.runMutation(internal.audit.log, {
      actor: "system",
      action: "analyze_call_stub",
      entityType: "call",
      entityId: callId,
      reason: "analyzeCall stub invoked; transcript ready for Claude analysis",
    });
  },
});

/** Called by Yosef's inbound SMS router on CONFIRM. */
export const confirmOrder = internalMutation({
  args: { orderId: v.id("orders"), party: v.union(v.literal("buyer"), v.literal("seller")) },
  handler: async (ctx, { orderId, party }) => {
    const order = await ctx.db.get(orderId);
    if (!order) return;
    const now = Date.now();
    const patch: Record<string, unknown> = {};
    if (party === "buyer") patch.buyerConfirmedAt = now;
    else patch.sellerConfirmedAt = now;
    const buyerDone = party === "buyer" || order.buyerConfirmedAt !== undefined;
    const sellerDone = party === "seller" || order.sellerConfirmedAt !== undefined;
    if (buyerDone && sellerDone && order.status === "verbal_agreement") {
      patch.status = "confirmed";
    }
    await ctx.db.patch(orderId, patch);
    await ctx.db.insert("auditLog", {
      actor: "shop",
      action: `order_confirmed_by_${party}`,
      entityType: "order",
      entityId: orderId,
      reason: `${party} replied CONFIRM by SMS`,
      at: now,
    });
    if (patch.status === "confirmed") {
      await ctx.runMutation(internal.billing.createInvoiceForOrder, { orderId });
    }
  },
});
