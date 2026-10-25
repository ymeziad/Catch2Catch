"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DemoTools, cap, disputeHeadline, dueText, usd } from "@/components/money";
import { getLang, t, useTr } from "@/components/i18n";
import { LiveClock } from "@/components/LiveClock";
import { ReadAloud } from "@/components/ReadAloud";
import { MoneyIn, SkyIcon, WhoOwes } from "@/components/TodayCharts";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** The owner's first screen: the time, a greeting, a plain numbered to-do list, and the money at a glance. */
export default function TodayPage() {
  const invoices = useQuery(api.billing.listInvoices, {});
  const disputes = useQuery(api.disputes.list, {});
  const clock = useQuery(api.reminders.clock, {});
  const loading = invoices === undefined || disputes === undefined || clock === undefined;
  const now = clock?.demoNow ?? 0;

  const open = (disputes ?? []).filter((d) => d.status === "awaiting_approval" || d.status === "open");
  const tr = useTr(open.map((d) => d.summary ?? disputeHeadline(d)));
  const tasks: { key: string; text: string; href: string; amount: number; late: boolean }[] = [
    ...open.map((d) => ({ key: d._id, href: `/disputes/${d._id}`, text: tr(d.summary ?? disputeHeadline(d)), amount: d.amountCents || d.invoiceBalanceCents, late: false })),
    ...(invoices ?? [])
      .filter((i) => i.overdue)
      .map((i) => ({ key: i._id, href: "/invoices", text: t("{shop} is {late} paying their bill.", { shop: i.shopName, late: dueText(i.dueAt, now).text }), amount: i.balanceCents, late: true })),
  ];
  const n = tasks.length;
  // Workload color: teal when clear, mustard for a couple of things, rust when it piles up.
  const tone = n === 0 ? "text-teal" : n <= 2 ? "text-sun" : "text-late";
  const es = getLang() === "es";
  // Good morning / afternoon / evening, from the app's clock.
  const hour = new Date(now).getHours();
  const part = hour >= 5 && hour < 12 ? 0 : hour >= 12 && hour < 17 ? 1 : 2;
  const hi = es ? ["Buenos días", "Buenas tardes", "Buenas noches"][part] : ["Good morning", "Good afternoon", "Good evening"][part];
  const g = es
    ? { before: n === 0 ? "Hoy no tiene" : "Hoy tiene", word: n === 0 ? "nada" : `${n} ${n === 1 ? "cosa" : "cosas"}`, after: n === 0 ? "pendiente." : n === 1 ? "pendiente." : "pendientes." }
    : { before: "You have", word: n === 0 ? "nothing" : `${n} ${n === 1 ? "thing" : "things"}`, after: "to take care of today." };

  const owed = (invoices ?? []).reduce((s, i) => s + i.balanceCents, 0);
  const late = (invoices ?? []).filter((i) => i.overdue).reduce((s, i) => s + i.balanceCents, 0);
  const collected = (invoices ?? []).flatMap((i) => i.payments).filter((p) => now - p.receivedAt < WEEK).reduce((s, p) => s + p.amountCents, 0);

  // What "Read it to me" says: the same things the page shows, as sentences.
  const speech = () => [
    `${hi}. ${g.before} ${g.word} ${g.after}`,
    ...tasks.map((x, i) => `${i + 1}. ${cap(x.text)}`),
    `${t("Owed to you")}: ${usd(owed)}.`,
    `${t("Late")}: ${usd(late)}.`,
    `${t("Collected this week")}: ${usd(collected)}.`,
  ].join(" ");

  return (
    <div className="space-y-12 transition-[opacity,translate] duration-700 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <LiveClock />
          {!loading && <ReadAloud text={speech} />}
        </div>
        {/* Greeting on its own line, bigger and bold; the to-do count underneath. */}
        <h1 className="mt-3 flex items-center gap-4 text-5xl font-semibold! leading-tight">
          {!loading && <SkyIcon part={part as 0 | 1 | 2} />}
          {loading ? "\u00a0" : `${hi}.`}
        </h1>
        <p className="mt-2 text-4xl leading-snug text-balance text-teal">
          {loading ? " " : n === 0 ? (
            <>{g.before} <span className={tone}>{g.word}</span> {g.after}</>
          ) : (
            <>{g.before} <a href="#todo" className={`${tone} underline decoration-2 underline-offset-4`}>{g.word}</a> {g.after}</>
          )}
        </p>
        {!loading && n === 0 && <p className="mt-3 text-lg text-ink/60">{t("New problems and late bills will show up here.")}</p>}
      </div>

      {n > 0 && (
        <ol id="todo" className="list-decimal divide-y divide-line border-y-2 border-line pl-7 text-xl marker:text-ink/50">
          {tasks.map((x) => (
            <li key={x.key} className="pl-3">
              <a href={x.href} target="_blank" rel="noopener" className="group flex items-center gap-6 py-5">
                <span className="min-w-0 flex-1 underline-offset-4 group-hover:underline">{cap(x.text)}</span>
                <span className={`shrink-0 ${x.late ? "text-late" : "text-ink/60"}`}>{usd(x.amount)}</span>
                <span aria-hidden className="shrink-0 text-teal transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none">→</span>
              </a>
            </li>
          ))}
        </ol>
      )}

      {!loading && (
        // Money at a glance: one 3-column grid. Who owes you sits under "Owed to you"; money in sits under "Collected".
        <section className="border-t-2 border-line">
          <dl className="grid grid-cols-3">
            <Stat label={t("Owed to you")} cents={owed} cls="text-ink" className="py-8 pr-8" />
            <Stat label={t("Late")} cents={late} cls={late ? "text-late" : "text-ink/35"} className="border-l-2 border-line px-8 py-8" />
            <Stat label={t("Collected this week")} cents={collected} cls="text-teal" className="border-l-2 border-line py-8 pl-8" />
          </dl>
          <div className="grid border-t-2 border-line md:grid-cols-3">
            <div className="py-8 md:pr-8"><WhoOwes invoices={invoices ?? []} showTotal={false} /></div>
            <div className="border-t-2 border-line py-8 md:col-span-2 md:border-t-0 md:border-l-2 md:pl-8">
              <MoneyIn payments={(invoices ?? []).flatMap((i) => i.payments)} now={now} />
            </div>
          </div>
        </section>
      )}

      <DemoTools />
    </div>
  );
}

function Stat({ label, cents, cls, className }: { label: string; cents: number; cls: string; className: string }) {
  const shown = useCountUp(cents);
  return (
    <div className={className}>
      <dt className="text-lg text-ink/60">{label}</dt>
      <dd className={`mt-1 text-4xl tabular-nums ${cls}`}>{usd(shown)}</dd>
    </div>
  );
}

/** Counts a number up when the page opens, and glides to new values (instant for people who turn off motion). */
function useCountUp(target: number, ms = 800) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    const begin = from.current;
    let raf = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const p = dur ? Math.min(1, (time - start) / dur) : 1;
      const v = Math.round(begin + (target - begin) * (1 - Math.pow(1 - p, 3)));
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
