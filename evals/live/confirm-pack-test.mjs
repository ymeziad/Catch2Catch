#!/usr/bin/env node
/**
 * Live test of the confirm → invoice path and the packing check on a dev deployment.
 *
 *   node evals/live/confirm-pack-test.mjs <dev-deployment-name>
 *
 * Creates a clean-agreement call and an unclear call, analyzes both, then:
 *  - confirmOrder buyer / buyer again / seller / seller again → promoted once, invoice function called once
 *  - confirmManually "both" on the needs_review order → recorded, never promoted or invoiced
 *  - packing: photo upload, validation errors, short pack (mismatch), owner override, re-check (match)
 * Prints PASS/FAIL per check and writes evals/live/results/<tag>.json.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakePhone, makeCli, requireDevDeployment } from "../lib/cli.mjs";

const deployment = requireDevDeployment(process.argv);
const outDir = join(dirname(fileURLToPath(import.meta.url)), "results");
const cli = makeCli(deployment, outDir);
const tag = `cptest-${Date.now().toString(36)}`;

const COKE_BARCODE = "049000006346";
const INVOICE_ACTIONS = /^(create_invoice_stub|invoice_created|invoice_needs_review)$/;
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

const scenarios = [
  {
    key: "clean",
    segments: [
      ["buyer", 0, "Hi, I need ten cases of Coca-Cola, twelve ounce cans, at fourteen twenty-five a case."],
      ["seller", 5000, "Ten cases of Coke at fourteen twenty-five, yes, that works."],
      ["buyer", 9000, "Deliver Thursday morning, net fourteen."],
      ["seller", 12000, "Thursday morning, net fourteen. Done."],
    ],
  },
  {
    key: "unclear",
    segments: [
      ["buyer", 0, "Send me some Dr Pepper, maybe twelve or fifteen cases."],
      ["seller", 4000, "Dr Pepper is fourteen dollars a case."],
      ["buyer", 7000, "Fine, just send it."],
    ],
  },
];

// ------------------------------------------------------------------ setup
cli.createCalls({
  tag,
  shop: { name: "Confirm-Pack Test Shop", phone: fakePhone(), contactName: "Test Buyer", language: "en", paymentTermsDays: 14, autoApproveLimitCents: 5000 },
  sellerPhone: "+14155550199",
  scenarios,
});
for (const s of scenarios) cli.run("orders:analyzeCall", { callId: s.callId });

const allOrders = () => cli.readTable("orders", 300);
const orderFor = (callId) => allOrders().find((o) => o.callId === callId);
const getOrder = (id) => allOrders().find((o) => o._id === id);
const auditFor = (id) => cli.readTable("auditLog", 2000).filter((a) => a.entityId === id);
const invoiceCalls = (id) => auditFor(id).filter((a) => INVOICE_ACTIONS.test(a.action));

const clean = orderFor(scenarios[0].callId);
const unclear = orderFor(scenarios[1].callId);
check("setup: clean call → verbal_agreement", clean?.status === "verbal_agreement", `${clean?.status} total=${clean?.totalCents}`);
check("setup: unclear call → needs_review", unclear?.status === "needs_review", unclear?.status);
if (!clean || clean.status !== "verbal_agreement" || !unclear) {
  console.error("Setup did not produce the orders this test needs; stopping.");
  process.exit(1);
}
const orderId = clean._id;

// ------------------------------------------------------------------ confirm → invoice
cli.run("orders:confirmOrder", { orderId, party: "buyer" });
let o = getOrder(orderId);
const buyerAt = o.buyerConfirmedAt;
check("buyer CONFIRM sets buyerConfirmedAt", buyerAt !== undefined);
check("buyer alone does not promote", o.status === "verbal_agreement", o.status);
check("buyer alone does not invoice", invoiceCalls(orderId).length === 0);

cli.run("orders:confirmOrder", { orderId, party: "buyer" });
o = getOrder(orderId);
check("repeat buyer CONFIRM keeps the first timestamp", o.buyerConfirmedAt === buyerAt);

cli.run("orders:confirmOrder", { orderId, party: "seller" });
o = getOrder(orderId);
check("seller CONFIRM promotes to confirmed", o.status === "confirmed", o.status);
check("sellerConfirmedAt set", o.sellerConfirmedAt !== undefined);
let inv = invoiceCalls(orderId);
check("invoice function called exactly once", inv.length === 1, inv.map((a) => a.action).join(","));

cli.run("orders:confirmOrder", { orderId, party: "seller" });
inv = invoiceCalls(orderId);
check("repeat seller CONFIRM does not invoice again", inv.length === 1, `${inv.length} invoice call(s)`);
const confirmAudit = auditFor(orderId).map((a) => `${a.actor}:${a.action}`);
check(
  "audit: per-party confirms, repeat, promotion",
  ["shop:order_confirmed_by_buyer", "shop:order_confirm_repeated_buyer", "owner:order_confirmed_by_seller", "system:order_confirmed"].every((x) => confirmAudit.includes(x)),
  confirmAudit.join(", "),
);

const manual = cli.run("orders:confirmManually", { orderId: unclear._id, party: "both", confirmedBy: "Live Test" });
const u = getOrder(unclear._id);
check("manual confirm on needs_review is recorded", u.buyerConfirmedAt !== undefined && u.sellerConfirmedAt !== undefined);
check("manual confirm on needs_review is not promoted", u.status === "needs_review" && manual?.promoted === false, `${u.status} promoted=${manual?.promoted}`);
check("manual confirm on needs_review does not invoice", invoiceCalls(unclear._id).length === 0);

// ------------------------------------------------------------------ packing
const uploadUrl = cli.run("orders:generatePackingUploadUrl", {});
const up = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: PNG });
const { storageId } = await up.json();
check("photo upload to storage", up.ok && typeof storageId === "string", `HTTP ${up.status}`);

const goodScans = [{ barcode: COKE_BARCODE, qty: 10 }];
let err = cli.runExpectingError("orders:submitPackingCheck", { orderId, packerName: "Tester", scans: goodScans, photoFileIds: [] });
check("submit without a photo is rejected", err && /photo/i.test(err), err);
err = cli.runExpectingError("orders:submitPackingCheck", { orderId, packerName: "  ", scans: goodScans, photoFileIds: [storageId] });
check("submit without a packer name is rejected", err && /packer name/i.test(err), err);

const forPacking = cli.run("orders:getForPacking", { orderId });
check(
  "getForPacking lists expected lines",
  forPacking?.expected?.length === 1 && forPacking.expected[0].sku === "COKE-12OZ-24" && forPacking.expected[0].qty === 10,
  JSON.stringify(forPacking?.expected),
);

// Short pack: 8 by UPC-A + 1 by the EAN-13 form of the same barcode = 9 Coke, plus one unknown item.
const short = cli.run("orders:submitPackingCheck", {
  orderId,
  packerName: "Tester",
  scans: [{ barcode: COKE_BARCODE, qty: 8 }, { barcode: `0${COKE_BARCODE}`, qty: 1 }, { barcode: "123456789012", qty: 1 }],
  photoFileIds: [storageId],
});
check("short pack → mismatch, not ready", short?.result === "mismatch" && short.readyToShip === false, short?.result);
check("mismatch names the missing case", short?.problems?.some((p) => /^Missing 1 × Coca-Cola/.test(p)), short?.problems?.join(" | "));
check("EAN-13 form of the barcode counted as Coke", !short?.problems?.some((p) => p.includes(`0${COKE_BARCODE}`)));
check("unknown barcode reported", short?.problems?.some((p) => p.includes("Unknown barcode 123456789012")));
let status = cli.run("orders:packingStatus", { orderId });
check("packingStatus after mismatch: not ready", status?.readyToShip === false && status.latestResult === "mismatch", JSON.stringify(status));

err = cli.runExpectingError("orders:overridePackingCheck", { checkId: short.checkId, ownerName: "Owner", reason: "ok" });
check("override with a too-short reason is rejected", err && /reason/i.test(err), err);
const ov = cli.run("orders:overridePackingCheck", {
  checkId: short.checkId,
  ownerName: "Owner",
  reason: "Buyer agreed by phone to take 9 cases; the 10th ships Monday.",
});
status = cli.run("orders:packingStatus", { orderId });
check("override → ready to ship", ov?.readyToShip === true && status?.readyToShip === true && status.latestResult === "override", JSON.stringify(status));

const match = cli.run("orders:submitPackingCheck", {
  orderId,
  packerName: "Tester",
  scans: [{ barcode: COKE_BARCODE, qty: 9 }, { barcode: "manual:COKE-12OZ-24", qty: 1 }],
  photoFileIds: [storageId],
});
check("re-check with 9 scanned + 1 manual → match", match?.result === "match" && match.readyToShip === true, match?.problems?.join(" | "));
err = cli.runExpectingError("orders:overridePackingCheck", { checkId: match.checkId, ownerName: "Owner", reason: "should not be allowed" });
check("override of a matched check is rejected", err && /mismatched/i.test(err), err);

const packingRows = cli.readTable("packingChecks", 200).filter((c) => c.orderId === orderId).sort((a, b) => a._creationTime - b._creationTime);
check("packingChecks rows stored", packingRows.length === 2, packingRows.map((c) => c.result).join(","));
check(
  "manual correction stored as such in evidence",
  packingRows.at(-1)?.scans.some((s) => s.barcode === "manual:COKE-12OZ-24" && s.sku === "COKE-12OZ-24"),
);
const finalPacking = cli.run("orders:getForPacking", { orderId });
check("getForPacking: history with photo URLs, ready to ship", finalPacking?.checks?.length === 2 && finalPacking.checks.every((c) => c.photoUrls.length === 1) && finalPacking.readyToShip === true);

const packAudit = auditFor(orderId).map((a) => `${a.actor}:${a.action}`).filter((x) => x.includes("packing"));
check(
  "audit: mismatch, override, match",
  ["packer:packing_check_mismatch", "owner:packing_check_override", "packer:packing_check_match"].every((x) => packAudit.includes(x)),
  packAudit.join(", "),
);

// ------------------------------------------------------------------ report
const file = join(outDir, `${tag}.json`);
writeFileSync(
  file,
  JSON.stringify({ tag, deployment, orderId, needsReviewOrderId: unclear._id, invoiceAudit: invoiceCalls(orderId), packingRows, checks }, null, 2),
);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed. Wrote ${file}`);
process.exitCode = failed ? 1 : 0;
