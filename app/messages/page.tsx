"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const statusColor: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  simulated: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  received: "bg-blue-100 text-blue-800",
};

export default function MessagesPage() {
  const messages = useQuery(api.messages.list, { limit: 100 });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Messages</h1>
      <p className="text-sm text-zinc-600 mt-1">
        Every SMS in and out. <b>simulated</b> means Twilio could not deliver (trial / A2P 10DLC) but the message is on record.
      </p>
      <ul className="mt-6 space-y-2">
        {messages === undefined && <li className="text-zinc-500 text-sm">Loading…</li>}
        {messages?.length === 0 && <li className="text-zinc-500 text-sm">No messages yet.</li>}
        {messages?.map((m) => (
          <li key={m._id} className="rounded-lg border bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className={`rounded px-2 py-0.5 ${statusColor[m.status] ?? ""}`}>{m.direction} · {m.status}</span>
              <span className="font-mono">{m.from} → {m.to}</span>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
              {m.relatedType && <span>{m.relatedType}{m.relatedId ? `:${m.relatedId.slice(0, 8)}…` : ""}</span>}
            </div>
            <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
