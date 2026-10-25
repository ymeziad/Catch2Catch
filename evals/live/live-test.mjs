#!/usr/bin/env node
/**
 * Live end-to-end test of internal.orders.analyzeCall against a personal dev deployment.
 *
 *   node evals/live/live-test.mjs <dev-deployment-name>      e.g. calm-trout-788
 *
 * Creates one synthetic shop and three calls with transcript segments (clean agreement, garbled
 * quantity, product not in the catalog) via `npx convex import --append`, runs orders:analyzeCall on
 * each, then reads back calls / orders / orderEvents / messages / auditLog for those calls and writes
 * them to evals/live/results/<runId>.json. All phone numbers are fictional 555-01xx numbers.
 * Every CLI call passes --deployment explicitly; nothing reads CONVEX_DEPLOYMENT.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const deployment = process.argv[2];
if (!deployment || /prod/i.test(deployment)) {
  console.error("Usage: node evals/live/live-test.mjs <dev-deployment-name>  (production is refused)");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "results");
mkdirSync(outDir, { recursive: true });
const runId = Date.now().toString(36);

const BUYER_PHONE = `+1415555${String(100 + Math.floor(Math.random() * 98)).padStart(4, "0")}`;
const SELLER_PHONE = "+14155550199";

const SCENARIOS = [
  {
    key: "clean",
    expect: "verbal_agreement",
    segments: [
      ["buyer", 0, "Hi, it's the bodega on Fifth. I need to place an order for this week."],
      ["seller", 3500, "Sure, what do you need?"],
      ["buyer", 6000, "Ten cases of Coca-Cola, the twelve ounce cans, at fourteen twenty-five a case."],
      ["seller", 11000, "Ten cases of Coke at fourteen twenty-five, yes, that works."],
      ["buyer", 15000, "Great. Can you deliver Thursday morning?"],
      ["seller", 18000, "Thursday morning is fine. Payment net fourteen as usual?"],
      ["buyer", 21500, "Yes, net fourteen."],
      ["seller", 24000, "Perfect. Ten cases of Coke, fourteen twenty-five each, Thursday morning. Thanks!"],
    ],
  },
  {
    key: "garbled_qty",
    expect: ["needs_review", "no_agreement"],
    segments: [
      ["buyer", 0, "Hey, I need some Dr Pepper this week."],
      ["seller", 3000, "How many cases?"],
      ["buyer", 5000, "Uh, maybe twelve or fifteen, I'm not sure yet, depends on the weekend."],
      ["seller", 9000, "Okay. Dr Pepper is fourteen dollars a case."],
      ["buyer", 12000, "Fine, just send it."],
      ["seller", 14000, "Alright, we'll send it Friday."],
    ],
  },
  {
    key: "unknown_product",
    expect: ["needs_review", "no_agreement"],
    segments: [
      ["buyer", 0, "I want ten cases of Fanta Orange, the twelve ounce cans."],
      ["seller", 4000, "Fanta Orange, ten cases at twelve dollars a case?"],
      ["buyer", 7000, "Yes, ten cases at twelve dollars, deal."],
      ["seller", 10000, "Great, we'll deliver Wednesday."],
    ],
  },
];

function convex(args) {
  return execFileSync("npx", ["convex", ...args, "--deployment", deployment], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function importRows(table, rows) {
  const file = join(outDir, `${runId}-${table}.jsonl`);
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  convex(["import", "--table", table, "--append", "-y", file]);
}

function readTable(table, limit = 500) {
  return convex(["data", table, "--limit", String(limit), "--format", "jsonLines"])
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));
}

// 1. shop
const shopName = `Live Test Bodega ${runId}`;
importRows("shops", [
  { name: shopName, phone: BUYER_PHONE, contactName: "Test Buyer", language: "en", paymentTermsDays: 14, autoApproveLimitCents: 5000 },
]);
const shop = readTable("shops", 50).find((s) => s.name === shopName);
if (!shop) throw new Error("test shop not found after import");

// 2. calls
const now = Date.now();
importRows(
  "calls",
  SCENARIOS.map((s, i) => ({
    twilioCallSid: `livetest-${runId}-${s.key}`,
    buyerPhone: BUYER_PHONE,
    sellerPhone: SELLER_PHONE,
    shopId: shop._id,
    buyerConsent: true,
    sellerConsent: true,
    status: "analyzing",
    startedAt: now + i,
    endedAt: now + i + 30000,
  })),
);
const calls = readTable("calls", 200);
for (const s of SCENARIOS) {
  s.callId = calls.find((c) => c.twilioCallSid === `livetest-${runId}-${s.key}`)?._id;
  if (!s.callId) throw new Error(`call for ${s.key} not found after import`);
}

// 3. transcript segments
importRows(
  "transcriptSegments",
  SCENARIOS.flatMap((s) =>
    s.segments.map(([role, startMs, text]) => ({ callId: s.callId, role, startMs, endMs: startMs + 2500, text, confidence: 0.95 })),
  ),
);

// 4. analyze
for (const s of SCENARIOS) {
  const t0 = Date.now();
  convex(["run", "orders:analyzeCall", JSON.stringify({ callId: s.callId })]);
  s.seconds = (Date.now() - t0) / 1000;
  console.log(`analyzeCall ${s.key}: ${s.seconds.toFixed(1)}s`);
}

// 5. read back
const callIds = new Set(SCENARIOS.map((s) => s.callId));
const allCalls = readTable("calls", 200).filter((c) => callIds.has(c._id));
const orders = readTable("orders", 200).filter((o) => callIds.has(o.callId));
const orderIds = new Set(orders.map((o) => o._id));
const events = readTable("orderEvents", 1000).filter((e) => orderIds.has(e.orderId));
const messages = readTable("messages", 500).filter((m) => orderIds.has(m.relatedId));
const audit = readTable("auditLog", 1000).filter(
  (a) => orderIds.has(a.entityId) || callIds.has(a.entityId) || (a.evidenceRefs ?? []).some((r) => callIds.has(r.id)),
);

const results = SCENARIOS.map((s) => {
  const order = orders.find((o) => o.callId === s.callId) ?? null;
  return {
    scenario: s.key,
    expect: s.expect,
    seconds: s.seconds,
    call: allCalls.find((c) => c._id === s.callId),
    order,
    events: order ? events.filter((e) => e.orderId === order._id).sort((a, b) => a.atMs - b.atMs) : [],
    messages: order ? messages.filter((m) => m.relatedId === order._id) : [],
    audit: audit.filter((a) => a.entityId === s.callId || (order && a.entityId === order._id) || (a.evidenceRefs ?? []).some((r) => r.id === s.callId)),
  };
});
const file = join(outDir, `${runId}.json`);
writeFileSync(file, JSON.stringify({ runId, deployment, shop, results }, null, 2));
console.log(`wrote ${file}`);
