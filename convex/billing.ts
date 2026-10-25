import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/** OWNER: Person 3. STUB — called by orders.confirmOrder when both parties confirmed. */
export const createInvoiceForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    console.log(`[stub] internal.billing.createInvoiceForOrder(${orderId})`);
    await ctx.db.insert("auditLog", {
      actor: "system",
      action: "create_invoice_stub",
      entityType: "order",
      entityId: orderId,
      reason: "createInvoiceForOrder stub invoked",
      at: Date.now(),
    });
  },
});
