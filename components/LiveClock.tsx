"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { locale } from "@/components/i18n";
import { cap } from "@/components/money";

/** Today's date and a ticking clock, on the same clock as the rest of the app (it moves with "+1 day"). */
export function LiveClock() {
  const clock = useQuery(api.reminders.clock, {});
  const offset = clock?.offsetMs;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (offset === undefined) return;
    const tick = () => setNow(Date.now() + offset);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [offset]);
  if (now === null) return <p className="text-lg text-ink/50">&nbsp;</p>;
  const d = new Date(now);
  return (
    <p className="text-lg text-ink/50">
      {cap(d.toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" }))}
      <span className="mx-2 text-ink/25">·</span>
      <span className="tabular-nums text-ink/70">{d.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" })}</span>
    </p>
  );
}
