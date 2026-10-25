"use client";

import { Suspense, use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function ms(t: number) {
  const s = Math.floor(t / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
      <CallDetail params={params} />
    </Suspense>
  );
}

function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const data = useQuery(api.calls.getWithTranscript, { callId: id as Id<"calls"> });
  if (data === undefined) return <p className="text-zinc-500">Loading…</p>;
  if (data === null) return <p className="text-zinc-500">Call not found.</p>;
  const { call, segments, order, recordingUrl } = data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Call {call.twilioCallSid}</h1>
        <div className="text-sm text-zinc-600 mt-1">
          buyer <span className="font-mono">{call.buyerPhone}</span> · seller <span className="font-mono">{call.sellerPhone}</span> · status <b>{call.status}</b>
        </div>
        {call.error && <div className="mt-2 text-sm text-red-700">{call.error}</div>}
      </div>
      {recordingUrl && (
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm font-medium mb-2">Recording (left = buyer, right = seller)</div>
          <audio controls src={recordingUrl} className="w-full" />
        </div>
      )}
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium mb-3">Transcript ({segments.length} segments)</div>
        {segments.length === 0 && <p className="text-sm text-zinc-500">No transcript yet.</p>}
        <ol className="space-y-2">
          {segments.map((s) => (
            <li key={s._id} className={`flex gap-3 text-sm ${s.role === "seller" ? "flex-row-reverse text-right" : ""}`}>
              <span className="font-mono text-xs text-zinc-400 w-12 shrink-0 pt-1">{ms(s.startMs)}</span>
              <div className={`rounded-lg px-3 py-2 max-w-[75%] ${s.role === "buyer" ? "bg-zinc-100" : "bg-emerald-50"}`}>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">{s.role}{s.confidence !== undefined ? ` · ${(s.confidence * 100).toFixed(0)}%` : ""}</div>
                {s.text}
              </div>
            </li>
          ))}
        </ol>
      </div>
      {order && (
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm font-medium mb-2">Order · {order.status}</div>
          <pre className="text-xs whitespace-pre-wrap">{order.summaryText}</pre>
        </div>
      )}
    </div>
  );
}
