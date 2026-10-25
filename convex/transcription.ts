import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { splitWavChannels } from "./lib/wav";
import { transcribe, transcribeChannel, type Segment } from "./lib/stt";

type RoleSegment = { role: "buyer" | "seller"; startMs: number; endMs: number; text: string; confidence?: number };

/**
 * Step 4 — transcription. Loads the stored WAV, separates channels
 * (Twilio dual-channel: channel 1 = inbound caller = buyer, channel 2 = dialed party = seller),
 * transcribes each channel with Grok, saves transcriptSegments with the right role,
 * sets status "analyzing" and triggers internal.orders.analyzeCall.
 */
export const transcribeCall = internalAction({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }): Promise<{ count: number }> => {
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
      console.error(`[transcription] ${msg}`);
      await ctx.runMutation(internal.calls.setStatus, { callId, status: "failed", error: msg });
      await ctx.runMutation(internal.audit.log, {
        actor: "system", action: "transcription_failed", entityType: "call", entityId: callId, reason: msg,
      });
      throw e;
    }
  },
});

function strip(s: Segment) {
  return { startMs: s.startMs, endMs: s.endMs, text: s.text, confidence: s.confidence };
}
function withRole(segs: Segment[], role: "buyer" | "seller"): RoleSegment[] {
  return segs.map((s) => ({ ...strip(s), role }));
}
