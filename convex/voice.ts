import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { textKey } from "./lib/hash";

/**
 * "Read it to me": turns a page's words into natural speech with ElevenLabs
 * (multilingual, so the same voice reads English and Spanish). Clips are cached in storage,
 * so reading the same words again costs nothing. Needs ELEVENLABS_API_KEY in Convex.
 */

const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // "George": warm, clear, unhurried
const VOICE_MODEL = "eleven_multilingual_v2";

export const findClip = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => (await ctx.db.query("voiceClips").withIndex("by_key", (q) => q.eq("key", key)).first())?.storageId ?? null,
});

export const saveClip = internalMutation({
  args: { key: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.db.insert("voiceClips", args);
  },
});

export const speak = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<string> => {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 1500);
    if (!clean) throw new Error("There's nothing to read on this page.");
    const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
    const key = textKey(`${voice}`, clean);

    const hit = await ctx.runQuery(internal.voice.findClip, { key });
    if (hit) {
      const url = await ctx.storage.getUrl(hit);
      if (url) return url;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("The voice isn't set up yet. Add the ElevenLabs key in Convex (ELEVENLABS_API_KEY).");
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: clean, model_id: VOICE_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!res.ok) {
      console.error("ElevenLabs error", res.status, (await res.text()).slice(0, 300));
      throw new Error(res.status === 401
        ? "ElevenLabs turned the key down. Check the key, and that it's allowed to use Text to Speech."
        : `The voice service didn't answer (error ${res.status}). Try again in a moment.`);
    }
    const audio = await res.arrayBuffer();
    const storageId = await ctx.storage.store(new Blob([audio], { type: "audio/mpeg" }));
    await ctx.runMutation(internal.voice.saveClip, { key, storageId });
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("The recording couldn't be saved. Try again.");
    return url;
  },
});
