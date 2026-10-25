import { action, mutation } from "./_generated/server";
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
