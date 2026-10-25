"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BackButton, Checking, SectionTitle, usd } from "@/components/money";
import { locale, t, useTr } from "@/components/i18n";

/** One shop's track record: AI summary, numbers, every purchase and problem. */
export function ShopView() {
  const { id } = useParams<{ id: string }>();
  const shopId = id as Id<"shops">;
  const data = useQuery(api.shops.profile, { shopId });
  const summarize = useAction(api.shops.summarize);
  const asked = useRef(false);
  const tr = useTr(data ? [data.shop.trackRecordSummary, ...data.disputes.map((d) => d.summary ?? (d.shopMessage ? `They texted: “${d.shopMessage}”` : "They paid less than they owed."))] : []);

  // Write (or refresh) the C2C summary once when the page opens and it's missing or out of date.
  useEffect(() => {
    if (data && data.summaryStale && !asked.current) {
      asked.current = true;
      summarize({ shopId }).catch(() => {});
    }
  }, [data, shopId, summarize]);

  if (data === undefined) return <p className="text-ink/60">{t("Loading…")}</p>;
  if (data === null) return <p className="text-ink/60">{t("We couldn’t find this shop.")}</p>;
  const { shop, stats, purchases, disputes } = data;
  const day = (ms: number) => new Date(ms).toLocaleDateString(locale(), { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-12 text-lg">
      <div>
        <BackButton />
        <h1 className="mt-4 text-3xl leading-snug">{shop.name}</h1>
        <p className="mt-1 text-base text-ink/60">{shop.contactName}, {shop.phone}</p>
      </div>

      <div className="max-w-3xl text-xl leading-relaxed">
        <span className="block font-semibold text-teal">{t("C2C Summary:")}</span>
        {shop.trackRecordSummary ? tr(shop.trackRecordSummary) : <Checking>{t("Writing a summary of their track record…")}</Checking>}
      </div>

      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div><dt className="text-base text-ink/50">{t("Orders")}</dt><dd className="text-2xl">{stats.orders}</dd></div>
        <div><dt className="text-base text-ink/50">{t("Paid on time")}</dt><dd className="text-2xl text-teal">{stats.paidOnTime}</dd></div>
        <div><dt className="text-base text-ink/50">{t("Paid late")}</dt><dd className={`text-2xl ${stats.paidLate ? "text-late" : "text-ink/35"}`}>{stats.paidLate}</dd></div>
        <div><dt className="text-base text-ink/50">{t("Problems")}</dt><dd className={`text-2xl ${stats.problems ? "text-wait" : "text-ink/35"}`}>{stats.problems}</dd></div>
      </dl>

      <section>
        <SectionTitle>{t("Purchases")}</SectionTitle>
        {purchases.length === 0 && <p className="mt-4 text-ink/60">{t("No purchases yet.")}</p>}
        <ul className="mt-4 divide-y divide-line">
          {purchases.map((p) => {
            const status =
              p.status === "disputed" ? { text: t("On hold: problem"), cls: "text-wait" }
              : p.overdueDays > 0 ? { text: p.overdueDays === 1 ? t("1 day late") : t("{n} days late", { n: p.overdueDays }), cls: "text-late" }
              : p.balanceCents > 0 ? { text: t("Not paid yet"), cls: "text-ink/60" }
              : (p.daysLate ?? 0) > 0 ? { text: p.daysLate === 1 ? t("Paid 1 day late") : t("Paid {n} days late", { n: p.daysLate ?? 0 }), cls: "text-late" }
              : { text: t(p.status === "credited" ? "Settled" : "Paid on time"), cls: "text-teal" };
            return (
              <li key={p.invoiceId} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[8rem_1fr_7rem_10rem]">
                <span className="text-ink/60">{day(p.date)}</span>
                <span>{p.items.join(", ")}</span>
                <span className="sm:text-right">{usd(p.amountCents)}</span>
                <span className={`sm:text-right ${status.cls}`}>{status.text}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {disputes.length > 0 && (
        <section>
          <SectionTitle>{t("Problems")}</SectionTitle>
          <ul className="mt-4 divide-y divide-line">
            {disputes.map((d) => (
              <li key={d._id} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[8rem_1fr_14rem]">
                <span className="text-ink/60">{day(d.date)}</span>
                <a href={`/disputes/${d._id}`} target="_blank" rel="noopener" className="hover:text-teal hover:underline underline-offset-4">
                  {tr(d.summary ?? (d.shopMessage ? `They texted: “${d.shopMessage}”` : "They paid less than they owed."))}
                </a>
                <span className="text-ink/60 sm:text-right">
                  {d.status === "open" || d.status === "awaiting_approval" ? <span className="text-wait">{t("Waiting on you")}</span>
                    : d.status === "rejected" ? t("You said no")
                    : outcome(d.recommendation, d.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function outcome(rec: string | undefined, cents: number): string {
  switch (rec) {
    case "credit": return t("Took {amount} off", { amount: usd(cents) });
    case "cash_refund": return t("Refunded {amount}", { amount: usd(cents) });
    case "replacement": return t("Sent the items again");
    case "reject_with_evidence": return t("Told them no");
    default: return t("Sorted out");
  }
}
