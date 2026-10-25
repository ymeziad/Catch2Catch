import { action, internalMutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { textKey } from "./lib/hash";

/**
 * Spanish for text the app doesn't know ahead of time (AI summaries, shop texts, history lines).
 * Fixed screen wording lives in components/i18n.tsx; this covers everything else. Each text is translated
 * by Claude once and cached in `translations`, so switching languages again is instant and free.
 */

const MODEL = "claude-sonnet-5-5";

export const cached = query({
  args: { lang: v.string(), texts: v.array(v.string()) },
  handler: async (ctx, { lang, texts }) => {
    // A list of pairs, not an object: Convex field names can't hold arbitrary text.
    const out: { source: string; text: string }[] = [];
    for (const t of [...new Set(texts)].slice(0, 400)) {
      const row = await ctx.db.query("translations").withIndex("by_key", (q) => q.eq("key", textKey(lang, t))).first();
      if (row && row.source === t) out.push({ source: t, text: row.text });
    }
    return out;
  },
});

export const save = internalMutation({
  args: { lang: v.string(), pairs: v.array(v.object({ source: v.string(), text: v.string() })) },
  handler: async (ctx, { lang, pairs }) => {
    for (const p of pairs) {
      const key = textKey(lang, p.source);
      const existing = await ctx.db.query("translations").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (!existing) await ctx.db.insert("translations", { key, lang, source: p.source, text: p.text });
    }
  },
});

export const translateMany = action({
  args: { lang: v.string(), texts: v.array(v.string()) },
  handler: async (ctx, { lang, texts }): Promise<number> => {
    if (lang !== "es") return 0;
    const have = new Set((await ctx.runQuery(api.translate.cached, { lang, texts })).map((p) => p.source));
    const missing = [...new Set(texts)].filter((t) => t.trim() && !have.has(t)).slice(0, 40);
    const key = process.env.ANTHROPIC_API_KEY;
    if (missing.length === 0 || !key) return 0;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system:
          "You translate screen text for the owner of a small drink distributor into natural, simple Latin American Spanish. " +
          "The reader is an older shop owner who is not comfortable with technology, so use everyday words and \"usted\". " +
          "Translate each text faithfully: same meaning, same tone, same punctuation. Do not summarize, explain or add anything. " +
          "Keep shop names, people's names, product names (Dr Pepper, Coca-Cola), dollar amounts, numbers and dates exactly as written. " +
          "\"C2C\" and \"Catch2Catch\" stay as they are. If a text is already in Spanish, return it unchanged. " +
          "Respond only by calling the save_translations tool, with one translation per text, in the same order.",
        tools: [{
          name: "save_translations",
          description: "Return the Spanish translations, one per input text, in the same order.",
          input_schema: { type: "object", properties: { translations: { type: "array", items: { type: "string" } } }, required: ["translations"] },
        }],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: JSON.stringify({ texts: missing }) }],
      }),
    });
    if (!res.ok) {
      console.error("translate failed", res.status, (await res.text()).slice(0, 300));
      return 0;
    }
    const data = (await res.json()) as { content: { type: string; input?: { translations?: unknown } }[] };
    const out = data.content.find((c) => c.type === "tool_use")?.input?.translations;
    if (!Array.isArray(out)) return 0;
    const pairs = missing
      .map((source, i) => ({ source, text: typeof out[i] === "string" ? (out[i] as string).trim() : "" }))
      .filter((p) => p.text);
    await ctx.runMutation(internal.translate.save, { lang, pairs });
    return pairs.length;
  },
});
