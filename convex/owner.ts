import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { demoNow } from "./lib/clock";

/** The owner's own settings: the dashboard language (also used by the voice). */

export type Lang = "en" | "es";

export async function ownerLang(ctx: QueryCtx): Promise<Lang> {
  const s = await ctx.db.query("settings").first();
  return s?.ownerLang === "es" ? "es" : "en";
}

export const prefs = query({
  args: {},
  handler: async (ctx) => ({ lang: await ownerLang(ctx) }),
});

export const setLang = mutation({
  args: { lang: v.union(v.literal("en"), v.literal("es")) },
  handler: async (ctx, { lang }) => {
    let s = await ctx.db.query("settings").first();
    if (!s) {
      const id = await ctx.db.insert("settings", { demoClockOffsetMs: 0, ownerPhone: process.env.OWNER_PHONE ?? "" });
      s = (await ctx.db.get(id))!;
    }
    if (s.ownerLang === lang) return;
    await ctx.db.patch(s._id, { ownerLang: lang });
    await ctx.db.insert("auditLog", {
      actor: "owner", action: "language_changed", entityType: "settings", entityId: s._id,
      reason: lang === "es" ? "Switched the app to Spanish" : "Switched the app to English", at: await demoNow(ctx),
    });
  },
});
