"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { celebrate } from "@/components/celebrate";
import { Badge, Oops, PageHeader, SectionTitle, cleanError, usd } from "@/components/money";

/**
 * Orders: what Claude took from each call. Buyer and distributor got the same summary on their phones;
 * confirming happens here, and a confirmed order becomes a bill.
 */
type Row = {
  order: Doc<"orders">;
  shopName: string | null;
  buyerPhone: string | null;
  sellerPhone: string | null;
  callId: Id<"calls"> | null;
  invoiceId: Id<"invoices"> | null;
};
type ShopOption = { _id: Id<"shops">; name: string; phone: string };

const statusBadge: Record<Doc<"orders">["status"], { word: string; tone: "go" | "wait" | "late" | "plain" }> = {
  verbal_agreement: { word: "agreed on the call", tone: "wait" },
  needs_review: { word: "needs a look", tone: "late" },
  no_agreement: { word: "no deal", tone: "plain" },
  confirmed: { word: "confirmed", tone: "go" },
  disputed: { word: "problem", tone: "late" },
  cancelled: { word: "cancelled", tone: "plain" },
};

type CatalogItem = Doc<"catalogProducts">;

export default function OrdersPage() {
  const data = useQuery(api.orderDesk.list, {});
  const catalog = (useQuery(api.catalog.list, {}) ?? []) as CatalogItem[];
  const market = new Map(catalog.map((p) => [p.sku, p]));
  const [err, setErr] = useState("");
  const rows = (data?.rows ?? []) as Row[];
  const waiting = rows.filter((r) => r.order.status === "verbal_agreement" || r.order.status === "needs_review");
  const done = rows.filter((r) => r.order.status === "confirmed" || r.order.status === "disputed");
  const noDeal = rows.filter((r) => r.order.status === "no_agreement" || r.order.status === "cancelled");

  return (
    <div className="space-y-12">
      <PageHeader title="Orders" />
      <p className="-mt-8 text-lg text-ink/60">
        What the C2C AI Assistant took from each call. The buyer and the distributor both got this summary on WhatsApp.
      </p>
      <Oops msg={err} />

      <section>
        <SectionTitle>Waiting for you</SectionTitle>
        {data !== undefined && waiting.length === 0 && <p className="mt-4 text-lg text-ink/60">Nothing to confirm.</p>}
        <ul className="mt-4 divide-y divide-line">
          {waiting.map((r) => <OrderRow key={r.order._id} row={r} shops={data?.shops ?? []} market={market} onError={setErr} />)}
        </ul>
      </section>

      {done.length > 0 && (
        <section>
          <SectionTitle>Confirmed</SectionTitle>
          <ul className="mt-4 divide-y divide-line">
            {done.map((r) => <OrderRow key={r.order._id} row={r} shops={data?.shops ?? []} market={market} onError={setErr} />)}
          </ul>
        </section>
      )}

      {noDeal.length > 0 && (
        <section>
          <SectionTitle>No deal</SectionTitle>
          <ul className="mt-4 divide-y divide-line">
            {noDeal.map((r) => <OrderRow key={r.order._id} row={r} shops={data?.shops ?? []} market={market} onError={setErr} />)}
          </ul>
        </section>
      )}

      <MarketPrices catalog={catalog} onError={setErr} />
    </div>
  );
}

/** Reference retail prices (Walmart, via Apify), so both sides can see what's reasonable. Information only. */
function MarketPrices({ catalog, onError }: { catalog: CatalogItem[]; onError: (m: string) => void }) {
  const refresh = useAction(api.prices.refreshNow);
  const [busy, setBusy] = useState(false);
  if (catalog.length === 0) return null;
  const updated = Math.max(0, ...catalog.map((p) => p.priceUpdatedAt ?? 0));
  return (
    <section>
      <SectionTitle>Market prices</SectionTitle>
      <p className="mt-2 text-base text-ink/60">
        Store prices from Walmart, for comparing what was agreed on a call. They never change an order.
        {updated > 0 ? ` Updated ${new Date(updated).toLocaleString()}.` : " Not loaded yet."}
      </p>
      <ul className="mt-4 divide-y divide-line text-lg">
        {catalog.map((p) => (
          <li key={p.sku} className="flex flex-wrap items-center gap-x-6 py-3">
            <span className="min-w-0 flex-1">{p.name} <span className="text-base text-ink/50">({p.unitsPerCase} per case)</span></span>
            <span className="shrink-0 text-right">
              {p.priceRetailRefCents !== undefined ? `${usd(p.priceRetailRefCents)} per case` : <span className="text-ink/40">no price yet</span>}
            </span>
            {p.priceRefSource && (
              <a href={p.priceRefSource} target="_blank" rel="noopener" className="shrink-0 text-base text-teal underline-offset-4 hover:underline">listing</a>
            )}
          </li>
        ))}
      </ul>
      <button
        disabled={busy}
        onClick={async () => {
          onError("");
          setBusy(true);
          try { await refresh({}); } catch (e) { onError(cleanError(e)); } finally { setBusy(false); }
        }}
        className="btn mt-4 bg-white px-4 py-2 text-base"
      >
        {busy ? "Getting prices…" : "Refresh market prices"}
      </button>
    </section>
  );
}

function OrderRow({ row, shops, market, onError }: { row: Row; shops: ShopOption[]; market: Map<string, CatalogItem>; onError: (m: string) => void }) {
  const { order } = row;
  const confirm = useMutation(api.orders.confirmManually);
  const [busy, setBusy] = useState(false);
  const badge = statusBadge[order.status];
  const canConfirm = order.status === "verbal_agreement";

  async function run(party: "buyer" | "seller" | "both") {
    onError("");
    setBusy(true);
    try {
      const r = await confirm({ orderId: order._id, party, confirmedBy: "owner" });
      if (r.promoted) celebrate();
    } catch (e) {
      onError(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xl">{row.shopName ?? `Unknown caller ${row.buyerPhone ?? ""}`}</span>
        <Badge tone={badge.tone}>{badge.word}</Badge>
        <span className="ml-auto text-lg">{order.totalCents !== undefined ? usd(order.totalCents) : "No total yet"}</span>
      </div>

      {order.lines.length > 0 && (
        <ul className="text-lg text-ink/80">
          {order.lines.map((l, i) => (
            <li key={i}>
              {l.qty > 0 ? `${l.qty} ${l.unit === "case" ? (l.qty === 1 ? "case" : "cases") : l.unit} ` : ""}{l.description}
              {l.qty === 0 && <span className="text-wait"> (quantity not stated)</span>}
              {l.unitPriceCents !== undefined && <span className="text-ink/60"> at {usd(l.unitPriceCents)}</span>}
              {l.unit === "case" && market.get(l.sku)?.priceRetailRefCents !== undefined && (
                <span className="text-base text-ink/45"> · store price {usd(market.get(l.sku)!.priceRetailRefCents)}/case</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {(order.unavailableItems ?? []).length > 0 && (
        <div className="text-base text-ink/60">
          Currently not available:{" "}
          {(order.unavailableItems ?? []).map((u) => (u.qty > 0 ? `${u.qty} ${u.unit === "case" ? (u.qty === 1 ? "case" : "cases") : u.unit} ${u.description}` : u.description)).join(", ")}
        </div>
      )}

      <div className="text-base text-ink/60">
        Delivery: {order.deliveryDate ?? "not discussed"} · Payment: {order.paymentTerms ?? "not discussed"}
      </div>

      {order.openIssues.length > 0 && (
        <ul className="list-disc pl-5 text-base text-wait">
          {order.openIssues.map((issue, i) => <li key={i}>{issue}</li>)}
        </ul>
      )}

      {!order.shopId && <AttachShop orderId={order._id} shops={shops} onError={onError} />}

      <div className="flex flex-wrap items-center gap-3 text-base">
        {canConfirm && (
          <>
            <button disabled={busy || !order.shopId} onClick={() => run("both")} className="btn bg-go px-4 py-2 text-white">
              Confirm order
            </button>
            {!order.buyerConfirmedAt && (
              <button disabled={busy} onClick={() => run("buyer")} className="btn bg-white px-3 py-2">Buyer confirmed</button>
            )}
            {!order.sellerConfirmedAt && (
              <button disabled={busy} onClick={() => run("seller")} className="btn bg-white px-3 py-2">Distributor confirmed</button>
            )}
          </>
        )}
        {order.status === "needs_review" && (
          <span className="text-wait">Check the points above against the call before treating this as an order.</span>
        )}
        {row.invoiceId && <Link href="/invoices" className="text-teal underline-offset-4 hover:underline">See the bill</Link>}
        {row.callId && (
          <Link href={`/calls/${row.callId}`} className="text-teal underline-offset-4 hover:underline">Hear the call and read the transcript</Link>
        )}
        <span className="text-ink/50">
          {order.buyerConfirmedAt ? "Buyer ✓" : "Buyer not yet"} · {order.sellerConfirmedAt ? "Distributor ✓" : "Distributor not yet"}
        </span>
      </div>

      {canConfirm && !order.shopId && (
        <p className="text-base text-ink/60">Attach this caller to a shop first so the order can become a bill.</p>
      )}
    </li>
  );
}

function AttachShop({ orderId, shops, onError }: { orderId: Id<"orders">; shops: ShopOption[]; onError: (m: string) => void }) {
  const attach = useMutation(api.orderDesk.attachShop);
  const create = useMutation(api.orderDesk.createShopForOrder);
  const [shopId, setShopId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(fn: () => Promise<unknown>) {
    onError("");
    setBusy(true);
    try { await fn(); } catch (e) { onError(cleanError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-mist p-3 text-base">
      <span className="text-ink/70">Who is this caller?</span>
      <select value={shopId} onChange={(e) => setShopId(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5">
        <option value="">Pick a shop…</option>
        {shops.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
      </select>
      <button disabled={busy || !shopId} onClick={() => go(() => attach({ orderId, shopId: shopId as Id<"shops"> }))} className="btn bg-white px-3 py-1.5">
        Use this shop
      </button>
      <span className="text-ink/50">or</span>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New shop name" className="rounded-md border border-line bg-white px-2 py-1.5" />
      <button disabled={busy || !name.trim()} onClick={() => go(() => create({ orderId, name }))} className="btn bg-white px-3 py-1.5">
        Add shop
      </button>
    </div>
  );
}
