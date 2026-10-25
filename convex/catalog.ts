import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * Product catalog: seed import, barcodes, wholesale and retail reference prices.
 * NOTE: the public mutations are unauthenticated for the hackathon demo, like admin.ts.
 */

const MAX_CATALOG = 500;

export async function loadCatalog(ctx: QueryCtx): Promise<Doc<"catalogProducts">[]> {
  const rows = await ctx.db.query("catalogProducts").take(MAX_CATALOG);
  return rows.sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Scanners report a 12-digit UPC-A either as-is or as EAN-13 with a leading 0; treat both as the same code. */
export function barcodeVariants(raw: string): string[] {
  const code = raw.replace(/\D/g, "");
  if (!code) return [];
  const out = new Set([code]);
  if (code.length === 13 && code.startsWith("0")) out.add(code.slice(1));
  if (code.length === 12) out.add("0" + code);
  return [...out];
}

export async function findByBarcode(ctx: QueryCtx, raw: string): Promise<Doc<"catalogProducts"> | null> {
  for (const code of barcodeVariants(raw)) {
    const p = await ctx.db.query("catalogProducts").withIndex("by_barcode", (q) => q.eq("barcode", code)).first();
    if (p) return p;
  }
  return null;
}

async function getBySku(ctx: QueryCtx, sku: string): Promise<Doc<"catalogProducts"> | null> {
  return await ctx.db.query("catalogProducts").withIndex("by_sku", (q) => q.eq("sku", sku)).unique();
}

// ------------------------------------------------------------------ seed

const seedProduct = v.object({
  sku: v.string(),
  brand: v.string(),
  name: v.string(),
  unit: v.string(),
  unitsPerCase: v.number(),
  aliases: v.array(v.string()),
  barcode: v.optional(v.string()),
  priceWholesaleDollars: v.optional(v.number()),
});

/**
 * Upsert products from data/drink_catalog_seed.json (dollars → cents). Re-running is safe: a barcode
 * or wholesale price already in the database (e.g. set by scanning a real can) is kept.
 *   npx convex run catalog:seed "{\"products\": $(cat data/drink_catalog_seed.json)}"
 */
export const seed = internalMutation({
  args: { products: v.array(seedProduct) },
  handler: async (ctx, { products }) => {
    let inserted = 0;
    let updated = 0;
    for (const p of products) {
      const wholesale = p.priceWholesaleDollars !== undefined ? Math.round(p.priceWholesaleDollars * 100) : undefined;
      const existing = await getBySku(ctx, p.sku);
      if (existing) {
        await ctx.db.patch(existing._id, {
          brand: p.brand,
          name: p.name,
          unit: p.unit,
          unitsPerCase: p.unitsPerCase,
          aliases: p.aliases,
          barcode: existing.barcode ?? p.barcode,
          priceWholesaleCents: existing.priceWholesaleCents ?? wholesale,
        });
        updated++;
      } else {
        await ctx.db.insert("catalogProducts", {
          sku: p.sku,
          brand: p.brand,
          name: p.name,
          unit: p.unit,
          unitsPerCase: p.unitsPerCase,
          aliases: p.aliases,
          barcode: p.barcode,
          priceWholesaleCents: wholesale,
        });
        inserted++;
      }
    }
    await ctx.runMutation(internal.audit.log, {
      actor: "system",
      action: "catalog_seeded",
      entityType: "catalog",
      entityId: "all",
      reason: `Catalog seed: ${inserted} inserted, ${updated} updated (existing barcodes and wholesale prices kept)`,
    });
    return { inserted, updated };
  },
});

// ------------------------------------------------------------------ reads

export const list = query({
  args: {},
  handler: async (ctx) => loadCatalog(ctx),
});

export const listInternal = internalQuery({
  args: {},
  handler: async (ctx) => loadCatalog(ctx),
});

export const lookupBarcode = query({
  args: { barcode: v.string() },
  handler: async (ctx, { barcode }) => findByBarcode(ctx, barcode),
});

// ------------------------------------------------------------------ writes

/** Register a scanned barcode on a SKU (Step 1: scan the real cans). Clears it from any other SKU. */
export const setBarcode = mutation({
  args: { sku: v.string(), barcode: v.string(), setBy: v.optional(v.string()) },
  handler: async (ctx, { sku, barcode, setBy }) => {
    const code = barcode.replace(/\D/g, "");
    if (code.length < 6) throw new Error("Barcode must have at least 6 digits");
    const product = await getBySku(ctx, sku);
    if (!product) throw new Error(`Unknown SKU ${sku}`);
    for (const variant of barcodeVariants(code)) {
      const others = await ctx.db.query("catalogProducts").withIndex("by_barcode", (q) => q.eq("barcode", variant)).take(10);
      for (const o of others) if (o._id !== product._id) await ctx.db.patch(o._id, { barcode: undefined });
    }
    await ctx.db.patch(product._id, { barcode: code });
    await ctx.runMutation(internal.audit.log, {
      actor: "packer",
      action: "catalog_barcode_set",
      entityType: "catalogProduct",
      entityId: sku,
      reason: `Barcode ${code} registered for ${product.name}${setBy ? ` by ${setBy}` : ""} (was ${product.barcode ?? "none"})`,
    });
    return { sku, barcode: code };
  },
});

export const setWholesalePrice = mutation({
  args: { sku: v.string(), priceWholesaleCents: v.number() },
  handler: async (ctx, { sku, priceWholesaleCents }) => {
    if (!Number.isInteger(priceWholesaleCents) || priceWholesaleCents <= 0) {
      throw new Error("Wholesale price must be a positive whole number of cents");
    }
    const product = await getBySku(ctx, sku);
    if (!product) throw new Error(`Unknown SKU ${sku}`);
    await ctx.db.patch(product._id, { priceWholesaleCents });
    await ctx.runMutation(internal.audit.log, {
      actor: "owner",
      action: "catalog_wholesale_price_set",
      entityType: "catalogProduct",
      entityId: sku,
      reason: `Wholesale price for ${product.name} set to $${(priceWholesaleCents / 100).toFixed(2)}/case (was ${
        product.priceWholesaleCents !== undefined ? `$${(product.priceWholesaleCents / 100).toFixed(2)}` : "unset"
      })`,
    });
  },
});

export const saveReferencePrice = internalMutation({
  args: { sku: v.string(), priceRetailRefCents: v.number(), priceRefSource: v.string(), priceUpdatedAt: v.number() },
  handler: async (ctx, { sku, ...fields }) => {
    const product = await getBySku(ctx, sku);
    if (!product) return;
    await ctx.db.patch(product._id, fields);
  },
});
