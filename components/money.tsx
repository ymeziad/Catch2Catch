"use client";

import { useState, type ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

/** Shared UI + plain shop-counter wording for the money pages. */

export const AI = "C2C AI Assistant";

export function usd(cents: number | undefined | null): string {
  if (cents === undefined || cents === null) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

export function when(ms: number | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function day(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "due Thu, Oct 31" / "due today" / "5 days late" */
export function dueText(dueAt: number, now: number): { text: string; late: boolean } {
  const days = Math.floor((now - dueAt) / 86_400_000);
  if (days >= 1) return { text: `${days} ${days === 1 ? "day" : "days"} late`, late: true };
  if (new Date(now).toDateString() === new Date(dueAt).toDateString()) return { text: "due today", late: false };
  return { text: `due ${day(dueAt)}`, late: false };
}

// --------------------------------------------------------------------------- problems, in plain words

export type Rec = NonNullable<Doc<"disputes">["recommendation"]>;

/** Capitalize the first letter (for quoted texts from shops). */
export function cap(text: string): string {
  const t = text.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** What the yes-button says. */
export function recAction(rec: Rec | undefined, cents: number): string {
  switch (rec) {
    case "credit": return `Take ${usd(cents)} off`;
    case "cash_refund": return `Refund ${usd(cents)}`;
    case "replacement": return "Send it again";
    case "reject_with_evidence": return "Tell them no";
    default: return "Decide";
  }
}

/** What the C2C AI Assistant suggests, as a full sentence. */
export function recSentence(rec: Rec | undefined, cents: number): string {
  switch (rec) {
    case "credit": return `Take ${usd(cents)} off (bill not paid yet).`;
    case "cash_refund": return `Refund ${usd(cents)} (bill already paid).`;
    case "replacement": return "Send the missing items with the next delivery.";
    case "reject_with_evidence": return "Tell them no. What they're saying doesn't match our proof.";
    case "escalate": return "It isn't sure about this one, so it's your call.";
    default: return "It's still looking into this.";
  }
}

/** One-line headline for a problem. */
export function disputeHeadline(d: { requestedBy: string; shopMessage: string; shopMessageClean?: string; shopName: string }): string {
  if (d.shopMessage) return `${d.shopName} texted: “${d.shopMessageClean ?? cap(d.shopMessage.split("\n").slice(-1)[0])}”`;
  if (d.requestedBy === "agent") return `${d.shopName} paid less than they owe.`;
  return `${d.shopName} has a problem with an order.`;
}

/** First few sentences of the AI's reasoning. */
export function shortReason(text: string | undefined, sentences = 2): string {
  if (!text) return "";
  const clean = text.split("\n[Checks")[0];
  const parts = clean.trim().split(/(?<=[.!?])\s+/); // split on sentence ends, not on "$14.00"
  return parts.slice(0, sentences).join(" ").trim();
}

// --------------------------------------------------------------------------- what C2C did, in plain words

const friendly: [RegExp, string][] = [
  [/^invoice_created$/, "sent a bill"],
  [/^reminder_sent_payment_due_soon$/, "reminded a shop that a payment is coming up"],
  [/^reminder_sent_payment_due$/, "reminded a shop that a payment is due today"],
  [/^reminder_sent_payment_late$/, "told a shop their payment is late"],
  [/^reminder_sent_escalate_owner$/, "texted you about a bill that isn't getting paid"],
  [/^reminder_sent_order_unconfirmed$/, "asked a shop to confirm their order"],
  [/^dispute_opened_short_payment$/, "noticed a short payment and asked the shop why"],
  [/^dispute_opened_sms$/, "heard from a shop about a problem"],
  [/^dispute_recommendation$/, "looked into a problem and suggested a fix"],
  [/^auto_approve_rule_applied$/, "fixed a small problem on its own"],
];
export function friendlyAction(action: string): string | null {
  for (const [re, label] of friendly) if (re.test(action)) return label;
  return null;
}

/** "A", "A and B", "A, B, and C" */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Collapse everything the assistant did within 5 minutes into one sentence. */
export function activitySentences(rows: { _id: string; at: number; action: string; actor: string }[], windowMs = 5 * 60_000) {
  const items = rows
    .filter((r) => r.actor === "agent" || r.actor === "system")
    .map((r) => ({ ...r, label: friendlyAction(r.action) }))
    .filter((r): r is typeof r & { label: string } => !!r.label)
    .sort((x, y) => y.at - x.at);
  const groups: { key: string; at: number; labels: string[] }[] = [];
  for (const it of items) {
    const g = groups[groups.length - 1];
    if (g && g.at - it.at <= windowMs) {
      if (!g.labels.includes(it.label)) g.labels.push(it.label);
    } else {
      groups.push({ key: it._id, at: it.at, labels: [it.label] });
    }
  }
  return groups.map((g) => {
    const labels = [...g.labels].reverse();
    const shown = labels.length > 3 ? [...labels.slice(0, 2), `did ${labels.length - 2} other things`] : labels;
    return { key: g.key, at: g.at, sentence: cap(joinWords(shown)) + "." };
  });
}

export const actorName: Record<string, string> = { agent: "C2C AI", owner: "You", shop: "Shop", packer: "Warehouse", system: "House rules" };

// --------------------------------------------------------------------------- building blocks

type Tone = "go" | "wait" | "late" | "plain" | "grape" | "sky" | "sun";
const toneClass: Record<Tone, string> = {
  go: "bg-go/10 text-go", wait: "bg-wait/10 text-wait", late: "bg-late/10 text-late", plain: "bg-ink/5 text-ink/70",
  grape: "bg-grape/10 text-grape", sky: "bg-sky/10 text-sky", sun: "bg-sun/20 text-ink",
};

export function Badge({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm ${toneClass[tone]}`}>{children}</span>;
}

export const statusTone: Record<string, Tone> = {
  open: "plain", partially_paid: "wait", paid: "go", disputed: "late", credited: "go",
  awaiting_approval: "wait", approved: "go", rejected: "plain", resolved: "go",
  scheduled: "sky", sent: "go", cancelled: "plain",
};

export const statusWord: Record<string, string> = {
  open: "not paid yet", partially_paid: "part paid", paid: "paid up", disputed: "problem", credited: "all settled",
  awaiting_approval: "needs you", approved: "done", rejected: "you said no", resolved: "done",
  scheduled: "coming up", sent: "sent", cancelled: "stopped",
};

/** Same header on every page: a colored emoji tile, the title, one plain line underneath. */
/** Page title: the same on every page. */
export function PageHeader({ title, children }: { emoji?: string; title: string; color?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-3xl leading-snug">{title}</h1>
      {children}
    </div>
  );
}

/** Section heading: the same size, weight and underline on every page. */
export const sectionTitle = "text-xl font-semibold! text-teal underline decoration-2 underline-offset-[6px]";
/** Sub-heading inside a section: smaller, no underline. */
export const subTitle = "text-lg font-semibold! text-teal";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={sectionTitle}>{children}</h2>;
}

export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Card({ title, right, children, className = "bg-white" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`sticker p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : String(e);
}

export function Oops({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="rounded-xl border border-late/30 bg-late/5 px-4 py-3 text-late">{msg}</div>;
}

/** Demo clock strip: shows demo time and the +1 day / +7 days buttons. */
export function DemoClock() {
  const clock = useQuery(api.reminders.clock, {});
  const advance = useMutation(api.reminders.advanceClock);
  const reset = useMutation(api.reminders.resetClock);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-2">Date: {clock ? when(clock.demoNow) : "…"}{clock && clock.offsetDays > 0 && <span className="text-ink/50"> (+{clock.offsetDays} days)</span>}</span>
      <button onClick={() => advance({ days: 1 })} className="btn bg-white px-3 py-1 text-base">+1 day</button>
      <button onClick={() => advance({ days: 7 })} className="btn bg-white px-3 py-1 text-base">+7 days</button>
      <button onClick={() => reset({})} className="px-2 py-1 text-base text-ink/60 hover:text-ink hover:underline underline-offset-4">Back to today</button>
    </div>
  );
}

/** Tucked-away demo controls: make orders, have a shop text us, move the clock. */
export function DemoTools({ open = false }: { open?: boolean }) {
  const shops = useQuery(api.billing.listShops, {});
  const createDemo = useAction(api.seed.createDemoOrder);
  const text = useAction(api.moderation.sendShopText);
  const [popup, setPopup] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setErr("");
    try { await fn(); } catch (e) { setErr(cleanError(e)); }
    setBusy("");
  }
  return (
    <details open={open} className="border-t border-line pt-6 text-base">
      <summary className="cursor-pointer text-teal hover:underline underline-offset-4">Try it out {busy && <span className="text-ink/60">({busy}…)</span>}</summary>
      <div className="mt-5 space-y-5">
        <DemoClock />
        <Oops msg={err} />
        {shops?.map((s) => (
          <div key={s._id} className="grid gap-2 sm:grid-cols-[11rem_1fr]">
            <span className="pt-1 text-ink/80">{s.name}</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink/60">New order:</span>
              {(["match", "short", "none"] as const).map((p) => (
                <button key={p} disabled={!!busy} onClick={() => run("Making the order", () => createDemo({ shopId: s._id, packing: p }))}
                  className="btn bg-white px-2 py-1 text-sm">
                  {p === "match" ? "Packed right" : p === "short" ? "Packed short" : "Not scanned"}
                </button>
              ))}
              <ShopText disabled={!!busy} onSend={(body) => run("Checking the text", async () => { const r = await text({ shopId: s._id, body }); if (r.blocked) setPopup(r.reason ?? "This message isn\u2019t about an order."); })} />
            </div>
          </div>
        ))}
        {shops?.length === 0 && <p className="text-ink/60">No shops yet. Run <code>npx convex run seed:seedDemo</code>.</p>}
        {popup && (
          <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => setPopup("")}>
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-semibold! text-late">This message isn&apos;t allowed</h2>
              <p className="mt-2 text-lg text-ink/80">{popup}</p>
              <p className="mt-2 text-base text-ink/60">Texts need to be about an order, like a missing or damaged item.</p>
              <button autoFocus onClick={() => setPopup("")} className="btn mt-5 bg-go px-4 py-2 text-base text-white">OK</button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function ShopText({ onSend, disabled }: { onSend: (body: string) => void; disabled: boolean }) {
  const [body, setBody] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Shop texts: missing 2 cases of Dr Pepper" className="w-72 rounded-lg border border-line bg-white px-2 py-1 text-sm" />
      <button disabled={disabled || !body} onClick={() => { onSend(body); setBody(""); }} className="btn bg-white px-2 py-1 text-sm">Send as shop</button>
    </span>
  );
}

/** "Got paid" control: one big button for the full amount, plus "they paid a different amount". */
export function GotPaid({ balance, onPay, disabled }: { balance: number; onPay: (cents: number) => void; disabled?: boolean }) {
  const [other, setOther] = useState(false);
  const [amt, setAmt] = useState("");
  if (other) {
    return (
      <span className="inline-flex items-center gap-2">
        <span>$</span>
        <input autoFocus value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" className="w-24 rounded-lg border border-line px-2 py-2" aria-label="How much they paid" />
        <button disabled={disabled || !amt} onClick={() => { const c = Math.round(parseFloat(amt) * 100); if (c > 0) onPay(c); setAmt(""); setOther(false); }}
          className="btn bg-go px-3 py-2 text-white">Save</button>
        <button onClick={() => setOther(false)} className="px-2 py-2 text-ink/60">Never mind</button>
      </span>
    );
  }
  return (
    <span className="flex items-center justify-end gap-4 whitespace-nowrap">
      <button onClick={() => setOther(true)} className="text-base text-ink/60 underline-offset-4 hover:text-ink hover:underline">Other amount</button>
      <button disabled={disabled} onClick={() => onPay(balance)} className="btn bg-go px-4 py-2 text-base text-white">Got paid</button>
    </span>
  );
}

/** "← Back": goes back, or to Today when the page was opened in its own tab. */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/today"))}
      className="inline-flex items-center gap-1.5 border-b-[1.5px] border-transparent pb-0.5 text-base text-ink/60 hover:border-ink hover:text-teal"
    >
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

/** "C2C is checking…" with three gently pulsing dots, so a wait never looks frozen. */
export function Checking({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-ink/60" role="status">
      <span aria-hidden className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-teal motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      {children}
    </p>
  );
}
