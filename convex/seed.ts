import { action, internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { DAY, HOUR, demoNow } from "./lib/clock";
import { normalizePhone } from "./lib/phone";
import { pair, postEntryGroup } from "./ledger";

/**
 * Synthetic demo data only — no real customers. 555-01xx numbers are reserved for fiction.
 *
 *   npx convex run seed:seedDemo                       # settings row + 3 shops (+ history for the late payer)
 *   npx convex run seed:setShopPhone '{"name":"Corner Market","phone":"+1..."}'   # point a shop at a real test phone
 *
 * The dashboard's "Create demo order" button calls seed:createDemoOrder.
 */

export const SHOPS = [
  { key: "en", name: "Corner Market", contactName: "Dana", language: "en", phone: "+15555550101", paymentTermsDays: 14, autoApproveLimitCents: 5000 },
  { key: "es", name: "Tienda La Esperanza", contactName: "Rosa", language: "es", phone: "+15555550102", paymentTermsDays: 14, autoApproveLimitCents: 5000 },
  { key: "late", name: "Quick Stop Deli", contactName: "Mike", language: "en", phone: "+15555550103", paymentTermsDays: 7, autoApproveLimitCents: 5000 },
] as const;

export const DEMO_LINES = [
  { sku: "COKE-12OZ-24", description: "Coca-Cola Classic 12 oz can", qty: 5, unit: "case", unitPriceCents: 1450 },
  { sku: "DRP-12OZ-24", description: "Dr Pepper 12 oz can", qty: 5, unit: "case", unitPriceCents: 1400 },
  { sku: "HORCH-1L-12", description: "Horchata 1 L carton", qty: 2, unit: "case", unitPriceCents: 2200 },
];
const BARCODES: Record<string, string> = { "COKE-12OZ-24": "049000006346", "DRP-12OZ-24": "078000082401", "HORCH-1L-12": "810000000012", "CELS-12OZ-12": "889392000016" };

export const seedDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const created: string[] = [];
    if (!(await ctx.db.query("settings").first())) {
      await ctx.db.insert("settings", { demoClockOffsetMs: 0, ownerPhone: process.env.OWNER_PHONE ?? "" });
      created.push("settings");
    }
    const now = await demoNow(ctx);
    for (const s of SHOPS) {
      const existing = await ctx.db.query("shops").withIndex("by_phone", (q) => q.eq("phone", s.phone)).first();
      if (existing) continue;
      const { key, ...shop } = s;
      const shopId = await ctx.db.insert("shops", shop);
      created.push(shop.name);
      if (key === "late") await seedLatePayerHistory(ctx, shopId, now);
    }
    await ctx.db.insert("auditLog", { actor: "system", action: "seeded", entityType: "settings", entityId: "seed", reason: created.length ? `Seeded: ${created.join(", ")}` : "Seed run: nothing new to add", at: now });
    return created;
  },
});

/** Quick Stop Deli: two invoices paid late and two past disputes in the last 90 days. */
async function seedLatePayerHistory(ctx: MutationCtx, shopId: Id<"shops">, now: number) {
  const shop = (await ctx.db.get(shopId))!;
  for (const [daysAgo, daysLate] of [[60, 9], [30, 6]] as const) {
    const issuedAt = now - daysAgo * DAY;
    const { orderId } = await insertOrder(ctx, shopId, shop.phone, DEMO_LINES.slice(0, 2), issuedAt, "confirmed");
    const amount = 1450 * 5 + 1400 * 5;
    const dueAt = issuedAt + shop.paymentTermsDays * DAY;
    const invoiceId = await ctx.db.insert("invoices", { orderId, shopId, amountCents: amount, balanceCents: 0, issuedAt, dueAt, status: "paid" });
    await postEntryGroup(ctx, pair("accounts_receivable", "sales", amount), "invoice", invoiceId, "Seed history: invoice", issuedAt);
    const paymentId = await ctx.db.insert("payments", { invoiceId, amountCents: amount, method: "check", receivedAt: dueAt + daysLate * DAY, note: "seed history: paid late" });
    await postEntryGroup(ctx, pair("cash", "accounts_receivable", amount), "payment", paymentId, "Seed history: late payment", dueAt + daysLate * DAY);
    await ctx.db.insert("disputes", {
      invoiceId, orderId, shopId, shopMessage: "Missing 2 cases of coke", claimedItems: [{ sku: "COKE-12OZ-24", qty: 2, reason: "says missing" }],
      recommendation: "reject_with_evidence", reasoning: "Seed history: packing scan matched the order.", evidenceRefs: [], amountCents: 0,
      status: "approved", requestedBy: "shop", decidedBy: "owner", decidedAt: issuedAt + 3 * DAY,
    });
  }
}

type Line = { sku: string; description: string; qty: number; unit: string; unitPriceCents: number };

async function insertOrder(ctx: MutationCtx, shopId: Id<"shops">, buyerPhone: string, lines: Line[], at: number, status: "confirmed" | "verbal_agreement") {
  const callId = await ctx.db.insert("calls", {
    twilioCallSid: `DEMO-${Math.random().toString(36).slice(2, 10)}`, buyerPhone, sellerPhone: process.env.SELLER_PHONE ?? "+15555550100", shopId,
    buyerConsent: true, sellerConsent: true, status: "done", startedAt: at - 10 * 60 * 1000, endedAt: at - 5 * 60 * 1000,
  });
  const full = lines.map((l) => ({ ...l, lineTotalCents: l.qty * l.unitPriceCents, confidence: 0.95, evidenceRole: "buyer" as const }));
  const totalCents = full.reduce((s, l) => s + l.lineTotalCents, 0);
  const summaryText = full.map((l) => `${l.qty} ${l.unit}s ${l.description} @ $${(l.unitPriceCents / 100).toFixed(2)}`).join("; ");
  const orderId = await ctx.db.insert("orders", {
    callId, shopId, status, lines: full, openIssues: [], priceFlags: [], summaryText, totalCents, createdAt: at,
    buyerConfirmedAt: status === "confirmed" ? at : undefined, sellerConfirmedAt: status === "confirmed" ? at : undefined, paymentTerms: "net terms",
  });
  return { callId, orderId, totalCents };
}

// --------------------------------------------------------------------------- scenario builder (dashboard + test set)

const packingArg = v.optional(
  v.object({
    // "match": scanned exactly what was ordered; "short": scanned less of one SKU; or explicit scans.
    kind: v.union(v.literal("match"), v.literal("short")),
    shortSku: v.optional(v.string()),
    shortBy: v.optional(v.number()),
    photoFileId: v.optional(v.id("_storage")),
  }),
);

export const insertScenarioOrder = internalMutation({
  args: {
    shopId: v.id("shops"),
    lines: v.optional(v.array(v.object({ sku: v.string(), description: v.string(), qty: v.number(), unit: v.string(), unitPriceCents: v.number() }))),
    packing: packingArg,
    transcript: v.optional(v.array(v.object({ role: v.union(v.literal("buyer"), v.literal("seller")), text: v.string() }))),
    confirm: v.boolean(),
  },
  handler: async (ctx, { shopId, lines, packing, transcript, confirm }): Promise<{ orderId: Id<"orders">; invoiceId: Id<"invoices"> | null }> => {
    const now = await demoNow(ctx);
    const shop = await ctx.db.get(shopId);
    if (!shop) throw new Error("shop not found");
    const useLines = lines ?? DEMO_LINES;
    const { callId, orderId } = await insertOrder(ctx, shopId, shop.phone, useLines, now, "verbal_agreement");

    const segs = transcript ?? [
      { role: "buyer" as const, text: `Hi, it's ${shop.contactName}. I need ${useLines.map((l) => `${l.qty} cases of ${l.description}`).join(", ")}.` },
      { role: "seller" as const, text: `Got it. ${useLines.map((l) => `${l.description} at $${(l.unitPriceCents / 100).toFixed(2)} a case`).join(", ")}. Delivery tomorrow.` },
      { role: "buyer" as const, text: "Perfect, thanks." },
    ];
    let t = 0;
    for (const s of segs) {
      await ctx.db.insert("transcriptSegments", { callId, role: s.role, startMs: t, endMs: t + 4000, text: s.text, confidence: 0.95 });
      t += 5000;
    }

    if (packing) {
      const scans = useLines.map((l) => {
        const short = packing.kind === "short" && l.sku === (packing.shortSku ?? useLines[1]?.sku ?? l.sku);
        return { barcode: BARCODES[l.sku] ?? l.sku, sku: l.sku, qty: short ? Math.max(0, l.qty - (packing.shortBy ?? 2)) : l.qty };
      });
      const mismatches = useLines
        .map((l) => ({ sku: l.sku, expectedQty: l.qty, scannedQty: scans.find((s) => s.sku === l.sku)?.qty ?? 0 }))
        .filter((m) => m.expectedQty !== m.scannedQty);
      await ctx.db.insert("packingChecks", {
        orderId, packerName: "Luis", scans, photoFileIds: packing.photoFileId ? [packing.photoFileId] : [],
        result: mismatches.length ? "mismatch" : "match", mismatches, checkedAt: now - 2 * HOUR,
      });
    }

    let invoiceId: Id<"invoices"> | null = null;
    if (confirm) {
      await ctx.db.patch(orderId, { status: "confirmed", buyerConfirmedAt: now, sellerConfirmedAt: now });
      invoiceId = await ctx.runMutation(internal.billing.createInvoiceForOrder, { orderId });
    }
    await ctx.db.insert("auditLog", { actor: "system", action: "order_created", entityType: "order", entityId: orderId, reason: `New order created for ${shop.name}${packing ? ` with a ${packing.kind} packing check` : " (no packing check)"}${confirm ? "; both parties confirmed" : ""}`, at: now });
    return { orderId, invoiceId };
  },
});

/** Stores a small placeholder "box photo" so packing evidence has a photo id. */
export async function storePlaceholderPhoto(ctx: { storage: { store: (b: Blob) => Promise<Id<"_storage">> } }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#c8a165"/><rect x="20" y="20" width="280" height="160" fill="none" stroke="#7a5a2b" stroke-width="6"/><text x="160" y="110" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#3b2a12">Packed box</text></svg>`;
  return await ctx.storage.store(new Blob([svg], { type: "image/svg+xml" }));
}

/** Dashboard button: make a confirmed demo order + invoice for a shop, with an optional packing check. */
export const createDemoOrder = action({
  args: { shopId: v.id("shops"), packing: v.union(v.literal("none"), v.literal("match"), v.literal("short")) },
  handler: async (ctx, { shopId, packing }): Promise<{ orderId: Id<"orders">; invoiceId: Id<"invoices"> | null }> => {
    const photoFileId = packing === "none" ? undefined : await storePlaceholderPhoto(ctx);
    return await ctx.runMutation(internal.seed.insertScenarioOrder, {
      shopId, confirm: true,
      packing: packing === "none" ? undefined : { kind: packing, shortSku: "DRP-12OZ-24", shortBy: 2, photoFileId },
    });
  },
});

export const setShopPhone = internalMutation({
  args: { name: v.string(), phone: v.string() },
  handler: async (ctx, { name, phone }) => {
    const shop = (await ctx.db.query("shops").collect()).find((s) => s.name.toLowerCase().startsWith(name.toLowerCase()));
    if (!shop) throw new Error(`No shop named ${name}`);
    await ctx.db.patch(shop._id, { phone: normalizePhone(phone) });
    return shop._id;
  },
});

/** Dashboard: simulate the shop texting us (same path as a real inbound SMS → disputes.openFromSms). */
export const simulateShopText = mutation({
  args: { shopId: v.id("shops"), body: v.string() },
  handler: async (ctx, { shopId, body }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop) throw new Error("shop not found");
    await ctx.db.insert("messages", { direction: "in", to: "demo", from: shop.phone, body, relatedType: "shop", relatedId: shopId, status: "received", createdAt: await demoNow(ctx) });
    await ctx.runMutation(internal.disputes.openFromSms, { fromPhone: shop.phone, body });
  },
});

/** One-off: remove old "(demo)" labels from records made before they were dropped. Run: npx convex run seed:cleanUpLabels */
export const cleanUpLabels = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const p of await ctx.db.query("packingChecks").collect()) {
      if (p.packerName.includes("(demo)")) { await ctx.db.patch(p._id, { packerName: p.packerName.replace(/\s*\(demo\)/g, "") }); n++; }
    }
    for (const a of await ctx.db.query("auditLog").collect()) {
      if (/demo order created/i.test(a.reason) || a.action === "demo_order_created") {
        await ctx.db.patch(a._id, { action: "order_created", reason: a.reason.replace(/^Demo order created/i, "New order created") }); n++;
      }
    }
    return `Cleaned ${n} records`;
  },
});

/**
 * One-off: delete test texts (and the problems they created) whose text contains a phrase.
 * Run: npx convex run seed:removeTestTexts '{"contains":"forgot to give me sex"}'
 */
export const removeTestTexts = internalMutation({
  args: { contains: v.string() },
  handler: async (ctx, { contains }) => {
    const needle = contains.toLowerCase();
    let disputes = 0, messages = 0, logs = 0;
    for (const d of await ctx.db.query("disputes").collect()) {
      if (!d.shopMessage.toLowerCase().includes(needle)) continue;
      for (const a of await ctx.db.query("auditLog").withIndex("by_entity", (q) => q.eq("entityType", "dispute").eq("entityId", d._id)).collect()) {
        await ctx.db.delete(a._id); logs++;
      }
      await ctx.db.delete(d._id); disputes++;
      // Put the bill back to normal if nothing else is open on it.
      const inv = await ctx.db.get(d.invoiceId);
      if (inv) {
        const stillOpen = (await ctx.db.query("disputes").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect())
          .some((x) => x.status === "open" || x.status === "awaiting_approval");
        if (!stillOpen && inv.status === "disputed") {
          const paid = (await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect()).reduce((s, p) => s + p.amountCents, 0);
          await ctx.db.patch(inv._id, { status: inv.balanceCents === 0 ? "paid" : paid > 0 ? "partially_paid" : "open" });
        }
      }
    }
    for (const m of await ctx.db.query("messages").collect()) {
      if (m.body.toLowerCase().includes(needle)) { await ctx.db.delete(m._id); messages++; }
    }
    for (const a of await ctx.db.query("auditLog").collect()) {
      if (a.reason.toLowerCase().includes(needle)) { await ctx.db.delete(a._id); logs++; }
    }
    return `Deleted ${disputes} problem(s), ${messages} text(s), ${logs} log line(s).`;
  },
});
