"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { celebrate } from "@/components/celebrate";
import { cleanError, usd } from "@/components/money";

/**
 * What the shop (buyer) sees from the texted link: its order, with − / + and Remove on each item.
 * Written in the shop's own language (from its shop record), not the owner's.
 */
const words = {
  en: {
    title: "Your order", intro: "Need more or fewer? Tap − or +, then Save.", remove: "Remove", undo: "Put it back", removed: "Taking this off",
    total: "New total", totalPlain: "Total", save: "Save changes", saving: "Saving…", nothing: "Nothing changed yet.", saved: "Saved. We texted you the new order.",
    each: "each", notFound: "We couldn't find this order.", loading: "Loading…",
    locked: {
      packed: "Your order is already packed, so it can't be changed here. Please call us.",
      paid: "This order is already paid, so it can't be changed here. Please call us.",
      problem: "We're sorting out a problem with this order. Please call us to change it.",
      cancelled: "This order was cancelled.",
    } as Record<string, string>,
  },
  es: {
    title: "Su pedido", intro: "¿Necesita más o menos? Toque − o +, y luego Guardar.", remove: "Quitar", undo: "Volver a poner", removed: "Se va a quitar",
    total: "Nuevo total", totalPlain: "Total", save: "Guardar cambios", saving: "Guardando…", nothing: "Todavía no hay cambios.", saved: "Listo. Le enviamos el pedido nuevo por mensaje.",
    each: "c/u", notFound: "No encontramos este pedido.", loading: "Cargando…",
    locked: {
      packed: "Su pedido ya está empacado, así que no se puede cambiar aquí. Por favor llámenos.",
      paid: "Este pedido ya está pagado, así que no se puede cambiar aquí. Por favor llámenos.",
      problem: "Estamos resolviendo un problema con este pedido. Llámenos para cambiarlo.",
      cancelled: "Este pedido fue cancelado.",
    } as Record<string, string>,
  },
};

export function ShopOrderView() {
  const { orderId } = useParams<{ orderId: string }>();
  const data = useQuery(api.orderEdits.forShop, { orderId });
  const save = useMutation(api.orderEdits.saveChanges);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (data === undefined) return <p className="text-ink/60">{words.en.loading}</p>;
  if (data === null) return <p className="text-lg">{words.en.notFound}</p>;
  const w = words[data.lang];
  const q = (sku: string, original: number) => qty[sku] ?? original;
  const changed = data.lines.some((l) => q(l.sku, l.qty) !== l.qty);
  const total = data.lines.reduce((s, l) => s + (l.unitCents ?? 0) * q(l.sku, l.qty), 0);
  const set = (sku: string, n: number) => { setMsg(null); setQty((m) => ({ ...m, [sku]: Math.max(0, Math.min(500, n)) })); };

  async function onSave() {
    if (!data) return;
    setBusy(true); setMsg(null);
    try {
      await save({ orderId, lines: data.lines.map((l) => ({ sku: l.sku, qty: q(l.sku, l.qty) })) });
      setQty({});
      setMsg({ ok: true, text: w.saved });
      celebrate();
    } catch (e) {
      setMsg({ ok: false, text: cleanError(e) });
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10 text-lg" lang={data.lang}>
      <div>
        <p className="text-ink/50">{data.shopName}</p>
        <h1 className="mt-1 text-4xl leading-snug">{w.title} {data.orderRef}</h1>
        {!data.locked && <p className="mt-3 text-ink/70">{w.intro}</p>}
      </div>

      {data.locked && <p className="rounded-xl bg-sun/15 px-5 py-4 text-ink">{w.locked[data.locked]}</p>}

      <ul className="divide-y divide-line border-y border-line">
        {data.lines.map((l) => {
          const n = q(l.sku, l.qty);
          const gone = n === 0;
          return (
            <li key={l.sku} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
              <div className="min-w-0 flex-1">
                <p className={gone ? "text-ink/40 line-through" : ""}>{l.description}</p>
                <p className="text-base text-ink/50">
                  {gone ? w.removed : l.unitCents !== null ? `${usd(l.unitCents)} ${w.each}` : ""}
                </p>
              </div>
              {!data.locked && (gone ? (
                <button onClick={() => set(l.sku, l.qty)} className="text-base text-teal underline-offset-4 hover:underline">{w.undo}</button>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex items-center rounded-full ring-1 ring-line">
                    <button aria-label="−" onClick={() => set(l.sku, n - 1)} className="grid h-12 w-12 place-items-center rounded-full text-2xl text-teal hover:bg-mist">−</button>
                    <span className="w-12 text-center text-xl tabular-nums" aria-live="polite">{n}</span>
                    <button aria-label="+" onClick={() => set(l.sku, n + 1)} className="grid h-12 w-12 place-items-center rounded-full text-2xl text-teal hover:bg-mist">+</button>
                  </div>
                  <button onClick={() => set(l.sku, 0)} className="text-base text-ink/60 underline-offset-4 hover:text-late hover:underline">{w.remove}</button>
                </div>
              ))}
              {data.locked && <span className="text-xl tabular-nums">{l.qty}</span>}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-base text-ink/60">{changed ? w.total : w.totalPlain}</p>
          <p className={`text-3xl tabular-nums ${changed ? "text-teal" : ""}`}>{usd(changed ? total : data.totalCents)}</p>
        </div>
        {!data.locked && (
          <button disabled={!changed || busy} onClick={onSave} className="btn bg-go px-6 py-3 text-lg text-white disabled:opacity-40">
            {busy ? w.saving : w.save}
          </button>
        )}
      </div>
      {msg && <p className={msg.ok ? "text-teal" : "text-late"}>{msg.text}</p>}
      {!changed && !msg && !data.locked && <p className="text-base text-ink/50">{w.nothing}</p>}
    </div>
  );
}
