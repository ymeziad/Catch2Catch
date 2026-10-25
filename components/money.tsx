"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { ReactNode } from "react";

/** OWNER: Amaan. Small shared UI bits for the money pages. */

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

const tones: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  zinc: "bg-zinc-100 text-zinc-700",
  violet: "bg-violet-100 text-violet-800",
};

export function Badge({ tone = "zinc", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const statusTone: Record<string, keyof typeof tones> = {
  open: "blue", partially_paid: "amber", paid: "green", disputed: "red", credited: "violet",
  awaiting_approval: "amber", approved: "green", rejected: "zinc", resolved: "green",
  scheduled: "blue", sent: "green", cancelled: "zinc",
};

export function Card({ title, right, children }: { title?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4">
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-medium">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Demo clock strip: shows demo time and the +1 day / +7 days buttons. */
export function DemoClock() {
  const clock = useQuery(api.reminders.clock, {});
  const advance = useMutation(api.reminders.advanceClock);
  const reset = useMutation(api.reminders.resetClock);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-zinc-900 px-4 py-2 text-sm text-white">
      <span className="font-mono">Demo clock: {clock ? when(clock.demoNow) : "…"}</span>
      {clock && clock.offsetDays > 0 && <span className="text-zinc-400">(+{clock.offsetDays} days)</span>}
      <span className="flex-1" />
      <button onClick={() => advance({ days: 1 })} className="rounded bg-white/10 px-3 py-1 hover:bg-white/20">+1 day</button>
      <button onClick={() => advance({ days: 7 })} className="rounded bg-white/10 px-3 py-1 hover:bg-white/20">+7 days</button>
      <button onClick={() => reset({})} className="rounded px-3 py-1 text-zinc-400 hover:text-white">reset</button>
    </div>
  );
}
