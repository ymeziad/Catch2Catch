"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * The page background follows the time of day (on the app's clock, so "+1 day" moves it too):
 * a soft sunrise in the morning, clear sky in the afternoon, deep blue with a few stars in the evening.
 * Everything you read sits on a white card on top of it.
 */
const SKIES = [
  // morning: warm sunrise fading into pale sky
  "radial-gradient(ellipse 90% 60% at 50% 0%, #fbd9a6 0%, rgba(251,217,166,0) 70%), linear-gradient(180deg, #fde8cc 0%, #eef4f6 55%, #e3eef2 100%)",
  // afternoon: clear blue sky
  "radial-gradient(ellipse 80% 50% at 80% 0%, #ffffff 0%, rgba(255,255,255,0) 60%), linear-gradient(180deg, #bfdeee 0%, #dcebf3 50%, #eef5f8 100%)",
  // evening: deep navy with scattered stars and a soft glow
  [
    "radial-gradient(1.5px 1.5px at 8% 12%, rgba(255,255,255,0.9), transparent)",
    "radial-gradient(1px 1px at 22% 30%, rgba(255,255,255,0.7), transparent)",
    "radial-gradient(1.5px 1.5px at 35% 8%, rgba(255,255,255,0.8), transparent)",
    "radial-gradient(1px 1px at 52% 22%, rgba(255,255,255,0.6), transparent)",
    "radial-gradient(1.5px 1.5px at 68% 10%, rgba(255,255,255,0.9), transparent)",
    "radial-gradient(1px 1px at 81% 28%, rgba(255,255,255,0.7), transparent)",
    "radial-gradient(1.5px 1.5px at 93% 14%, rgba(255,255,255,0.8), transparent)",
    "radial-gradient(1px 1px at 14% 55%, rgba(255,255,255,0.5), transparent)",
    "radial-gradient(1px 1px at 88% 60%, rgba(255,255,255,0.5), transparent)",
    "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(179,134,21,0.22) 0%, rgba(179,134,21,0) 70%)",
    "linear-gradient(180deg, #0b1f2c 0%, #12354a 55%, #1b4a5e 100%)",
  ].join(", "),
];

export function timeOfDay(ms: number): 0 | 1 | 2 {
  const h = new Date(ms).getHours();
  return h >= 5 && h < 12 ? 0 : h >= 12 && h < 17 ? 1 : 2;
}

export function TimeBackdrop() {
  const clock = useQuery(api.reminders.clock, {});
  const offset = clock?.offsetMs;
  const [part, setPart] = useState<0 | 1 | 2 | null>(null);
  useEffect(() => {
    if (offset === undefined) return;
    const tick = () => setPart(timeOfDay(Date.now() + offset));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [offset]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-mist">
      {SKIES.map((bg, i) => (
        <div key={i} className="absolute inset-0 transition-opacity duration-1000 ease-out motion-reduce:transition-none"
          style={{ backgroundImage: bg, opacity: part === i ? 1 : 0 }} />
      ))}
    </div>
  );
}
