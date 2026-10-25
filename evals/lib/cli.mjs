/**
 * Shared helpers for the live scripts in evals/. Every Convex CLI call passes --deployment explicitly,
 * nothing reads CONVEX_DEPLOYMENT, and production deployments are refused.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function requireDevDeployment(argv) {
  const deployment = argv[2];
  if (!deployment || /prod/i.test(deployment)) {
    console.error(`Usage: node ${argv[1]} <dev-deployment-name>  (production is refused)`);
    process.exit(1);
  }
  return deployment;
}

export function makeCli(deployment, outDir) {
  mkdirSync(outDir, { recursive: true });

  function convex(args) {
    return execFileSync("npx", ["convex", ...args, "--deployment", deployment], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  }

  /** Run a Convex function; returns its parsed result (or raw text if it isn't JSON). */
  function run(fn, args = {}) {
    const out = convex(["run", fn, JSON.stringify(args)]).trim();
    if (!out) return null;
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  }

  /** Run a function that is expected to throw; returns the error text, or null if it didn't throw. */
  function runExpectingError(fn, args = {}) {
    try {
      run(fn, args);
      return null;
    } catch (e) {
      const text = `${e.stderr ?? ""}${e.stdout ?? ""}${e.message ?? ""}`;
      const m = text.match(/Uncaught Error: ([^\n]+)/);
      return m ? m[1].trim() : text.split("\n").find((l) => l.trim()) ?? "error";
    }
  }

  function importRows(table, rows, tag) {
    const file = join(outDir, `${tag}-${table}.jsonl`);
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    convex(["import", "--table", table, "--append", "-y", file]);
  }

  function readTable(table, limit = 500) {
    return convex(["data", table, "--limit", String(limit), "--format", "jsonLines"])
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
  }

  /**
   * Create a shop and one call per scenario with its transcript segments.
   * scenarios: [{ key, segments: [[role, startMs, text], ...] }]; sets scenario.callId.
   */
  function createCalls({ tag, shop, sellerPhone, scenarios }) {
    const shopName = `${shop.name} ${tag}`;
    importRows("shops", [{ ...shop, name: shopName }], tag);
    const shopRow = readTable("shops", 100).find((s) => s.name === shopName);
    if (!shopRow) throw new Error("shop not found after import");
    const now = Date.now();
    importRows(
      "calls",
      scenarios.map((s, i) => ({
        twilioCallSid: `${tag}-${s.key}`,
        buyerPhone: shop.phone,
        sellerPhone,
        shopId: shopRow._id,
        buyerConsent: true,
        sellerConsent: true,
        status: "analyzing",
        startedAt: now + i,
        endedAt: now + i + 30000,
      })),
      tag,
    );
    const calls = readTable("calls", 300);
    for (const s of scenarios) {
      s.callId = calls.find((c) => c.twilioCallSid === `${tag}-${s.key}`)?._id;
      if (!s.callId) throw new Error(`call for ${s.key} not found after import`);
    }
    importRows(
      "transcriptSegments",
      scenarios.flatMap((s) =>
        s.segments.map(([role, startMs, text, confidence]) => ({
          callId: s.callId, role, startMs, endMs: startMs + 2500, text, confidence: confidence ?? 0.95,
        })),
      ),
      tag,
    );
    return shopRow;
  }

  return { convex, run, runExpectingError, importRows, readTable, createCalls };
}

/** Fictional 555-01xx number (reserved for fiction), randomized so repeated runs don't collide. */
export function fakePhone() {
  return `+1415555${String(100 + Math.floor(Math.random() * 98)).padStart(4, "0")}`;
}
