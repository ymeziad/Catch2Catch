"use client";

import { useEffect, useState } from "react";
import { cap, usd } from "@/components/money";
import { locale, t } from "@/components/i18n";

/**
 * The small pictures on Today: the sky (sun or moon for the time of day),
 * money in over the last two weeks, and who owes you. Plain SVG, with hover details.
 * Shop colors were checked for color-blind separation and contrast (dataviz validator).
 */

const DAY = 86_400_000;
const SHOP_COLORS = ["#0a83a8", "#b8890f", "#9c4a1c"]; // fixed order; a 4th+ shop folds into "Other"
const OTHER = "#8a969e";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    const first = setTimeout(update, 0);
    m.addEventListener("change", update);
    return () => { clearTimeout(first); m.removeEventListener("change", update); };
  }, []);
  return reduced;
}

/** Sun coming up (morning), full sun (afternoon), moon and stars (evening). Moves gently. */
export function SkyIcon({ part, size = 52 }: { part: 0 | 1 | 2; size?: number }) {
  const still = useReducedMotion();
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  if (part === 2) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
        <path d="M30 8a15 15 0 1 0 10 26A13 13 0 0 1 30 8z" fill="#0b4a5e" />
        {[[9, 12, 0], [40, 10, 0.8], [38, 24, 1.6]].map(([x, y, delay]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#b38615">
            {!still && <animate attributeName="opacity" values="1;0.2;1" dur="2.4s" begin={`${delay}s`} repeatCount="indefinite" />}
          </circle>
        ))}
      </svg>
    );
  }
  const cy = part === 0 ? 30 : 24;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <g>
        {!still && <animateTransform attributeName="transform" type="rotate" from={`0 24 ${cy}`} to={`360 24 ${cy}`} dur="40s" repeatCount="indefinite" />}
        {rays.map((r) => (
          <line key={r} x1="24" y1={cy - 13} x2="24" y2={cy - 17} stroke="#b38615" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${r} 24 ${cy})`} />
        ))}
      </g>
      <circle cx="24" cy={cy} r="9" fill="#b38615" />
      {part === 0 && <rect x="0" y="32" width="48" height="16" fill="white" />}
      {part === 0 && <line x1="6" y1="32" x2="42" y2="32" stroke="#0b4a5e" strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}

/** Bars: money that came in each day for the last 14 days. */
export function MoneyIn({ payments, now }: { payments: { amountCents: number; receivedAt: number }[]; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => {
    const from = start.getTime() - (13 - i) * DAY;
    const cents = payments.filter((p) => p.receivedAt >= from && p.receivedAt < from + DAY).reduce((s, p) => s + p.amountCents, 0);
    return { from, cents };
  });
  const total = days.reduce((s, d) => s + d.cents, 0);
  const max = Math.max(...days.map((d) => d.cents), 1);
  const W = 420, H = 120, gap = 6, bw = (W - gap * 13) / 14;
  const label = (ms: number) => new Date(ms).toLocaleDateString(locale(), { month: "short", day: "numeric" });

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-lg text-ink/60">{t("Money in, last 14 days")}</p>
        <p className="text-lg tabular-nums text-ink">{usd(total)}</p>
      </div>
      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full overflow-visible" role="img" aria-label={t("Money in, last 14 days")}>
          <line x1="0" y1={H} x2={W} y2={H} stroke="#e1e6ea" strokeWidth="1" />
          {days.map((d, i) => {
            const h = d.cents ? Math.max(4, (d.cents / max) * (H - 8)) : 0;
            const x = i * (bw + gap);
            const on = hover === i;
            return (
              <g key={d.from} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={x - gap / 2} y="0" width={bw + gap} height={H} fill="transparent" />
                {h > 0 ? (
                  <path d={`M${x},${H} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`} fill="#0b4a5e" opacity={hover === null || on ? 1 : 0.35} className="transition-opacity" />
                ) : (
                  <rect x={x} y={H - 2} width={bw} height="2" rx="1" fill={on ? "#0b4a5e" : "#e1e6ea"} />
                )}
              </g>
            );
          })}
          {[0, 7, 13].map((i) => (
            <text key={i} x={i * (bw + gap) + bw / 2} y={H + 17} textAnchor={i === 0 ? "start" : i === 13 ? "end" : "middle"} className="fill-ink/50 text-[11px]">
              {i === 13 ? t("Today") : label(days[i].from)}
            </text>
          ))}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-sm text-white shadow-lg"
            style={{ left: `${((hover * (bw + gap) + bw / 2) / W) * 100}%` }}>
            {cap(label(days[hover].from))} · {usd(days[hover].cents)}
          </div>
        )}
      </div>
    </div>
  );
}

/** One bar split by shop: who owes you, and how much. */
export function WhoOwes({ invoices, showTotal = true }: { invoices: { shopId: string; shopName: string; balanceCents: number }[]; showTotal?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const byShop = new Map<string, { id: string; name: string; cents: number }>();
  for (const i of invoices) {
    if (i.balanceCents <= 0) continue;
    const s = byShop.get(i.shopId) ?? { id: i.shopId, name: i.shopName, cents: 0 };
    s.cents += i.balanceCents;
    byShop.set(i.shopId, s);
  }
  // Color follows the shop (sorted by name, so it never changes with amounts), not its rank.
  const named = [...byShop.values()].sort((a, b) => a.name.localeCompare(b.name));
  const rows = named.slice(0, 3).map((s, i) => ({ ...s, color: SHOP_COLORS[i], href: `/shops/${s.id}` as string | null }));
  if (named.length > 3) rows.push({ id: "other", name: t("Other"), cents: named.slice(3).reduce((s, x) => s + x.cents, 0), color: OTHER, href: null });
  const total = rows.reduce((s, r) => s + r.cents, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-lg text-ink/60">{t("Who owes you")}</p>
        {showTotal && <p className="text-lg tabular-nums text-ink">{usd(total)}</p>}
      </div>
      {total === 0 ? (
        <p className="mt-4 text-lg text-ink/60">{t("Nobody owes you anything right now.")}</p>
      ) : (
        <>
          <div className="mt-5 flex h-4 gap-0.5" role="img" aria-label={t("Who owes you")}>
            {rows.map((r) => (
              <div key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}
                className="h-full rounded-[4px] transition-opacity first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(r.cents / total) * 100}%`, background: r.color, opacity: hover === null || hover === r.id ? 1 : 0.35 }}
                title={`${r.name}: ${usd(r.cents)}`} />
            ))}
          </div>
          <ul className="mt-5 space-y-2.5">
            {rows.map((r) => (
              <li key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} className="flex items-center gap-3 text-lg">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
                {r.href ? (
                  <a href={r.href} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate underline-offset-4 hover:underline">{r.name}</a>
                ) : <span className="min-w-0 flex-1 truncate">{r.name}</span>}
                <span className="tabular-nums text-ink/70" title={`${Math.round((r.cents / total) * 100)}%`}>{usd(r.cents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
