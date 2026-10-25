"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const statusColor: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  simulated: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  received: "bg-blue-100 text-blue-800",
};

// What the carrier actually did with an outbound text (from Twilio's delivery callback).
function deliveryLabel(status?: string): { text: string; cls: string } | null {
  if (!status) return null;
  if (status === "delivered" || status === "read") return { text: "delivered to phone", cls: "text-green-700" };
  if (status === "undelivered" || status === "failed" || status === "canceled") return { text: "not delivered", cls: "text-red-700" };
  return { text: `in transit (${status})`, cls: "text-zinc-500" };
}

export default function MessagesPage() {
  const messages = useQuery(api.messages.list, { limit: 100 });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Messages</h1>
      <p className="text-sm text-zinc-600 mt-1">
        Every message in and out, by SMS or WhatsApp. <b>simulated</b> means it never reached the phone (blocked by
        the carrier, or the person hasn&apos;t joined the WhatsApp sandbox) but it is on record. Outbound messages also
        show the delivery result.
      </p>
      <ul className="mt-6 space-y-2">
        {messages === undefined && <li className="text-zinc-500 text-sm">Loading…</li>}
        {messages?.length === 0 && <li className="text-zinc-500 text-sm">No messages yet.</li>}
        {messages?.map((m) => (
          <li key={m._id} className="rounded-lg border bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className={`rounded px-2 py-0.5 ${statusColor[m.status] ?? ""}`}>{m.channel === "whatsapp" ? "WhatsApp" : "SMS"} {m.direction} · {m.status}</span>
              <span className="font-mono">{m.from} → {m.to}</span>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
              {m.relatedType && <span>{m.relatedType}{m.relatedId ? `:${m.relatedId.slice(0, 8)}…` : ""}</span>}
              {(() => {
                const d = m.direction === "out" ? deliveryLabel(m.deliveryStatus) : null;
                return d ? <span className={d.cls}>· {d.text}{m.deliveryError ? ` (${m.deliveryError})` : ""}</span> : null;
              })()}
            </div>
            <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
