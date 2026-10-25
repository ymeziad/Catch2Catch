"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const statusColor: Record<string, string> = {
  in_progress: "bg-blue-100 text-blue-800",
  recorded: "bg-indigo-100 text-indigo-800",
  transcribing: "bg-amber-100 text-amber-800",
  analyzing: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function CallsPage() {
  const calls = useQuery(api.calls.list, { limit: 50 });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Calls</h1>
      <p className="text-sm text-zinc-600 mt-1">Every consented call, its recording and transcript status.</p>
      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Buyer</th>
              <th className="px-3 py-2">Seller</th>
              <th className="px-3 py-2">Consent</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {calls === undefined && (
              <tr><td className="px-3 py-4 text-zinc-500" colSpan={6}>Loading…</td></tr>
            )}
            {calls?.length === 0 && (
              <tr><td className="px-3 py-4 text-zinc-500" colSpan={6}>No calls yet. Call the Twilio number or upload a recording.</td></tr>
            )}
            {calls?.map((c) => (
              <tr key={c._id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(c.startedAt).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono">{c.buyerPhone}</td>
                <td className="px-3 py-2 font-mono">{c.sellerPhone}</td>
                <td className="px-3 py-2">{c.buyerConsent ? "buyer ✓" : "buyer ✗"} · {c.sellerConsent ? "seller ✓" : "seller ✗"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${statusColor[c.status] ?? ""}`}>{c.status}</span>
                  {c.error && <div className="text-xs text-red-700 mt-1 max-w-xs truncate" title={c.error}>{c.error}</div>}
                </td>
                <td className="px-3 py-2"><Link className="underline" href={`/calls/${c._id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
