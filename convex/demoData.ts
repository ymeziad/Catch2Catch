import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { DAY, HOUR, demoNow } from "./lib/clock";
import { pair, postEntryGroup } from "./ledger";
import { scheduleInvoiceReminders } from "./reminders";
import { composeSummary, orderRef, type BuiltOrder } from "./orders";
import { storePlaceholderPhoto } from "./seed";

/**
 * Demo storefront: a clean dashboard with several fictional shops and a few weeks of history, for the
 * demo video and live judging. Everything here is synthetic: names are made up and every phone number
 * is in the 555-01xx range reserved for fiction, except the one shop pointed at the live-demo buyer phone.
 *
 *   npx convex export --path backup.zip --include-file-storage    # always back up first
 *   npx convex run demoData:resetDemoData                          # empty everything except the catalog
 *   npx convex run demoData:seedStorefront '{"livePhone":"+1..."}' # shops + history (+ one open problem)
 */

// Tables that hold activity. The catalog, settings and Amaan's translation/voice caches are kept.
const ACTIVITY_TABLES = [
  "shops", "calls", "transcriptSegments", "orders", "orderEvents", "packingChecks", "invoices",
  "payments", "disputes", "ledgerEntries", "reminders", "messages", "auditLog",
] as const;

export const resetDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    // Recordings and packing photos live in file storage; remove the ones these rows point at.
    // Several rows can share one file (seeded packing checks reuse a photo), so delete each file once.
    const files = new Set<Id<"_storage">>();
    for (const c of await ctx.db.query("calls").take(1000)) if (c.recordingFileId) files.add(c.recordingFileId);
    for (const p of await ctx.db.query("packingChecks").take(1000)) for (const f of p.photoFileIds) files.add(f);
    for (const f of files) if (await ctx.db.system.get("_storage", f)) await ctx.storage.delete(f);
    for (const table of ACTIVITY_TABLES) {
      let n = 0;
      for (;;) {
        const rows = await ctx.db.query(table).take(500);
        if (rows.length === 0) break;
        for (const r of rows) await ctx.db.delete(r._id);
        n += rows.length;
      }
      counts[table] = n;
    }
    const settings = await ctx.db.query("settings").first();
    if (settings) await ctx.db.patch(settings._id, { demoClockOffsetMs: 0 });
    return counts;
  },
});

// --------------------------------------------------------------------------- the shops

type Lang = "en" | "es";
type Pay = "on_time" | "late" | "partial" | "unpaid";
type Twist = "price" | "qty" | null;
type OrderSpec = {
  daysAgo: number;
  lines: Array<[sku: string, qty: number, priceCents: number]>;
  delivery: string;
  terms: string;
  pay: Pay;
  twist?: Twist;
  packing?: "match" | "short";
};
type ShopSpec = {
  name: string;
  contactName: string;
  phone: string;
  language: Lang;
  paymentTermsDays: number;
  autoApproveLimitCents: number;
  orders: OrderSpec[];
};

const shopsFor = (livePhone: string): ShopSpec[] => [
  {
    // The live-demo buyer. Steady regular, always pays on time.
    name: "Maria's Taquería", contactName: "Maria", phone: livePhone, language: "en", paymentTermsDays: 14, autoApproveLimitCents: 5000,
    orders: [
      { daysAgo: 27, lines: [["COKE-12OZ-24", 4, 1450], ["HORCH-1L-12", 3, 2200]], delivery: "Thursday morning", terms: "14 days", pay: "on_time", packing: "match" },
      { daysAgo: 13, lines: [["COKE-12OZ-24", 5, 1425], ["HORCH-1L-12", 4, 2200]], delivery: "Tuesday", terms: "14 days", pay: "on_time", twist: "price", packing: "match" },
      { daysAgo: 4, lines: [["HORCH-1L-12", 4, 2150], ["DRP-12OZ-24", 2, 1400]], delivery: "Friday", terms: "14 days", pay: "unpaid", packing: "match" },
    ],
  },
  {
    // Corner market, English, big regular orders, pays early.
    name: "Corner Market", contactName: "Dana", phone: "+15105550147", language: "en", paymentTermsDays: 14, autoApproveLimitCents: 5000,
    orders: [
      { daysAgo: 25, lines: [["COKE-12OZ-24", 8, 1400], ["DRP-12OZ-24", 6, 1375]], delivery: "Monday", terms: "14 days", pay: "on_time", packing: "match" },
      { daysAgo: 11, lines: [["COKE-12OZ-24", 10, 1400], ["CELS-12OZ-12", 3, 2100]], delivery: "Wednesday", terms: "14 days", pay: "on_time", twist: "qty", packing: "match" },
      { daysAgo: 2, lines: [["COKE-12OZ-24", 8, 1400], ["DRP-12OZ-24", 6, 1375], ["CELS-12OZ-12", 2, 2100]], delivery: "tomorrow morning", terms: "14 days", pay: "unpaid", packing: "match" },
    ],
  },
  {
    // Spanish-speaking grocery; one bill paid in part.
    name: "Tienda La Esperanza", contactName: "Rosa", phone: "+14155550182", language: "es", paymentTermsDays: 14, autoApproveLimitCents: 5000,
    orders: [
      { daysAgo: 22, lines: [["HORCH-1L-12", 5, 2200], ["COKE-12OZ-24", 3, 1450]], delivery: "el martes", terms: "14 días", pay: "on_time", packing: "match" },
      { daysAgo: 9, lines: [["HORCH-1L-12", 6, 2100], ["DRP-12OZ-24", 2, 1400]], delivery: "el viernes", terms: "14 días", pay: "partial", twist: "price", packing: "match" },
    ],
  },
  {
    // Deli that pays late; one bill overdue right now.
    name: "Quick Stop Deli", contactName: "Mike", phone: "+16505550123", language: "en", paymentTermsDays: 7, autoApproveLimitCents: 3000,
    orders: [
      { daysAgo: 30, lines: [["COKE-12OZ-24", 4, 1450], ["DRP-12OZ-24", 4, 1400]], delivery: "Friday", terms: "7 days", pay: "late", packing: "match" },
      { daysAgo: 12, lines: [["COKE-12OZ-24", 5, 1450], ["CELS-12OZ-12", 2, 2100]], delivery: "Monday", terms: "7 days", pay: "unpaid", packing: "match" },
    ],
  },
  {
    // New Salvadoran restaurant; first delivery came 2 cases short (opens a problem for Claude).
    name: "Pupusería El Volcán", contactName: "Ana", phone: "+14085550161", language: "es", paymentTermsDays: 14, autoApproveLimitCents: 5000,
    orders: [
      { daysAgo: 3, lines: [["HORCH-1L-12", 4, 2200], ["DRP-12OZ-24", 3, 1400]], delivery: "el jueves", terms: "14 días", pay: "unpaid", twist: "qty", packing: "short" },
    ],
  },
  {
    // Bodega with longer terms and energy drinks.
    name: "Sunset Bodega", contactName: "Hassan", phone: "+12135550134", language: "en", paymentTermsDays: 30, autoApproveLimitCents: 8000,
    orders: [
      { daysAgo: 20, lines: [["CELS-12OZ-12", 6, 2050], ["COKE-12OZ-24", 6, 1425]], delivery: "Saturday", terms: "30 days", pay: "on_time", twist: "price", packing: "match" },
      { daysAgo: 6, lines: [["CELS-12OZ-12", 8, 2000], ["DRP-12OZ-24", 4, 1400]], delivery: "Tuesday", terms: "30 days", pay: "unpaid", packing: "match" },
    ],
  },
  {
    // Small café, small orders.
    name: "Pho Linh Café", contactName: "Linh", phone: "+17145550175", language: "en", paymentTermsDays: 14, autoApproveLimitCents: 5000,
    orders: [
      { daysAgo: 18, lines: [["CELS-12OZ-12", 3, 2100], ["COKE-12OZ-24", 2, 1450]], delivery: "Wednesday", terms: "14 days", pay: "on_time", packing: "match" },
      { daysAgo: 5, lines: [["CELS-12OZ-12", 4, 2100]], delivery: "Thursday", terms: "14 days", pay: "on_time", packing: "match" },
    ],
  },
];

// --------------------------------------------------------------------------- transcripts

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const cases = (n: number, lang: Lang) => (lang === "es" ? (n === 1 ? "caja" : "cajas") : n === 1 ? "case" : "cases");

/** A short, natural order call that ends at exactly the spec's quantities and prices. */
function transcriptFor(shop: ShopSpec, o: OrderSpec, catalog: Map<string, Doc<"catalogProducts">>): Array<{ role: "buyer" | "seller"; text: string }> {
  const es = shop.language === "es";
  const short = (sku: string) =>
    (catalog.get(sku)?.aliases[0] ?? catalog.get(sku)?.name ?? sku).replace(/\b\w/g, (c) => c.toUpperCase());
  const [first, ...rest] = o.lines;
  // For a twist, the call starts from a different number and lands on the spec's.
  const startQty = o.twist === "qty" ? first[1] - 2 : first[1];
  const listPrice = catalog.get(first[0])?.priceWholesaleCents ?? first[2] + 50;
  const startPrice = o.twist === "price" ? Math.max(listPrice, first[2] + 25) : first[2];
  const ask = [[first[0], startQty] as const, ...rest.map((l) => [l[0], l[1]] as const)]
    .map(([sku, q]) => `${q} ${cases(q, shop.language)} ${es ? "de " : "of "}${short(sku)}`)
    .join(es ? " y " : " and ");
  const quote = [[first[0], startPrice] as const, ...rest.map((l) => [l[0], l[2]] as const)]
    .map(([sku, p]) => `${short(sku)} ${es ? "a" : "is"} ${money(p)}${es ? " la caja" : " a case"}`)
    .join(", ");

  const t: Array<{ role: "buyer" | "seller"; text: string }> = es
    ? [
        { role: "buyer", text: `Hola, habla ${shop.contactName} de ${shop.name}. Quiero hacer un pedido.` },
        { role: "seller", text: `¡Hola ${shop.contactName}! Claro, dígame.` },
        { role: "buyer", text: `Necesito ${ask}.` },
        { role: "seller", text: `Perfecto. ${quote}. Se lo llevo ${o.delivery}.` },
      ]
    : [
        { role: "buyer", text: `Hi, it's ${shop.contactName} from ${shop.name}. Can I put in an order?` },
        { role: "seller", text: `Hey ${shop.contactName}! Sure, go ahead.` },
        { role: "buyer", text: `I need ${ask}.` },
        { role: "seller", text: `Okay. ${quote}. I can bring it ${o.delivery}.` },
      ];
  if (o.twist === "qty") {
    t.push(es
      ? { role: "buyer", text: `Mejor que sean ${first[1]} cajas de ${short(first[0])}.` }
      : { role: "buyer", text: `Actually, make the ${short(first[0])} ${first[1]} cases.` });
    t.push(es ? { role: "seller", text: `${first[1]}, anotado.` } : { role: "seller", text: `${first[1]} cases, got it.` });
  }
  if (o.twist === "price") {
    t.push(es
      ? { role: "buyer", text: `¿Me deja el ${short(first[0])} en ${money(first[2])}?` }
      : { role: "buyer", text: `Can you do the ${short(first[0])} at ${money(first[2])}?` });
    t.push(es ? { role: "seller", text: `Sí, ${money(first[2])} está bien.` } : { role: "seller", text: `For you, ${money(first[2])}. Deal.` });
  }
  t.push(es
    ? { role: "seller", text: `El pago a ${o.terms}, como siempre.` }
    : { role: "seller", text: `Payment in ${o.terms}, like usual.` });
  t.push(es ? { role: "buyer", text: "Perfecto, gracias." } : { role: "buyer", text: "Perfect, thanks!" });
  t.push(es ? { role: "seller", text: "Gracias a usted. ¡Hasta luego!" } : { role: "seller", text: "Thank you, talk soon!" });
  return t;
}

// --------------------------------------------------------------------------- seeding

async function addOrder(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  shop: ShopSpec,
  o: OrderSpec,
  now: number,
  catalog: Map<string, Doc<"catalogProducts">>,
  photoFileId: Id<"_storage">,
): Promise<{ orderId: Id<"orders">; invoiceId: Id<"invoices"> }> {
  // Calls land at believable, varied times of day rather than all at the same minute.
  const seed = (o.daysAgo * 37 + shop.name.length * 11) % 97;
  const startOfDay = now - (now % DAY) - o.daysAgo * DAY;
  const at = startOfDay + (14 + (seed % 9)) * HOUR + (seed * 7 % 60) * 60_000; // 7 AM–3 PM Pacific
  
  const callId = await ctx.db.insert("calls", {
    twilioCallSid: `DEMO-${shop.name.replace(/\W+/g, "").slice(0, 10)}-${o.daysAgo}`,
    buyerPhone: shop.phone,
    sellerPhone: process.env.SELLER_PHONE ?? "+15105550199",
    shopId,
    buyerConsent: true,
    sellerConsent: true,
    status: "done",
    startedAt: at - 4 * 60_000,
    endedAt: at - 2 * 60_000,
  });
  let ms = 1500;
  for (const s of transcriptFor(shop, o, catalog)) {
    const len = 1200 + s.text.length * 55;
    await ctx.db.insert("transcriptSegments", { callId, role: s.role, startMs: ms, endMs: ms + len, text: s.text, confidence: 0.94 });
    ms += len + 600;
  }

  const lines = o.lines.map(([sku, qty, price]) => ({
    sku,
    description: catalog.get(sku)?.name ?? sku,
    qty,
    unit: "case",
    unitPriceCents: price,
    lineTotalCents: qty * price,
    confidence: 0.95,
    evidenceRole: "seller" as const,
  }));
  const totalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const built: BuiltOrder = {
    status: "verbal_agreement", lines, unavailable: [], events: [], openIssues: [], checkFailures: [], priceFlags: [],
    totalCents, deliveryDate: o.delivery, paymentTerms: o.terms,
  };
  const orderId = await ctx.db.insert("orders", {
    callId, shopId, status: "confirmed", lines, openIssues: [], priceFlags: [], summaryText: "", totalCents,
    deliveryDate: o.delivery, paymentTerms: o.terms, buyerConfirmedAt: at + HOUR, sellerConfirmedAt: at + HOUR, createdAt: at,
  });
  const names = new Map([...catalog.values()].map((p) => [p.sku, p.name]));
  await ctx.db.patch(orderId, { summaryText: composeSummary(shop.language, orderRef(orderId), built, names).summaryText });
  await ctx.db.insert("auditLog", {
    actor: "agent", action: "order_analyzed", entityType: "order", entityId: orderId,
    reason: `Claude read the call with ${shop.name}: ${lines.length} line(s), agreed on the call; total ${money(totalCents)}`,
    evidenceRefs: [{ type: "call", id: callId, detail: "transcript" }], at: at + 60_000,
  });

  // Warehouse packing check with scans and a box photo, the day after the call.
  const scans = lines.map((l, i) => ({
    barcode: catalog.get(l.sku)?.barcode ?? l.sku,
    sku: l.sku,
    qty: o.packing === "short" && i === lines.length - 1 ? l.qty - 2 : l.qty,
  }));
  const mismatches = lines
    .map((l) => ({ sku: l.sku, expectedQty: l.qty, scannedQty: scans.find((s) => s.sku === l.sku)?.qty ?? 0 }))
    .filter((m) => m.expectedQty !== m.scannedQty);
  if (o.packing) {
    await ctx.db.insert("packingChecks", {
      orderId, packerName: "Luis", scans, photoFileIds: [photoFileId],
      result: mismatches.length ? "mismatch" : "match", mismatches, checkedAt: at + 18 * HOUR,
    });
  }

  // Bill, and the money that came in against it.
  const issuedAt = at + HOUR;
  const dueAt = issuedAt + shop.paymentTermsDays * DAY;
  const invoiceId = await ctx.db.insert("invoices", { orderId, shopId, amountCents: totalCents, balanceCents: totalCents, issuedAt, dueAt, status: "open" });
  await postEntryGroup(ctx, pair("accounts_receivable", "sales", totalCents), "invoice", invoiceId, `Invoice for order ${orderRef(orderId)} — ${shop.name}`, issuedAt);
  await ctx.db.insert("auditLog", { actor: "agent", action: "invoice_created", entityType: "invoice", entityId: invoiceId, reason: `Both sides confirmed; bill for ${money(totalCents)}, due in ${shop.paymentTermsDays} days`, at: issuedAt });

  const paidAt =
    o.pay === "on_time" ? Math.min(now - 2 * HOUR, dueAt - 2 * DAY) :
    o.pay === "late" ? Math.min(now - 2 * HOUR, dueAt + 6 * DAY) :
    o.pay === "partial" ? Math.min(now - 2 * HOUR, issuedAt + 5 * DAY) : null;
  if (paidAt !== null) {
    const amount = o.pay === "partial" ? Math.round(totalCents * 0.6) : totalCents;
    const paymentId = await ctx.db.insert("payments", {
      invoiceId, amountCents: amount, method: o.pay === "partial" ? "cash" : "check", receivedAt: paidAt,
      note: o.pay === "late" ? "paid late" : o.pay === "partial" ? "partial payment" : undefined,
    });
    await postEntryGroup(ctx, pair("cash", "accounts_receivable", amount), "payment", paymentId, `Payment from ${shop.name}`, paidAt);
    const balance = totalCents - amount;
    await ctx.db.patch(invoiceId, { balanceCents: balance, status: balance === 0 ? "paid" : "partially_paid" });
    await ctx.db.insert("auditLog", { actor: "owner", action: "payment_recorded", entityType: "invoice", entityId: invoiceId, reason: `${shop.name} paid ${money(amount)}${o.pay === "late" ? ", after the due date" : ""}`, at: paidAt });
  }
  return { orderId, invoiceId };
}

export const insertStorefront = internalMutation({
  args: { livePhone: v.string(), photoFileId: v.id("_storage") },
  handler: async (ctx, { livePhone, photoFileId }) => {
    const now = await demoNow(ctx);
    const catalog = new Map((await ctx.db.query("catalogProducts").take(200)).map((p) => [p.sku, p]));
    if (catalog.size === 0) throw new Error("Catalog is empty: seed it first (catalog:seed)");
    const made: string[] = [];
    for (const shop of shopsFor(livePhone)) {
      const shopId = await ctx.db.insert("shops", {
        name: shop.name, contactName: shop.contactName, phone: shop.phone, language: shop.language,
        paymentTermsDays: shop.paymentTermsDays, autoApproveLimitCents: shop.autoApproveLimitCents,
      });
      for (const o of shop.orders) {
        const { invoiceId } = await addOrder(ctx, shopId, shop, o, now, catalog, photoFileId);
        const invoice = (await ctx.db.get(invoiceId))!;
        if (invoice.balanceCents > 0) await scheduleInvoiceReminders(ctx, invoice, now);
      }
      made.push(`${shop.name} (${shop.orders.length} orders)`);
    }
    await ctx.db.insert("auditLog", { actor: "system", action: "seeded", entityType: "settings", entityId: "demo", reason: `Demo storefront: ${made.join(", ")}`, at: now });
    return made;
  },
});

/** Seeding entry point: shops + history, then two real problems for Claude (one it settles, one for the owner). */
export const seedStorefront = internalAction({
  args: { livePhone: v.string() },
  handler: async (ctx, { livePhone }): Promise<{ shops: string[]; problemOpened: boolean }> => {
    const photoFileId = await storePlaceholderPhoto(ctx);
    const shops = await ctx.runMutation(internal.demoData.insertStorefront, { livePhone, photoFileId });
    // Pupusería El Volcán's last delivery was packed 2 cases short; Ana texts about it.
    const disputeId = await ctx.runMutation(internal.disputes.openFromSms, {
      fromPhone: "+14085550161",
      body: "Hola, nos faltaron 2 cajas de Dr Pepper en el pedido del jueves.",
    });
    // Sunset Bodega says 2 cases of Celsius are missing, but the packing scan shows all 8 shipped.
    const contested = await ctx.runMutation(internal.disputes.openFromSms, {
      fromPhone: "+12135550134",
      body: "Hey, we only got 6 cases of Celsius on Tuesday, 2 are missing.",
    });
    return { shops, problemOpened: disputeId !== null && contested !== null };
  },
});
