import { query } from "./_generated/server";
import { v } from "convex/values";

/** Dashboard read of the messages table (writes live in messaging.ts). */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => ctx.db.query("messages").withIndex("by_createdAt").order("desc").take(limit ?? 100),
});
