import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * OWNER: Person 3. Minimal working implementation so everyone can log from day one.
 * Contract: internal.audit.log({ actor, action, entityType, entityId, reason, evidenceRefs? })
 */
export const log = internalMutation({
  args: {
    actor: v.union(v.literal("agent"), v.literal("owner"), v.literal("packer"), v.literal("system"), v.literal("shop")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    reason: v.string(),
    evidenceRefs: v.optional(v.array(v.object({ type: v.string(), id: v.string(), detail: v.optional(v.string()) }))),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLog", { ...args, at: Date.now() });
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db.query("auditLog").withIndex("by_at").order("desc").take(limit ?? 100);
  },
});
