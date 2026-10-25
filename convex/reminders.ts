import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { DAY, HOUR, demoNow, nextMorning9amPT, ownerPhone, shortDate, shortId, usd } from "./lib/clock";

/**
 * OWNER: Person 3. Automatic reminders, driven by a cron every minute (convex/crons.ts).
 *
 * Invoice schedule:  payment_due_soon (due - 2d) · payment_due (due) · payment_late (due + 3d) · escalate_owner (due + 7d)
 * Memory over time:  a shop that paid late 2+ times in the last 90 days skips "due soon" and escalates at due + 3d.
 * Unconfirmed order: remind after 2h, again next morning 9 AM PT, then flag the owner.
 * Everything stops when the invoice is paid or a dispute opens, and resumes when a dispute resolves with a balance.
 * All times use the demo clock (Date.now() + settings.demoClockOffsetMs).
 */

type Kind = Doc<"reminders">["kind"];

// --------------------------------------------------------------------------- shop memory

/** How many invoices this shop paid after the due date, in the last 90 days (demo time). */
export async function latePaymentCount(ctx: QueryCtx, shopId: Id<"shops">, now: number): Promise<number> {
  const invoices = await ctx.db.query("invoices").withIndex("by_shopId", (q) => q.eq("shopId", shopId)).collect();
  let late = 0;
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const pays = await ctx.db.query("payments").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).collect();
    if (pays.length === 0) continue;
    const lastPaid = Math.max(...pays.map((p) => p.receivedAt));
    if (lastPaid > inv.dueAt && lastPaid >= now - 90 * DAY) late++;
  }
  return late;
}

// --------------------------------------------------------------------------- scheduling helpers

export async function scheduleInvoiceReminders(ctx: MutationCtx, invoice: Doc<"invoices">, now: number, opts: { resume?: boolean } = {}) {
  const late = await latePaymentCount(ctx, invoice.shopId, now);
  const riskyShop = late >= 2;
  const plan: { kind: Kind; at: number }[] = riskyShop
    ? [
        { kind: "payment_due", at: invoice.dueAt },
        { kind: "payment_late", at: invoice.dueAt + 3 * DAY },
        { kind: "escalate_owner", at: invoice.dueAt + 3 * DAY + 1 },
      ]
    : [
        { kind: "payment_due_soon", at: invoice.dueAt - 2 * DAY },
        { kind: "payment_due", at: invoice.dueAt },
        { kind: "payment_late", at: invoice.dueAt + 3 * DAY },
        { kind: "escalate_owner", at: invoice.dueAt + 7 * DAY },
      ];

  // On resume, skip steps already in the past; if everything is past, escalate soon instead of spamming the shop.
  let toSchedule = opts.resume ? plan.filter((p) => p.at > now) : plan.filter((p) => p.kind !== "payment_due_soon" || p.at > now);
  if (opts.resume && toSchedule.length === 0) toSchedule = [{ kind: "escalate_owner", at: now + HOUR }];

  for (const p of toSchedule) {
    await ctx.db.insert("reminders", { kind: p.kind, invoiceId: invoice._id, scheduledFor: p.at, status: "scheduled" });
  }
  await ctx.db.insert("auditLog", {
    actor: "agent",
    action: opts.resume ? "reminders_resumed" : "reminders_scheduled",
    entityType: "invoice",
    entityId: invoice._id,
    reason: riskyShop
      ? `Escalated early: ${late} late payments in 90 days. Skipping "due soon" and escalating to the owner at due date + 3 days.`
      : `Scheduled ${toSchedule.map((p) => `${p.kind} (${shortDate(p.at)})`).join(", ")}`,
    at: now,
  });
}

/** Cancel every pending reminder for an invoice (paid, or a dispute opened). */
export async function cancelInvoiceReminders(ctx: MutationCtx, invoiceId: Id<"invoices">, why: string, now: number) {
  const pending = await ctx.db.query("reminders").withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId)).collect();
  let n = 0;
  for (const r of pending) {
    if (r.status === "scheduled") {
      await ctx.db.patch(r._id, { status: "cancelled" });
      n++;
    }
  }
  if (n > 0) {
    await ctx.db.insert("auditLog", { actor: "agent", action: "reminders_cancelled", entityType: "invoice", entityId: invoiceId, reason: `Cancelled ${n} pending reminder(s): ${why}`, at: now });
  }
}

export async function cancelOrderReminders(ctx: MutationCtx, orderId: Id<"orders">, why: string, now: number) {
  const pending = await ctx.db.query("reminders").withIndex("by_orderId", (q) => q.eq("orderId", orderId)).collect();
  let n = 0;
  for (const r of pending) {
    if (r.status === "scheduled") {
      await ctx.db.patch(r._id, { status: "cancelled" });
      n++;
    }
  }
  if (n > 0) {
    await ctx.db.insert("auditLog", { actor: "agent", action: "reminders_cancelled", entityType: "order", entityId: orderId, reason: `Cancelled ${n} pending order reminder(s): ${why}`, at: now });
  }
}

async function scheduleOrderReminders(ctx: MutationCtx, order: Doc<"orders">, now: number) {
  const first = now + 2 * HOUR;
  const morning = nextMorning9amPT(first);
  await ctx.db.insert("reminders", { kind: "order_unconfirmed", orderId: order._id, scheduledFor: first, status: "scheduled" });
  await ctx.db.insert("reminders", { kind: "order_unconfirmed", orderId: order._id, scheduledFor: morning, status: "scheduled" });
  await ctx.db.insert("reminders", { kind: "escalate_owner", orderId: order._id, scheduledFor: morning + 2 * HOUR, status: "scheduled" });
  await ctx.db.insert("auditLog", {
    actor: "agent", action: "order_reminders_scheduled", entityType: "order", entityId: order._id,
    reason: `Order is a verbal agreement awaiting confirmation: reminders at +2h and next morning 9 AM, then owner flag.`, at: now,
  });
}

// --------------------------------------------------------------------------- message text

async function reminderText(ctx: QueryCtx, r: Doc<"reminders">): Promise<{ to: string; body: string; relatedType: string; relatedId: string } | null> {
  if (r.invoiceId) {
    const inv = await ctx.db.get(r.invoiceId);
    if (!inv) return null;
    const shop = await ctx.db.get(inv.shopId);
    if (!shop) return null;
    const es = shop.language === "es";
    const ref = shortId(inv.orderId);
    const amt = usd(inv.balanceCents);
    const due = shortDate(inv.dueAt);
    if (r.kind === "escalate_owner") {
      return {
        to: await ownerPhone(ctx), relatedType: "invoice", relatedId: inv._id,
        body: `Catch2Catch: ${shop.name} still owes ${amt} on order ${ref} (due ${due}). Reminders haven't worked; please call them.`,
      };
    }
    const bodies: Record<string, [string, string]> = {
      payment_due_soon: [`Hi ${shop.contactName}, friendly reminder: ${amt} for order ${ref} is due ${due}.`, `Hola ${shop.contactName}, recordatorio: ${amt} del pedido ${ref} vence el ${due}.`],
      payment_due: [`Hi ${shop.contactName}, ${amt} for order ${ref} is due today. Reply if anything was wrong with the delivery.`, `Hola ${shop.contactName}, ${amt} del pedido ${ref} vence hoy. Responda si hubo algún problema con la entrega.`],
      payment_late: [`Hi ${shop.contactName}, ${amt} for order ${ref} is now overdue (was due ${due}). Please pay or reply if something was missing.`, `Hola ${shop.contactName}, ${amt} del pedido ${ref} está vencido (venció el ${due}). Por favor pague o responda si faltó algo.`],
    };
    const pair = bodies[r.kind];
    if (!pair) return null;
    return { to: shop.phone, body: es ? pair[1] : pair[0], relatedType: "invoice", relatedId: inv._id };
  }
  if (r.orderId) {
    const order = await ctx.db.get(r.orderId);
    if (!order) return null;
    const shop = order.shopId ? await ctx.db.get(order.shopId) : null;
    const ref = shortId(order._id);
    if (r.kind === "escalate_owner") {
      return { to: await ownerPhone(ctx), relatedType: "order", relatedId: order._id, body: `Catch2Catch: order ${ref}${shop ? ` for ${shop.name}` : ""} is still not confirmed by both sides. Please check it.` };
    }
    const call = await ctx.db.get(order.callId);
    const to = shop?.phone ?? call?.buyerPhone;
    if (!to) return null;
    const es = shop?.language === "es";
    return {
      to, relatedType: "order", relatedId: order._id,
      body: es
        ? `Recordatorio: confirme el pedido ${ref} respondiendo CONFIRM, o DISPUTE si algo está mal.`
        : `Reminder: please confirm order ${ref} by replying CONFIRM, or DISPUTE if something is wrong.`,
    };
  }
  return null;
}

/** Is this reminder still relevant? (Paid / disputed / confirmed things don't get chased.) */
async function stillRelevant(ctx: QueryCtx, r: Doc<"reminders">): Promise<string | null> {
  if (r.invoiceId) {
    const inv = await ctx.db.get(r.invoiceId);
    if (!inv) return "invoice missing";
    if (inv.status === "paid" || inv.status === "credited" || inv.balanceCents <= 0) return "invoice already settled";
    if (inv.status === "disputed") return "invoice is under dispute";
    return null;
  }
  if (r.orderId) {
    const o = await ctx.db.get(r.orderId);
    if (!o) return "order missing";
    if (o.status !== "verbal_agreement" && o.status !== "needs_review") return `order is ${o.status}`;
    if (o.buyerConfirmedAt && o.sellerConfirmedAt) return "both parties confirmed";
    return null;
  }
  return "no target";
}

// --------------------------------------------------------------------------- cron

/** Runs every minute. Sends due reminders, and makes sure every unconfirmed order has a reminder plan. */
export const processDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = await demoNow(ctx);

    // 1) Unconfirmed orders without reminders get a plan (so Person 2 doesn't have to call us).
    const unconfirmed = await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "verbal_agreement")).order("desc").take(50);
    for (const o of unconfirmed) {
      if (o.buyerConfirmedAt && o.sellerConfirmedAt) continue;
      const existing = await ctx.db.query("reminders").withIndex("by_orderId", (q) => q.eq("orderId", o._id)).first();
      if (!existing) await scheduleOrderReminders(ctx, o, now);
    }

    // 2) Send everything that is due on the demo clock.
    const due = await ctx.db
      .query("reminders")
      .withIndex("by_status_scheduledFor", (q) => q.eq("status", "scheduled").lte("scheduledFor", now))
      .take(25);
    for (const r of due) {
      const skip = await stillRelevant(ctx, r);
      if (skip) {
        await ctx.db.patch(r._id, { status: "cancelled" });
        await ctx.db.insert("auditLog", { actor: "agent", action: "reminder_skipped", entityType: "reminder", entityId: r._id, reason: `Not sent: ${skip}`, at: now });
        continue;
      }
      const msg = await reminderText(ctx, r);
      if (!msg || !msg.to) {
        await ctx.db.patch(r._id, { status: "cancelled" });
        await ctx.db.insert("auditLog", { actor: "agent", action: "reminder_skipped", entityType: "reminder", entityId: r._id, reason: "Not sent: no phone number to text", at: now });
        continue;
      }
      await ctx.db.patch(r._id, { status: "sent", sentAt: now });
      await ctx.scheduler.runAfter(0, internal.messaging.sendSms, msg);
      await ctx.db.insert("auditLog", {
        actor: "agent", action: `reminder_sent_${r.kind}`, entityType: r.invoiceId ? "invoice" : "order", entityId: (r.invoiceId ?? r.orderId)!,
        reason: `Sent ${r.kind.replace(/_/g, " ")} reminder to ${msg.to} (scheduled for ${new Date(r.scheduledFor).toISOString()})`,
        evidenceRefs: [{ type: "reminder", id: r._id, detail: msg.body.slice(0, 120) }], at: now,
      });
    }
  },
});

// --------------------------------------------------------------------------- demo clock + dashboard

export const clock = query({
  args: {},
  handler: async (ctx) => {
    const s = await ctx.db.query("settings").first();
    const offset = s?.demoClockOffsetMs ?? 0;
    return { offsetMs: offset, offsetDays: Math.round((offset / DAY) * 10) / 10, demoNow: Date.now() + offset };
  },
});

/** "+1 day" / "+7 days" buttons. Then runs the reminder sweep immediately so judges see texts appear. */
export const advanceClock = mutation({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    if (!(days > 0 && days <= 60)) throw new Error("days must be between 0 and 60");
    let s = await ctx.db.query("settings").first();
    if (!s) {
      const id = await ctx.db.insert("settings", { demoClockOffsetMs: 0, ownerPhone: process.env.OWNER_PHONE ?? "" });
      s = (await ctx.db.get(id))!;
    }
    const offset = s.demoClockOffsetMs + days * DAY;
    await ctx.db.patch(s._id, { demoClockOffsetMs: offset });
    await ctx.db.insert("auditLog", { actor: "owner", action: "demo_clock_advanced", entityType: "settings", entityId: s._id, reason: `Demo clock moved forward ${days} day(s); now +${Math.round(offset / DAY)} days`, at: Date.now() + offset });
    await ctx.scheduler.runAfter(0, internal.reminders.processDue, {});
  },
});

export const resetClock = mutation({
  args: {},
  handler: async (ctx) => {
    const s = await ctx.db.query("settings").first();
    if (!s) return;
    await ctx.db.patch(s._id, { demoClockOffsetMs: 0 });
    await ctx.db.insert("auditLog", { actor: "owner", action: "demo_clock_reset", entityType: "settings", entityId: s._id, reason: "Demo clock reset to real time", at: Date.now() });
  },
});

/** Reminders timeline for the dashboard (with shop names). */
export const timeline = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("reminders").order("desc").take(limit ?? 100);
    const out = [];
    for (const r of rows) {
      let shopName: string | undefined;
      let escalated = false;
      if (r.invoiceId) {
        const inv = await ctx.db.get(r.invoiceId);
        const shop = inv ? await ctx.db.get(inv.shopId) : null;
        shopName = shop?.name;
      } else if (r.orderId) {
        const o = await ctx.db.get(r.orderId);
        const shop = o?.shopId ? await ctx.db.get(o.shopId) : null;
        shopName = shop?.name;
      }
      if (r.kind === "escalate_owner" && r.status === "sent") escalated = true;
      out.push({ ...r, shopName, escalated });
    }
    return out.sort((a, b) => a.scheduledFor - b.scheduledFor);
  },
});
