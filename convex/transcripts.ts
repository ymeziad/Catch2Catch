import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const segment = v.object({
  role: v.union(v.literal("buyer"), v.literal("seller")),
  startMs: v.number(),
  endMs: v.number(),
  text: v.string(),
  confidence: v.optional(v.number()),
  faint: v.optional(v.boolean()),
});

/** Replace all segments for a call (idempotent so a re-run of the pipeline doesn't duplicate). */
export const replaceForCall = internalMutation({
  args: { callId: v.id("calls"), segments: v.array(segment) },
  handler: async (ctx, { callId, segments }) => {
    const existing = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_callId", (q) => q.eq("callId", callId))
      .collect();
    for (const s of existing) await ctx.db.delete(s._id);
    const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
    for (const s of sorted) await ctx.db.insert("transcriptSegments", { callId, ...s });
    return sorted.length;
  },
});

export const byCall = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) =>
    ctx.db.query("transcriptSegments").withIndex("by_callId", (q) => q.eq("callId", callId)).collect(),
});
