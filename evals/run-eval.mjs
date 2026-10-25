#!/usr/bin/env node
/**
 * Call eval: runs the real internal.orders.analyzeCall on scripted calls (and recorded ones) on a dev
 * deployment and scores the result against an answer key.
 *
 *   node evals/run-eval.mjs <dev-deployment-name>
 *
 * Inputs
 *   evals/calls/scripted.json  [{ key, title, language, segments: [[role, startMs, text, confidence?]], expect }]
 *   evals/calls/recorded.json  [{ key, title, callId, expect }]  — real calls already in the deployment
 *                              (re-analyzed in place; a call whose order is already confirmed is skipped by analyzeCall).
 *   expect = { status: [allowed statuses], lines?: [{ sku, qty, unitPriceCents }], totalCents?, priceFlagSkus?, smsStartsWith? }
 *
 * Scoring
 *   Critical fields = status + (SKU, quantity, price) for every expected line. A predicted line that is not in
 *   the key counts as one more wrong field. A false agreement is verbal_agreement where the key doesn't allow it.
 *   Totals, price flags and SMS are checked and reported, but not counted as critical fields.
 *
 * Output: a markdown table (for Devpost) and raw JSON in evals/results/.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakePhone, makeCli, requireDevDeployment } from "./lib/cli.mjs";

const deployment = requireDevDeployment(process.argv);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "results");
const cli = makeCli(deployment, join(outDir, "imports"));
const tag = `eval-${Date.now().toString(36)}`;

const scripted = JSON.parse(readFileSync(join(here, "calls/scripted.json"), "utf8"));
const recorded = JSON.parse(readFileSync(join(here, "calls/recorded.json"), "utf8"));
const SELLER_PHONE = "+14155550199";

// ------------------------------------------------------------------ create scripted calls (one shop per language)
for (const language of [...new Set(scripted.map((c) => c.language))]) {
  cli.createCalls({
    tag: `${tag}-${language}`,
    shop: { name: `Eval Shop (${language})`, phone: fakePhone(), contactName: "Eval Buyer", language, paymentTermsDays: 14, autoApproveLimitCents: 5000 },
    sellerPhone: SELLER_PHONE,
    scenarios: scripted.filter((c) => c.language === language),
  });
}
const cases = [...scripted.map((c) => ({ ...c, source: "scripted" })), ...recorded.map((c) => ({ ...c, source: "recorded" }))];

// ------------------------------------------------------------------ analyze
for (const c of cases) {
  const t0 = Date.now();
  try {
    cli.run("orders:analyzeCall", { callId: c.callId });
  } catch (e) {
    c.runError = String(e.message ?? e).split("\n")[0];
  }
  c.seconds = (Date.now() - t0) / 1000;
  console.log(`analyzed ${c.key.padEnd(26)} ${c.seconds.toFixed(1)}s${c.runError ? `  ERROR ${c.runError}` : ""}`);
}

// ------------------------------------------------------------------ score
const orders = cli.readTable("orders", 1000);
const messages = cli.readTable("messages", 2000);
const usd = (c) => (c === undefined || c === null ? "—" : `$${(c / 100).toFixed(2)}`);

let critical = 0;
let criticalOk = 0;
let falseAgreements = 0;
let statusOk = 0;
const rows = [];
for (const c of cases) {
  const order = orders.find((o) => o.callId === c.callId) ?? null;
  const got = order?.status ?? "no order";
  const exp = c.expect;
  const r = { key: c.key, title: c.title, source: c.source, expected: exp.status.join(" / "), got, notes: [], sku: "", qty: "", price: "" };

  const sOk = exp.status.includes(got);
  critical += 1;
  if (sOk) { criticalOk += 1; statusOk += 1; }
  r.statusOk = sOk;
  if (got === "verbal_agreement" && !exp.status.includes("verbal_agreement")) {
    falseAgreements += 1;
    r.notes.push("FALSE AGREEMENT");
  }

  const predicted = order?.lines ?? [];
  if (exp.lines) {
    let skuOk = 0, qtyOk = 0, priceOk = 0;
    for (const e of exp.lines) {
      const p = predicted.find((l) => l.sku === e.sku);
      if (p) skuOk++;
      if (p && p.qty === e.qty) qtyOk++;
      if (p && p.unitPriceCents === e.unitPriceCents) priceOk++;
      if (!p) r.notes.push(`missing ${e.sku}`);
      else {
        if (p.qty !== e.qty) r.notes.push(`${e.sku} qty ${p.qty} ≠ ${e.qty}`);
        if (p.unitPriceCents !== e.unitPriceCents) r.notes.push(`${e.sku} price ${usd(p.unitPriceCents)} ≠ ${usd(e.unitPriceCents)}`);
      }
    }
    const extra = predicted.filter((l) => !exp.lines.some((e) => e.sku === l.sku));
    for (const x of extra) r.notes.push(`extra line ${x.qty} × ${x.sku}`);
    const n = exp.lines.length;
    critical += 3 * n + extra.length;
    criticalOk += skuOk + qtyOk + priceOk;
    Object.assign(r, { sku: `${skuOk}/${n + extra.length}`, qty: `${qtyOk}/${n}`, price: `${priceOk}/${n}` });

    if (exp.totalCents !== undefined && sOk && got === "verbal_agreement" && order.totalCents !== exp.totalCents) {
      r.notes.push(`total ${usd(order.totalCents)} ≠ ${usd(exp.totalCents)}`);
    }
  } else {
    Object.assign(r, { sku: "—", qty: "—", price: "—" });
    // An order that shouldn't be agreed must not carry money.
    if (order?.totalCents !== undefined) r.notes.push(`has total ${usd(order.totalCents)} on a non-agreement`);
  }

  if (exp.priceFlagSkus && order) {
    const flags = (order.priceFlags ?? []).map((f) => f.sku).sort().join(",");
    const want = [...exp.priceFlagSkus].sort().join(",");
    if (flags !== want) r.notes.push(`price flags [${flags}] ≠ [${want}]`);
    else if (want) r.notes.push(`price flag ✓ (${order.priceFlags[0].note})`);
  }

  if (order) {
    const sms = messages.filter((m) => m.relatedType === "order" && m.relatedId === order._id);
    const recipients = new Set(sms.map((m) => m.to));
    const sameForAll = [...recipients].every(
      (to) => sms.filter((m) => m.to === to).map((m) => m.body).join("\n") === sms.filter((m) => m.to === [...recipients][0]).map((m) => m.body).join("\n"),
    );
    if (recipients.size !== 2) r.notes.push(`SMS sent to ${recipients.size} number(s)`);
    if (!sameForAll) r.notes.push("SMS differs between parties");
    if (exp.smsStartsWith && !order.summaryText.startsWith(exp.smsStartsWith)) r.notes.push(`SMS doesn't start with "${exp.smsStartsWith}"`);
    r.sms = order.summaryText;
    r.openIssues = order.openIssues;
  }
  if (c.runError) r.notes.push(`run error: ${c.runError}`);
  rows.push(r);
}

// ------------------------------------------------------------------ report
const md = [
  `# Call eval — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
  "",
  `Model \`claude-sonnet-5-5\` through the real \`orders.analyzeCall\` pipeline (Claude extraction + code checks), deployment \`${deployment}\`.`,
  "",
  `**Critical fields correct: ${criticalOk}/${critical}; false agreements: ${falseAgreements}; status correct: ${statusOk}/${cases.length}**`,
  "",
  "| # | Case | Expected | Got | SKU | Qty | Price | Notes |",
  "|---|------|----------|-----|-----|-----|-------|-------|",
  ...rows.map(
    (r, i) =>
      `| ${i + 1} | ${r.title}${r.source === "recorded" ? " *(recorded)*" : ""} | ${r.expected} | ${r.statusOk ? "✅" : "❌"} ${r.got} | ${r.sku} | ${r.qty} | ${r.price} | ${r.notes.join("; ").replace(/\|/g, "/") || "—"} |`,
  ),
  "",
  "Critical fields = status, plus SKU, quantity and price for each expected line. A false agreement is a call marked `verbal_agreement` that the answer key says was not agreed.",
  recorded.length === 0 ? "\n_Recorded calls: none yet (add them to `evals/calls/recorded.json`)._" : "",
].join("\n");

const mdFile = join(outDir, `${tag}.md`);
writeFileSync(mdFile, md + "\n");
writeFileSync(join(outDir, `${tag}.json`), JSON.stringify({ tag, deployment, criticalOk, critical, falseAgreements, statusOk, rows }, null, 2));
console.log("\n" + md + `\n\nWrote ${mdFile}`);
