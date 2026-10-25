import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { normalizePhone } from "./lib/phone";

const callStatus = v.union(
  v.literal("in_progress"),
  v.literal("recorded"),
  v.literal("transcribing"),
  v.literal("analyzing"),
  v.literal("done"),
  v.literal("failed"),
);

/** Buyer pressed 1: create the call row. Seller consent is still false. */
export const create = internalMutation({
  args: { twilioCallSid: v.string(), buyerPhone: v.string(), sellerPhone: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calls")
      .withIndex("by_twilioCallSid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .unique();
    if (existing) return existing._id;
    const buyerPhone = normalizePhone(args.buyerPhone);
    const shop = buyerPhone
      ? await ctx.db.query("shops").withIndex("by_phone", (q) => q.eq("phone", buyerPhone)).first()
      : null;
    return await ctx.db.insert("calls", {
      twilioCallSid: args.twilioCallSid,
      buyerPhone,
      sellerPhone: normalizePhone(args.sellerPhone),
      shopId: shop?._id,
      buyerConsent: true,
      sellerConsent: false,
      status: "in_progress",
      startedAt: Date.now(),
    });
  },
});

/** Demo safety net: a call created from an uploaded recording (both consents are implied by the upload). */
export const createFromUpload = internalMutation({
  args: { buyerPhone: v.string(), sellerPhone: v.string(), recordingFileId: v.id("_storage") },
  handler: async (ctx, args) => {
    const buyerPhone = normalizePhone(args.buyerPhone);
    const shop = buyerPhone
      ? await ctx.db.query("shops").withIndex("by_phone", (q) => q.eq("phone", buyerPhone)).first()
      : null;
    const now = Date.now();
    return await ctx.db.insert("calls", {
      twilioCallSid: `upload-${now}-${Math.random().toString(36).slice(2, 8)}`,
      buyerPhone,
      sellerPhone: normalizePhone(args.sellerPhone),
      shopId: shop?._id,
      buyerConsent: true,
      sellerConsent: true,
      recordingFileId: args.recordingFileId,
      status: "recorded",
      startedAt: now,
      endedAt: now,
    });
  },
});

export const getBySid = internalQuery({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, { twilioCallSid }) => {
    return await ctx.db
      .query("calls")
      .withIndex("by_twilioCallSid", (q) => q.eq("twilioCallSid", twilioCallSid))
      .unique();
  },
});

export const get = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) => ctx.db.get(callId),
});

export const setSellerConsent = internalMutation({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, { twilioCallSid }) => {
    const call = await ctx.db
      .query("calls")
      .withIndex("by_twilioCallSid", (q) => q.eq("twilioCallSid", twilioCallSid))
      .unique();
    if (!call) return null;
    await ctx.db.patch(call._id, { sellerConsent: true });
    return call._id;
  },
});

export const markRecorded = internalMutation({
  args: { callId: v.id("calls"), recordingSid: v.string(), recordingFileId: v.id("_storage") },
  handler: async (ctx, { callId, recordingSid, recordingFileId }) => {
    await ctx.db.patch(callId, { recordingSid, recordingFileId, status: "recorded", endedAt: Date.now() });
  },
});

export const setStatus = internalMutation({
  args: { callId: v.id("calls"), status: callStatus, error: v.optional(v.string()), endedAt: v.optional(v.number()) },
  handler: async (ctx, { callId, status, error, endedAt }) => {
    const patch: Record<string, unknown> = { status };
    if (error !== undefined) patch.error = error;
    if (endedAt !== undefined) patch.endedAt = endedAt;
    await ctx.db.patch(callId, patch);
  },
});

// ------------------------------------------------------------- public (dashboard)

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db.query("calls").withIndex("by_startedAt").order("desc").take(limit ?? 50);
  },
});

export const getWithTranscript = query({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) => {
    const call = await ctx.db.get(callId);
    if (!call) return null;
    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_callId", (q) => q.eq("callId", callId))
      .collect();
    const order = await ctx.db.query("orders").withIndex("by_callId", (q) => q.eq("callId", callId)).first();
    const recordingUrl = call.recordingFileId ? await ctx.storage.getUrl(call.recordingFileId) : null;
    return { call, segments, order, recordingUrl };
  },
});
