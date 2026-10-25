import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

/**
 * Apify reference prices + the price flag rule.
 *
 * Retail reference prices come from Walmart search results scraped by an Apify Store actor
 * (default `automation-lab/walmart-scraper`, override with env APIFY_WALMART_ACTOR).
 * Runs daily from a cron (`internal.prices.refreshReferencePrices`) and on demand from the
 * "Refresh prices" button (`api.prices.refreshNow`). Failures keep the last good price, and
 * order analysis never waits on this.
 */

const DEFAULT_ACTOR = "automation-lab~walmart-scraper";
const APIFY_TIMEOUT_SECS = 180;
const RESULTS_PER_SEARCH = 15;

/** Walmart search text per SKU. Products not listed here search on brand + name. */
const SEARCH_QUERIES: Record<string, string> = {
  "COKE-12OZ-24": "Coca-Cola Classic 12 fl oz cans",
  "DRP-12OZ-24": "Dr Pepper 12 fl oz cans",
  "HORCH-1L-12": "horchata 1 liter",
  "CELS-12OZ-12": "Celsius Sparkling Orange 12 fl oz",
};

type Product = Doc<"catalogProducts">;

export function searchQueryFor(p: Pick<Product, "sku" | "brand" | "name">): string {
  if (SEARCH_QUERIES[p.sku]) return SEARCH_QUERIES[p.sku];
  return norm(p.name).includes(norm(p.brand)) ? p.name : `${p.brand} ${p.name}`;
}

// ------------------------------------------------------------------ price flag rule

/** Agreed per-case prices below this fraction of the retail reference are flagged as a likely mistake. */
export const PRICE_FLAG_LOW_RATIO = 0.4;

export type PriceFlag = { sku: string; agreedCents: number; refCents: number; note: string };

/**
 * Retail is not wholesale, so a wholesale price is expected to sit below retail. Flag an agreed
 * per-case price ABOVE the retail reference (overcharge risk) or BELOW 40% of it (likely mistake).
 */
export function priceFlagFor(sku: string, agreedPerCaseCents: number, refPerCaseCents: number | undefined): PriceFlag | null {
  if (!refPerCaseCents || refPerCaseCents <= 0) return null;
  if (agreedPerCaseCents > refPerCaseCents) {
    return {
      sku, agreedCents: agreedPerCaseCents, refCents: refPerCaseCents,
      note: `Agreed ${usd(agreedPerCaseCents)}/case is above the ${usd(refPerCaseCents)} retail reference (overcharge risk).`,
    };
  }
  if (agreedPerCaseCents < PRICE_FLAG_LOW_RATIO * refPerCaseCents) {
    return {
      sku, agreedCents: agreedPerCaseCents, refCents: refPerCaseCents,
      note: `Agreed ${usd(agreedPerCaseCents)}/case is under 40% of the ${usd(refPerCaseCents)} retail reference (likely mistake).`,
    };
  }
  return null;
}

// ------------------------------------------------------------------ listing matching (pure)

export type Listing = { title: string; brand: string; priceCents: number; url: string; sponsored: boolean; inStock: boolean };

export type ReferencePick = { refCents: number; listing: Listing; packCount: number; reason: string };

/** Pick the listing that best matches the product (brand + size) and convert it to a per-case price. */
export function pickReference(product: Pick<Product, "brand" | "name" | "unitsPerCase" | "aliases">, listings: Listing[]): ReferencePick | null {
  const wantMl = sizeInMl(product.name);
  const brand = norm(product.brand);
  // The first alias is the plain product word ("horchata", "celsius"), used when the brand is unknown to Walmart.
  const keyword = norm(product.aliases[0] ?? "");

  let best: { score: number; pick: ReferencePick } | null = null;
  for (const l of listings) {
    if (!(l.priceCents > 0)) continue;
    const title = norm(l.title);
    const brandHit = title.includes(brand) || norm(l.brand).includes(brand);
    const keywordHit = keyword.length > 0 && title.includes(keyword);
    const ml = sizeInMl(l.title);
    const sizeHit = wantMl !== null && ml !== null && Math.abs(ml - wantMl) / wantMl < 0.03;
    if (!sizeHit || !(brandHit || keywordHit)) continue;

    const pack = packCount(l.title) ?? 1;
    const refCents = pack === product.unitsPerCase ? l.priceCents : Math.round((l.priceCents / pack) * product.unitsPerCase);
    let score = 3 + (brandHit ? 3 : 0) + (keywordHit ? 1 : 0) + (pack === product.unitsPerCase ? 1 : 0);
    if (l.sponsored) score -= 1;
    if (!l.inStock) score -= 1;
    const reason =
      pack === product.unitsPerCase
        ? `listing is a ${pack}-pack at ${usd(l.priceCents)}`
        : `listing is ${pack === 1 ? "a single unit" : `a ${pack}-pack`} at ${usd(l.priceCents)}; scaled to ${product.unitsPerCase} per case`;
    if (!best || score > best.score) best = { score, pick: { refCents, listing: l, packCount: pack, reason } };
  }
  return best?.pick ?? null;
}

/** "12 Pack", "24-pk", "12 ct", "Pack of 12", "12 cans", "12 x 12 oz" → pack size. */
export function packCount(title: string): number | null {
  const t = title.toLowerCase();
  const patterns = [
    /\bpack of (\d{1,3})\b/,
    /\b(\d{1,3})\s*-?\s*(?:pack|pk|ct|count)\b/,
    /\b(\d{1,3})\s*(?:cans|bottles|cartons)\b/,
    /\b(\d{1,3})\s*x\s*\d/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 200) return n;
    }
  }
  return null;
}

/** "12 oz", "12 fl oz", "1 L", "1 liter", "33.8 fl oz", "500 ml" → milliliters. */
export function sizeInMl(text: string): number | null {
  const t = text.toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*-?\s*(fl\.?\s*oz|oz|ounces?|ml|milliliters?|l|liters?|litres?)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].replace(/\s|\./g, "");
  if (unit.startsWith("floz") || unit.startsWith("oz") || unit.startsWith("ounce")) return n * 29.5735;
  if (unit === "ml" || unit.startsWith("milliliter")) return n;
  return n * 1000;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ------------------------------------------------------------------ Apify

type RawItem = Record<string, unknown>;

function toListing(item: RawItem): Listing | null {
  const title = typeof item.name === "string" ? item.name : "";
  const url = typeof item.url === "string" ? item.url : "";
  let dollars = typeof item.price === "number" ? item.price : NaN;
  if (!Number.isFinite(dollars) && typeof item.priceString === "string") {
    dollars = Number(item.priceString.replace(/[^0-9.]/g, ""));
  }
  if (!title || !url || !Number.isFinite(dollars) || dollars <= 0) return null;
  return {
    title,
    brand: typeof item.brand === "string" ? item.brand : "",
    priceCents: Math.round(dollars * 100),
    url: url.startsWith("http") ? url : `https://www.walmart.com${url}`,
    sponsored: item.isSponsored === true,
    inStock: item.inStock !== false,
  };
}

async function searchWalmart(token: string, query: string): Promise<Listing[]> {
  const actor = process.env.APIFY_WALMART_ACTOR || DEFAULT_ACTOR;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (APIFY_TIMEOUT_SECS + 30) * 1000);
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?timeout=${APIFY_TIMEOUT_SECS}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          searchQueries: [query],
          maxProductsPerSearch: RESULTS_PER_SEARCH,
          maxSearchPages: 1,
          sort: "best_match",
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`Apify ${actor} returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const items: unknown = await res.json();
    if (!Array.isArray(items)) throw new Error("Apify returned a non-array dataset");
    return items.map((i) => toListing(i as RawItem)).filter((l): l is Listing => l !== null);
  } finally {
    clearTimeout(timer);
  }
}

type RefreshResult = {
  sku: string;
  status: "updated" | "no_match" | "failed";
  refCents?: number;
  source?: string;
  note: string;
};

async function refreshAll(ctx: ActionCtx, trigger: "cron" | "manual"): Promise<RefreshResult[]> {
  const actor = trigger === "cron" ? "system" : "owner";
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    await ctx.runMutation(internal.audit.log, {
      actor, action: "price_refresh_skipped", entityType: "catalog", entityId: "all",
      reason: "APIFY_TOKEN is not set; keeping cached reference prices",
    });
    return [];
  }
  const products: Product[] = await ctx.runQuery(internal.catalog.listInternal, {});
  const settled = await Promise.allSettled(
    products.map(async (p) => {
      const query = searchQueryFor(p);
      const listings = await searchWalmart(token, query);
      return { p, query, listings, pick: pickReference(p, listings) };
    }),
  );

  const results: RefreshResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const p = products[i];
    const s = settled[i];
    if (s.status === "rejected") {
      const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
      results.push({ sku: p.sku, status: "failed", note: msg });
      await ctx.runMutation(internal.audit.log, {
        actor, action: "price_refresh_failed", entityType: "catalogProduct", entityId: p.sku,
        reason: `Apify refresh failed (${msg.slice(0, 200)}); keeping last good reference price`,
      });
      continue;
    }
    const { query, listings, pick } = s.value;
    if (!pick) {
      results.push({ sku: p.sku, status: "no_match", note: `${listings.length} listings for "${query}", none matched brand + size` });
      await ctx.runMutation(internal.audit.log, {
        actor, action: "price_refresh_no_match", entityType: "catalogProduct", entityId: p.sku,
        reason: `No Walmart listing for "${query}" matched brand and size (${listings.length} checked); keeping last good reference price`,
      });
      continue;
    }
    const now = Date.now();
    await ctx.runMutation(internal.catalog.saveReferencePrice, {
      sku: p.sku, priceRetailRefCents: pick.refCents, priceRefSource: pick.listing.url, priceUpdatedAt: now,
    });
    await ctx.runMutation(internal.audit.log, {
      actor, action: "price_reference_updated", entityType: "catalogProduct", entityId: p.sku,
      reason: `Walmart retail reference ${usd(pick.refCents)}/case of ${p.unitsPerCase} (${pick.reason})`,
      evidenceRefs: [{ type: "url", id: pick.listing.url, detail: pick.listing.title.slice(0, 120) }],
    });
    results.push({ sku: p.sku, status: "updated", refCents: pick.refCents, source: pick.listing.url, note: pick.reason });
  }
  return results;
}

/** Daily cron target. */
export const refreshReferencePrices = internalAction({
  args: {},
  handler: async (ctx): Promise<RefreshResult[]> => refreshAll(ctx, "cron"),
});

/** "Refresh prices" button. Public for the hackathon demo: each click runs one Apify actor per product. */
export const refreshNow = action({
  args: {},
  handler: async (ctx): Promise<RefreshResult[]> => refreshAll(ctx, "manual"),
});
