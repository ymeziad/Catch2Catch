import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { splitWavChannels } from "./lib/wav";
import { transcribe, transcribeChannel, type Segment } from "./lib/stt";

type RoleSegment = { role: "buyer" | "seller"; startMs: number; endMs: number; text: string; confidence?: number; faint?: boolean };

/**
 * Step 4 — transcription. Loads the stored WAV, separates channels
 * (Twilio dual-channel: channel 1 = inbound caller = buyer, channel 2 = dialed party = seller),
 * transcribes each channel with Grok, saves transcriptSegments with the right role,
 * sets status "analyzing" and triggers internal.orders.analyzeCall.
 */
const RETRY_DELAYS_MS = [20_000, 60_000, 180_000];

export const transcribeCall = internalAction({
  args: { callId: v.id("calls"), attempt: v.optional(v.number()) },
  handler: async (ctx, { callId, attempt }): Promise<{ count: number }> => {
    const call = await ctx.runQuery(internal.calls.get, { callId });
    if (!call) throw new Error(`call ${callId} not found`);
    if (!call.recordingFileId) throw new Error(`call ${callId} has no recording`);
    try {
      await ctx.runMutation(internal.calls.setStatus, { callId, status: "transcribing" });
      const blob = await ctx.storage.get(call.recordingFileId);
      if (!blob) throw new Error("recording file missing from storage");
      const buf = await blob.arrayBuffer();

      let segments: RoleSegment[];
      let note: string;
      const { info, channels } = splitWavChannels(buf);
      if (info.channels >= 2) {
        const [buyer, seller] = await Promise.all([
          transcribeChannel(channels[0], "buyer"),
          transcribeChannel(channels[1], "seller"),
        ]);
        segments = [...withRole(buyer, "buyer"), ...withRole(seller, "seller")];
        note = `dual-channel: ${buyer.length} buyer + ${seller.length} seller segments`;
      } else {
        // Mono fallback (e.g. an uploaded single-track test file): diarize and map
        // speaker 0 -> buyer, everyone else -> seller. Roles are a best guess here.
        const diarized = await transcribe(new Blob([buf], { type: "audio/wav" }), "buyer", { diarize: true });
        segments = diarized.map((s) => ({ ...strip(s), role: s.speaker && s.speaker > 0 ? "seller" : "buyer" }));
        note = `mono recording: diarized into ${segments.length} segments (roles inferred, not channel-separated)`;
      }

      const count: number = await ctx.runMutation(internal.transcripts.replaceForCall, { callId, segments });
      await ctx.runMutation(internal.calls.setStatus, { callId, status: "analyzing", error: note.startsWith("mono") ? note : undefined });
      await ctx.runMutation(internal.audit.log, {
        actor: "system",
        action: "transcript_saved",
        entityType: "call",
        entityId: callId,
        reason: `${count} transcript segments saved (${note}); handing off to order analysis`,
        evidenceRefs: [{ type: "storage", id: call.recordingFileId, detail: `${info.channels}ch ${info.sampleRate}Hz` }],
      });
      await ctx.scheduler.runAfter(0, internal.orders.analyzeCall, { callId });
      return { count };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const n = attempt ?? 1;
      console.error(`[transcription] attempt ${n}: ${msg}`);
      if (n < RETRY_DELAYS_MS.length + 1) {
        await ctx.runMutation(internal.calls.setStatus, { callId, status: "transcribing", error: `attempt ${n} failed, retrying: ${msg}` });
        await ctx.runMutation(internal.audit.log, {
          actor: "system", action: "transcription_retry", entityType: "call", entityId: callId, reason: `Attempt ${n} failed (${msg}); retrying`,
        });
        await ctx.scheduler.runAfter(RETRY_DELAYS_MS[n - 1], internal.transcription.transcribeCall, { callId, attempt: n + 1 });
        return { count: 0 };
      }
      await ctx.runMutation(internal.calls.setStatus, { callId, status: "failed", error: msg });
      await ctx.runMutation(internal.audit.log, {
        actor: "system", action: "transcription_failed", entityType: "call", entityId: callId, reason: msg,
      });
      await ctx.runAction(internal.messaging.sendCallNotice, {
        callId,
        body: "Catch2Catch: your call was recorded, but the speech-to-text service failed, so there is no written summary yet. The recording is saved and the owner can play it on the dashboard.",
      });
      return { count: 0 };
    }
  },
});

function strip(s: Segment) {
  return { startMs: s.startMs, endMs: s.endMs, text: s.text, confidence: s.confidence, ...(s.faint ? { faint: true } : {}) };
}
function withRole(segs: Segment[], role: "buyer" | "seller"): RoleSegment[] {
  return segs.map((s) => ({ ...strip(s), role }));
}
