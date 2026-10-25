"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader, actorName, when } from "@/components/money";

/** Everything that happened, who did it, and why. */
const who = ["", "agent", "owner", "shop", "system"];

export default function AuditPage() {
  const rows = useQuery(api.audit.recent, { limit: 300 });
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const shown = (rows ?? []).filter((r) => (!actor || r.actor === actor) && (!q || `${r.action} ${r.reason}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-12">
      <PageHeader title="History" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-base">
        {who.map((a) => (
          <button key={a} onClick={() => setActor(a)}
            className={`border-b-2 pb-1 ${actor === a ? "border-sun text-ink" : "border-transparent text-ink/60 hover:text-ink"}`}>
            {a ? actorName[a] : "Everyone"}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="ml-auto w-56 rounded-lg bg-mist px-3 py-2" />
      </div>
      <ul className="divide-y divide-line">
        {shown.map((r) => (
          <li key={r._id} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[9rem_7rem_1fr]">
            <span className="whitespace-nowrap text-base text-ink/50">{when(r.at)}</span>
            <span className="text-base text-teal">{actorName[r.actor] ?? r.actor}</span>
            <span className="text-lg">{r.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
