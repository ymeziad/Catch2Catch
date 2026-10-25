import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { twilioCredsFromEnv, twilioDownloadRecordingWav } from "./lib/twilio";

/**
 * Step 3 — recording to storage. Scheduled by the /twilio/recording webhook when
 * RecordingStatus=completed and BOTH parties consented. Downloads the dual-channel WAV
 * from Twilio, stores it in Convex file storage, then hands off to transcription.
 */
export const ingest = internalAction({
  args: { callId: v.id("calls"), recordingSid: v.string(), recordingUrl: v.string() },
  handler: async (ctx, { callId, recordingSid, recordingUrl }) => {
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
      await ctx.runAction(internal.transcription.transcribeCall, { callId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[recordings.ingest] ${msg}`);
      await ctx.runMutation(internal.calls.setStatus, { callId, status: "failed", error: msg, endedAt: Date.now() });
      await ctx.runMutation(internal.audit.log, {
        actor: "system", action: "recording_ingest_failed", entityType: "call", entityId: callId, reason: msg,
      });
    }
  },
});
