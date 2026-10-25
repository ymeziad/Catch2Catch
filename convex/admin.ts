import { action, internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * Step 7 — demo safety net. If the live call fails during judging, upload a recording and
 * run Steps 3–4 (storage -> transcription -> analyzeCall) on it.
 * NOTE: these are public for the hackathon demo; put auth in front of them before any real use.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const runPipelineOnUpload = action({
  args: { fileId: v.id("_storage"), buyerPhone: v.string(), sellerPhone: v.string() },
  handler: async (ctx, { fileId, buyerPhone, sellerPhone }): Promise<{ callId: Id<"calls"> }> => {
    const callId: Id<"calls"> = await ctx.runMutation(internal.calls.createFromUpload, { buyerPhone, sellerPhone, recordingFileId: fileId });
    await ctx.runMutation(internal.audit.log, {
      actor: "owner",
      action: "pipeline_run_on_upload",
      entityType: "call",
      entityId: callId,
      reason: "Owner uploaded a recording and ran the transcription pipeline manually",
      evidenceRefs: [{ type: "storage", id: fileId }],
    });
    // Run inline so the UI can show failures immediately.
    await ctx.runAction(internal.transcription.transcribeCall, { callId });
    return { callId };
  },
});

/** Send a test SMS (shows up in `messages` as sent or simulated). */
export const sendTestSms = action({
  args: { to: v.string(), body: v.string() },
  handler: async (ctx, { to, body }): Promise<{ status: string }> => {
    const r = await ctx.runAction(internal.messaging.sendSms, { to, body, relatedType: "test" });
    return { status: r.status };
  },
});

/**
 * Remove data created by the call eval (evals/run-eval.mjs): calls whose twilioCallSid starts with
 * "eval-", their transcript, orders, order events, messages and reminders, and the "Eval Shop" rows.
 * Real calls and demo data are untouched. Run: npx convex run admin:removeEvalData
 */
export const removeEvalData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts = { calls: 0, segments: 0, orders: 0, events: 0, messages: 0, reminders: 0, shops: 0 };
    const calls = (await ctx.db.query("calls").order("desc").take(500)).filter((c) => c.twilioCallSid.startsWith("eval-"));
    for (const call of calls) {
      for (const s of await ctx.db.query("transcriptSegments").withIndex("by_callId", (q) => q.eq("callId", call._id)).take(500)) {
        await ctx.db.delete(s._id); counts.segments++;
      }
      for (const o of await ctx.db.query("orders").withIndex("by_callId", (q) => q.eq("callId", call._id)).take(10)) {
        for (const e of await ctx.db.query("orderEvents").withIndex("by_orderId", (q) => q.eq("orderId", o._id)).take(500)) {
          await ctx.db.delete(e._id); counts.events++;
        }
        for (const r of await ctx.db.query("reminders").withIndex("by_orderId", (q) => q.eq("orderId", o._id)).take(50)) {
          await ctx.db.delete(r._id); counts.reminders++;
        }
        for (const m of (await ctx.db.query("messages").withIndex("by_createdAt").order("desc").take(1000)).filter((m) => m.relatedId === o._id)) {
          await ctx.db.delete(m._id); counts.messages++;
        }
        await ctx.db.delete(o._id); counts.orders++;
      }
      await ctx.db.delete(call._id); counts.calls++;
    }
    for (const shop of (await ctx.db.query("shops").take(500)).filter((s) => s.name.startsWith("Eval Shop"))) {
      await ctx.db.delete(shop._id); counts.shops++;
    }
    return counts;
  },
});
