import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

/**
 * OWNER: Amaan. "Try it out" -> "Send as shop": Claude checks the text first.
 * Nonsense, rude or off-topic texts are blocked with a reason (shown as a pop-up); real ones go through
 * the same path as a real inbound SMS.
 */
export const sendShopText = action({
  args: { shopId: v.id("shops"), body: v.string() },
  handler: async (ctx, { shopId, body }): Promise<{ blocked: boolean; reason?: string }> => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-5-5",
            max_tokens: 200,
            system:
              "A shop that buys drinks wholesale (Coca-Cola, Dr Pepper, Celsius, horchata) is texting its distributor. Decide if the text is acceptable to log as a complaint or question about an order. Block it if it is ONLY spam, gibberish, jokes, insults, sexual content, or about things a drink distributor doesn't sell. Allow it if it contains any genuine order issue, even if other parts are junk (those parts will be dropped later). Reply with JSON only: {\"allowed\": true|false, \"reason\": \"one short plain sentence for the owner\"}.",
            messages: [{ role: "user", content: body }],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { content: { type: string; text?: string }[] };
          const raw = data.content.find((c) => c.type === "text")?.text ?? "";
          const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { allowed: boolean; reason?: string };
          if (json.allowed === false) return { blocked: true, reason: json.reason ?? "This message isn't about an order." };
        }
      } catch {
        // If the check itself fails, let the message through; the dispute analysis still filters junk.
      }
    }
    await ctx.runMutation(api.seed.simulateShopText, { shopId, body });
    return { blocked: false };
  },
});
