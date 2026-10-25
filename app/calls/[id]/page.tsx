"use client";

import { Suspense, use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BackButton, sectionTitle, when } from "@/components/money";
import { t, useTr } from "@/components/i18n";

function ms(time: number) {
  const s = Math.floor(time / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink/60">Loading…</p>}>
      <CallDetail params={params} />
    </Suspense>
  );
}

/** One call: the recording, the conversation laid out like a chat, and the order taken from it. */
function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const data = useQuery(api.calls.getWithTranscript, { callId: id as Id<"calls"> });
  const shops = useQuery(api.billing.listShops, {});
  const tr = useTr([data?.order?.summaryText]);
  if (data === undefined) return <p className="text-ink/60">{t("Loading…")}</p>;
  if (data === null) return <p className="text-ink/60">{t("We couldn’t find this call.")}</p>;
  const { call, segments, order, recordingUrl } = data;
  const shop = shops?.find((s) => s.phone === call.buyerPhone);
  return (
    <div className="space-y-12 text-lg">
      <div>
        <BackButton />
        <h1 className="mt-4 text-3xl leading-snug">{t("Call with {who}", { who: shop?.name ?? call.buyerPhone })}</h1>
        <p className="mt-1 text-ink/60">{when(call.startedAt)} · {call.buyerPhone}</p>
        {call.error && <p className="mt-2 text-late">{call.error}</p>}
      </div>

      {recordingUrl && (
        <section>
          <h2 className={sectionTitle}>{t("The recording")}</h2>
          <audio controls src={recordingUrl} className="mt-4 w-full" />
        </section>
      )}

      <section>
        <h2 className={sectionTitle}>{t("What was said")}</h2>
        {segments.length === 0 && <p className="mt-4 text-ink/60">{t("Nothing written down yet.")}</p>}
        {/* Laid out like a text chat: the shop on the left, you on the right. */}
        <div className="mt-4 flex flex-col gap-3">
          {segments.map((s) => {
            const mine = s.role === "seller";
            return (
              <div key={s._id} className={`flex max-w-[80%] flex-col ${mine ? "items-end self-end" : "items-start self-start"}`}>
                <span className="mb-1 px-1 text-sm text-teal">{mine ? t("You") : shop?.contactName || shop?.name || t("Shop")} · {ms(s.startMs)}</span>
                <p className={`rounded-2xl px-4 py-2.5 text-base leading-relaxed ${mine ? "rounded-br-md bg-sun/15" : "rounded-bl-md bg-white ring-1 ring-line"}`}>{s.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {order && (
        <section>
          <h2 className={sectionTitle}>{t("The order from this call")}</h2>
          <p className="mt-4 whitespace-pre-wrap text-ink/80">{tr(order.summaryText)}</p>
        </section>
      )}
    </div>
  );
}
