"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader, when } from "@/components/money";
import { t } from "@/components/i18n";

/** Every recorded order call: who called, whether both said yes to recording, and where it is. */
const statusWord: Record<string, { text: string; cls: string }> = {
  in_progress: { text: "On the call", cls: "text-teal" },
  recorded: { text: "Recorded", cls: "text-ink/60" },
  transcribing: { text: "Writing it down…", cls: "text-wait" },
  analyzing: { text: "Reading the order…", cls: "text-wait" },
  done: { text: "Done", cls: "text-teal" },
  failed: { text: "Something went wrong", cls: "text-late" },
};

export default function CallsPage() {
  const calls = useQuery(api.calls.list, { limit: 50 });
  const shops = useQuery(api.billing.listShops, {});
  const nameFor = (phone: string) => shops?.find((s) => s.phone === phone)?.name;
  return (
    <div className="space-y-12">
      <PageHeader title={t("Calls")} />
      <p className="-mt-8 text-lg text-ink/60">{t("Every order call, recorded only after both sides said yes.")}</p>
      {calls === undefined && <p className="text-lg text-ink/60">{t("Loading…")}</p>}
      {calls?.length === 0 && <p className="text-lg text-ink/60">{t("No calls yet.")}</p>}
      <ul className="divide-y divide-line border-y-2 border-line text-lg">
        {calls?.map((c) => {
          const st = statusWord[c.status] ?? { text: c.status, cls: "text-ink/60" };
          const shop = nameFor(c.buyerPhone);
          return (
            <li key={c._id}>
              <Link href={`/calls/${c._id}`} className="group grid items-baseline gap-x-6 gap-y-1 py-4 sm:grid-cols-[9rem_1fr_11rem]">
                <span className="whitespace-nowrap text-base text-ink/50">{when(c.startedAt)}</span>
                <span>
                  <span className="underline-offset-4 group-hover:underline">{shop ?? c.buyerPhone}</span>
                  {shop && <span className="text-base text-ink/50"> · {c.buyerPhone}</span>}
                  {!(c.buyerConsent && c.sellerConsent) && <span className="block text-base text-wait">{t("Not everyone agreed to recording")}</span>}
                  {c.error && <span className="block truncate text-base text-late" title={c.error}>{c.error}</span>}
                </span>
                <span className={`text-base sm:text-right ${st.cls}`}>{t(st.text)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
