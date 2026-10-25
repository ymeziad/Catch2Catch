import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { normalizePhone, samePhone } from "./lib/phone";
import { twilioCredsFromEnv, twilioSendSms } from "./lib/twilio";

export const MAX_SMS_CHARS = 600;
const UNKNOWN_SENDER_REPLY = "We couldn't find an order for this number.";
const NO_PENDING_REPLY = "Thanks — there is no order waiting for your confirmation right now.";

// --------------------------------------------------------------------------- outbound

/**
 * Contract: internal.messaging.sendSms({ to, body, relatedType?, relatedId? })
 * Inserts a `messages` row and sends via Twilio. If sending fails or SMS is blocked
 * (A2P 10DLC, trial restrictions, missing creds), status = "simulated" so the dashboard still shows it.
 */
export const sendSms = internalAction({
  args: {
    to: v.string(),
    body: v.string(),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ messageId: Id<"messages">; status: "sent" | "simulated" | "failed"; twilioSid?: string }> => {
    const to = normalizePhone(args.to);
    const body = args.body.length > MAX_SMS_CHARS ? args.body.slice(0, MAX_SMS_CHARS - 1) + "…" : args.body;
    const creds = twilioCredsFromEnv();
    const simulate = process.env.SMS_SIMULATE === "1" || !creds;

    let status: "sent" | "simulated" | "failed" = "simulated";
    let twilioSid: string | undefined;
    let note = "";
    if (!simulate && creds) {
      try {
        const r = await twilioSendSms(creds, to, body);
        twilioSid = r.sid;
        status = "sent";
      } catch (e) {
        status = "simulated";
        note = e instanceof Error ? e.message : String(e);
        console.warn(`[sms] send failed, marking simulated: ${note}`);
      }
    } else {
      note = creds ? "SMS_SIMULATE=1" : "Twilio credentials not configured";
    }

    const messageId = await ctx.runMutation(internal.messaging.recordMessage, {
      direction: "out",
      to,
      from: creds?.fromNumber ?? "simulated",
      body,
      relatedType: args.relatedType,
      relatedId: args.relatedId,
      twilioSid,
      status,
    });
    await ctx.runMutation(internal.audit.log, {
      actor: "agent",
      action: status === "sent" ? "sms_sent" : "sms_simulated",
      entityType: args.relatedType ?? "message",
      entityId: args.relatedId ?? messageId,
      reason: status === "sent" ? `SMS sent to ${to}` : `SMS to ${to} recorded as simulated (${note})`,
      evidenceRefs: [{ type: "message", id: messageId, detail: body.slice(0, 120) }],
    });
    return { messageId, status, twilioSid };
  },
});

export const recordMessage = internalMutation({
  args: {
    direction: v.union(v.literal("out"), v.literal("in")),
    to: v.string(),
    from: v.string(),
    body: v.string(),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    twilioSid: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("simulated"), v.literal("failed"), v.literal("received")),
  },
  handler: async (ctx, args) => {
    if (args.twilioSid) {
      const dup = await ctx.db.query("messages").withIndex("by_twilioSid", (q) => q.eq("twilioSid", args.twilioSid)).first();
      if (dup) return dup._id; // Twilio retries webhooks; keep one row per MessageSid
    }
    return await ctx.db.insert("messages", { ...args, createdAt: Date.now() });
  },
});

// --------------------------------------------------------------------------- inbound routing

type Route = {
  party: "buyer" | "seller";
  knownSender: boolean;
  confirmOrderId: Id<"orders"> | null;
  latestOrderId: Id<"orders"> | null;
  shopId: Id<"shops"> | null;
};

/** Find who is texting and which order (if any) is waiting on them. */
export const findRouteForPhone = internalQuery({
  args: { fromPhone: v.string() },
  handler: async (ctx, { fromPhone }): Promise<Route> => {
    const from = normalizePhone(fromPhone);
    const sellerPhone = process.env.SELLER_PHONE;
    const pendingStatuses = new Set(["verbal_agreement", "needs_review"]);

    if (sellerPhone && samePhone(from, sellerPhone)) {
      const recent = await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "verbal_agreement")).order("desc").take(20);
      const review = await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "needs_review")).order("desc").take(20);
      const all = [...recent, ...review].sort((a, b) => b.createdAt - a.createdAt);
      const pending = all.find((o) => o.sellerConfirmedAt === undefined) ?? null;
      return { party: "seller", knownSender: true, confirmOrderId: pending?._id ?? null, latestOrderId: all[0]?._id ?? null, shopId: null };
    }

    const orders: Doc<"orders">[] = [];
    const calls = await ctx.db.query("calls").withIndex("by_buyerPhone", (q) => q.eq("buyerPhone", from)).order("desc").take(25);
    for (const c of calls) {
      const o = await ctx.db.query("orders").withIndex("by_callId", (q) => q.eq("callId", c._id)).first();
      if (o) orders.push(o);
    }
    const shop = from ? await ctx.db.query("shops").withIndex("by_phone", (q) => q.eq("phone", from)).first() : null;
    if (shop) {
      const byShop = await ctx.db.query("orders").withIndex("by_shopId", (q) => q.eq("shopId", shop._id)).order("desc").take(25);
      for (const o of byShop) if (!orders.some((x) => x._id === o._id)) orders.push(o);
    }
    orders.sort((a, b) => b.createdAt - a.createdAt);
    const pending = orders.find((o) => pendingStatuses.has(o.status) && o.buyerConfirmedAt === undefined) ?? null;
    return {
      party: "buyer",
      knownSender: Boolean(shop) || orders.length > 0 || calls.length > 0,
      confirmOrderId: pending?._id ?? null,
      latestOrderId: orders[0]?._id ?? null,
      shopId: shop?._id ?? null,
    };
  },
});

/** Have we already sent this exact reply to this number? (reply "once" rule) */
export const alreadySent = internalQuery({
  args: { to: v.string(), body: v.string() },
  handler: async (ctx, { to, body }) => {
    const recent = await ctx.db.query("messages").withIndex("by_to", (q) => q.eq("to", normalizePhone(to))).order("desc").take(20);
    return recent.some((m) => m.direction === "out" && m.body === body);
  },
});

const CONFIRM_WORDS = new Set(["CONFIRM", "CONFIRMED", "CONFIRMAR", "CONFIRMO", "YES", "SI", "SÍ"]);

export function classifyBody(body: string): "confirm" | "dispute" | "other" {
  const cleaned = body.trim().replace(/^[^\p{L}\p{N}]+/u, "");
  const first = (cleaned.split(/[\s,.!?:;]+/)[0] ?? "").toUpperCase();
  if (CONFIRM_WORDS.has(first)) return "confirm";
  if (first.startsWith("DISPUT")) return "dispute"; // DISPUTE, DISPUTA, DISPUTAR, DISPUTED
  return "other";
}

/**
 * Inbound SMS router (called from the /twilio/sms HTTP action after the inbound row is saved).
 *  - CONFIRM / YES / SI / SÍ  -> internal.orders.confirmOrder({ orderId, party })
 *  - DISPUTE or any other text from a shop -> internal.disputes.openFromSms({ fromPhone, body })
 *  - unknown sender -> reply once "We couldn't find an order for this number."
 */
export const routeInbound = internalAction({
  args: { fromPhone: v.string(), body: v.string(), messageId: v.id("messages") },
  handler: async (ctx, { fromPhone, body, messageId }): Promise<{ routed: string; orderId?: Id<"orders"> }> => {
    const from = normalizePhone(fromPhone);
    const route: Route = await ctx.runQuery(internal.messaging.findRouteForPhone, { fromPhone: from });
    const kind = classifyBody(body);
    const evidence = [{ type: "message", id: messageId, detail: body.slice(0, 120) }];

    if (!route.knownSender) {
      const dup = await ctx.runQuery(internal.messaging.alreadySent, { to: from, body: UNKNOWN_SENDER_REPLY });
      if (!dup) await ctx.runAction(internal.messaging.sendSms, { to: from, body: UNKNOWN_SENDER_REPLY, relatedType: "message", relatedId: messageId });
      await ctx.runMutation(internal.audit.log, {
        actor: "system", action: "sms_unknown_sender", entityType: "message", entityId: messageId,
        reason: `Inbound SMS from unknown number ${from}; ${dup ? "already replied earlier" : "replied once"}`, evidenceRefs: evidence,
      });
      return { routed: "unknown" as const };
    }

    if (kind === "confirm") {
      if (route.confirmOrderId) {
        await ctx.runMutation(internal.orders.confirmOrder, { orderId: route.confirmOrderId, party: route.party });
        await ctx.runMutation(internal.audit.log, {
          actor: "shop", action: "sms_confirm_routed", entityType: "order", entityId: route.confirmOrderId,
          reason: `${route.party} (${from}) replied CONFIRM`, evidenceRefs: evidence,
        });
        return { routed: "confirm" as const, orderId: route.confirmOrderId };
      }
      const dup = await ctx.runQuery(internal.messaging.alreadySent, { to: from, body: NO_PENDING_REPLY });
      if (!dup) await ctx.runAction(internal.messaging.sendSms, { to: from, body: NO_PENDING_REPLY, relatedType: "message", relatedId: messageId });
      await ctx.runMutation(internal.audit.log, {
        actor: "system", action: "sms_confirm_no_pending_order", entityType: "message", entityId: messageId,
        reason: `${route.party} (${from}) replied CONFIRM but no order is awaiting their confirmation`, evidenceRefs: evidence,
      });
      return { routed: "confirm_no_order" as const };
    }

    // DISPUTE or free text. Shops go to disputes; the seller's free text is only logged.
    if (route.party === "seller" && kind !== "dispute") {
      await ctx.runMutation(internal.audit.log, {
        actor: "system", action: "sms_seller_note", entityType: "message", entityId: messageId,
        reason: `Free-text SMS from seller (${from}) logged, not routed to disputes`, evidenceRefs: evidence,
      });
      return { routed: "seller_note" as const };
    }
    await ctx.runMutation(internal.disputes.openFromSms, { fromPhone: from, body });
    await ctx.runMutation(internal.audit.log, {
      actor: "shop", action: kind === "dispute" ? "sms_dispute_routed" : "sms_freetext_routed_to_disputes",
      entityType: route.latestOrderId ? "order" : "message", entityId: route.latestOrderId ?? messageId,
      reason: `${route.party} (${from}) texted ${kind === "dispute" ? "DISPUTE" : "free text"}; routed to disputes.openFromSms`, evidenceRefs: evidence,
    });
    return { routed: "dispute" as const };
  },
});

// --------------------------------------------------------------------------- dashboard

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => ctx.db.query("messages").withIndex("by_createdAt").order("desc").take(limit ?? 100),
});
