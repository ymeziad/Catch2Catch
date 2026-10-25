import type { QueryCtx } from "../_generated/server";

/** Demo clock + money formatting helpers shared by billing, reminders and disputes. */

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** The demo clock: real time plus settings.demoClockOffsetMs ("+1 day" / "+7 days" buttons). */
export async function demoNow(ctx: QueryCtx): Promise<number> {
  const s = await ctx.db.query("settings").first();
  return Date.now() + (s?.demoClockOffsetMs ?? 0);
}

export async function ownerPhone(ctx: QueryCtx): Promise<string> {
  const s = await ctx.db.query("settings").first();
  return s?.ownerPhone || process.env.OWNER_PHONE || "";
}

/** 42000 -> "$420.00" */
export function usd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Short human order number for texts, e.g. "#K7Q2". */
export function shortId(id: string): string {
  return "#" + id.slice(-4).toUpperCase();
}

/** "Oct 27" in Pacific time. */
export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

/** Next 9:00 AM Pacific strictly after `ms` (fixed UTC-7 offset is fine for the demo). */
export function nextMorning9amPT(ms: number): number {
  const PT_OFFSET = -7 * HOUR;
  const local = ms + PT_OFFSET;
  const startOfLocalDay = Math.floor(local / DAY) * DAY;
  let nine = startOfLocalDay + 9 * HOUR;
  if (nine <= local) nine += DAY;
  return nine - PT_OFFSET;
}
