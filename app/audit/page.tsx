"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, when } from "@/components/money";

const actorTone: Record<string, "violet" | "green" | "blue" | "amber" | "zinc"> = { agent: "violet", owner: "green", shop: "blue", packer: "amber", system: "zinc" };

export default function AuditPage() {
  const rows = useQuery(api.audit.recent, { limit: 300 });
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const shown = (rows ?? []).filter((r) => (!actor || r.actor === actor) && (!q || `${r.action} ${r.reason} ${r.entityType}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-zinc-600">Every action, who did it, and why.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {["", "agent", "owner", "shop", "packer", "system"].map((a) => (
          <button key={a} onClick={() => setActor(a)} className={`rounded border px-3 py-1 ${actor === a ? "bg-zinc-900 text-white" : "bg-white"}`}>{a || "all"}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="ml-auto rounded border px-2 py-1" />
      </div>
      <ul className="space-y-1">
        {shown.map((r) => (
          <li key={r._id} className="rounded border bg-white px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="font-mono">{when(r.at)}</span>
              <Badge tone={actorTone[r.actor]}>{r.actor}</Badge>
              <span className="font-medium text-zinc-800">{r.action.replace(/_/g, " ")}</span>
              <span>{r.entityType}</span>
            </div>
            <div className="mt-1">{r.reason}</div>
            {r.evidenceRefs && r.evidenceRefs.length > 0 && (
              <div className="mt-1 text-xs text-zinc-500">Evidence: {r.evidenceRefs.map((e) => `${e.type}${e.detail ? ` (${e.detail})` : ""}`).join(" · ")}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
