import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { twilioCredsFromEnv, twilioDownloadRecordingWav } from "./lib/twilio";

/**
 * Step 3 — recording to storage. Scheduled by the /twilio/recording webhook when
 * RecordingStatus=completed and BOTH parties consented. Downloads the dual-channel WAV
 * from Twilio, stores it in Convex file storage, then hands off to transcription.
 */
const RETRY_DELAYS_MS = [15_000, 60_000, 180_000];

export const ingest = internalAction({
  args: { callId: v.id("calls"), recordingSid: v.string(), recordingUrl: v.string(), attempt: v.optional(v.number()) },
  handler: async (ctx, { callId, recordingSid, recordingUrl, attempt }) => {
    try {
      const creds = twilioCredsFromEnv();
      if (!creds) throw new Error("Twilio credentials missing; cannot download recording");
      const wav = await twilioDownloadRecordingWav(creds, recordingUrl);
      const fileId = await ctx.storage.store(wav);
      await ctx.runMutation(internal.calls.markRecorded, { callId, recordingSid, recordingFileId: fileId });
      await ctx.runMutation(internal.audit.log, {
        actor: "system",
        action: "recording_stored",
        entityType: "call",
        entityId: callId,
        reason: `Dual-channel recording ${recordingSid} downloaded from Twilio (${Math.round(wav.size / 1024)} KB) and stored`,
        evidenceRefs: [{ type: "recording", id: recordingSid, detail: `storage:${fileId}` }],
      });
      await ctx.scheduler.runAfter(0, internal.transcription.transcribeCall, { callId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const n = attempt ?? 1;
      console.error(`[recordings.ingest] attempt ${n}: ${msg}`);
      if (n < RETRY_DELAYS_MS.length + 1) {
        // Twilio sometimes needs a moment before the file is downloadable; try again.
        await ctx.scheduler.runAfter(RETRY_DELAYS_MS[n - 1], internal.recordings.ingest, { callId, recordingSid, recordingUrl, attempt: n + 1 });
        await ctx.runMutation(internal.audit.log, {
          actor: "system", action: "recording_ingest_retry", entityType: "call", entityId: callId, reason: `Download attempt ${n} failed (${msg}); retrying`,
        });
        return;
      }
      await ctx.runMutation(internal.calls.setStatus, { callId, status: "failed", error: msg, endedAt: Date.now() });
      await ctx.runMutation(internal.audit.log, {
        actor: "system", action: "recording_ingest_failed", entityType: "call", entityId: callId, reason: msg,
      });
      await ctx.runAction(internal.messaging.sendCallNotice, {
        callId,
        body: "Catch2Catch: your call was recorded, but we couldn't download the recording to write the summary. The owner can see the call on the dashboard.",
      });
    }
  },
});
