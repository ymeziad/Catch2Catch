"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader, when } from "@/components/money";
import { t } from "@/components/i18n";

/** Every text in and out (SMS or WhatsApp), with what happened to it. */
function deliveryLabel(status?: string): { text: string; cls: string } | null {
  if (!status) return null;
  if (status === "dashboard_only") return { text: "Only on the dashboard", cls: "text-ink/50" };
  if (status === "delivered" || status === "read") return { text: "Delivered", cls: "text-teal" };
  if (status === "undelivered" || status === "failed" || status === "canceled") return { text: "Not delivered", cls: "text-late" };
  return { text: "On its way", cls: "text-ink/50" };
}

export default function MessagesPage() {
  const messages = useQuery(api.messages.list, { limit: 100 });
  const shops = useQuery(api.billing.listShops, {});
  const nameFor = (phone: string) => shops?.find((s) => s.phone === phone)?.name ?? phone;
  return (
    <div className="space-y-12">
      <PageHeader title={t("Texts")} />
      <p className="-mt-8 text-lg text-ink/60">{t("Every text in and out, by SMS or WhatsApp.")}</p>
      {messages === undefined && <p className="text-lg text-ink/60">{t("Loading…")}</p>}
      {messages?.length === 0 && <p className="text-lg text-ink/60">{t("No texts yet.")}</p>}
      <ul className="divide-y divide-line border-y-2 border-line">
        {messages?.map((m) => {
          const incoming = m.direction === "in";
          const d = !incoming ? deliveryLabel(m.deliveryStatus) : null;
          const state = m.status === "simulated" ? { text: "Not sent to a phone", cls: "text-wait" } : m.status === "failed" ? { text: "Failed", cls: "text-late" } : d;
          return (
            <li key={m._id} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[9rem_1fr]">
              <span className="whitespace-nowrap text-base text-ink/50">{when(m.createdAt)}</span>
              <div>
                <p className="text-base text-ink/60">
                  <span className="text-teal">{incoming ? t("From {who}", { who: nameFor(m.from) }) : t("To {who}", { who: nameFor(m.to) })}</span>
                  {" · "}{m.channel === "whatsapp" ? "WhatsApp" : "SMS"}
                  {state && <span className={state.cls}> · {t(state.text)}</span>}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-lg">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
