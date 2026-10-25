import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * OWNER: Person 3. STUB with the agreed signature. Person 1's SMS router calls this on
 * DISPUTE or any free-text reply from a shop about an existing order/invoice.
 */
export const openFromSms = internalMutation({
  args: { fromPhone: v.string(), body: v.string() },
  handler: async (ctx, { fromPhone, body }) => {
    console.log(`[stub] internal.disputes.openFromSms from ${fromPhone}: ${body.slice(0, 80)}`);
    await ctx.db.insert("auditLog", {
      actor: "shop",
      action: "dispute_sms_received_stub",
      entityType: "phone",
      entityId: fromPhone,
      reason: `Inbound SMS routed to disputes.openFromSms (stub): "${body.slice(0, 160)}"`,
      at: Date.now(),
    });
  },
});
