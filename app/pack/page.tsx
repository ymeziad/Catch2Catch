"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BarcodeScanner } from "./BarcodeScanner";

function usd(cents: number | undefined) {
  return cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`;
}

const RESULT_STYLE: Record<string, string> = {
  match: "bg-emerald-100 text-emerald-800",
  override: "bg-amber-100 text-amber-800",
  mismatch: "bg-red-100 text-red-800",
};

export default function PackingHome() {
  return (
    <div className="space-y-10">
      <Queue />
      <Catalog />
    </div>
  );
}

function Queue() {
  const rows = useQuery(api.orders.packingQueue, {});
  return (
    <section>
      <h1 className="text-2xl font-semibold">Packing</h1>
      <p className="mt-1 text-sm text-zinc-600">Open an order on your phone, scan every item, photograph the box, submit.</p>
      <div className="mt-4 divide-y rounded-lg border bg-white">
        {rows === undefined && <p className="p-4 text-sm text-zinc-500">Loading…</p>}
        {rows?.length === 0 && <p className="p-4 text-sm text-zinc-500">No orders waiting to be packed.</p>}
        {rows?.map((r) => (
          <Link key={r.orderId} href={`/pack/${r.orderId}`} className="flex items-center justify-between p-4 hover:bg-zinc-50">
            <div>
              <div className="font-medium">Order #{r.ref}</div>
              <div className="text-xs text-zinc-500">{r.lineCount} line(s) · {r.status} · {new Date(r.createdAt).toLocaleString()}</div>
            </div>
            <span className={`rounded px-2 py-0.5 text-xs ${r.latestResult ? RESULT_STYLE[r.latestResult] : "bg-zinc-100 text-zinc-600"}`}>
              {r.latestResult ?? "not packed"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

type RefreshRow = { sku: string; status: string; note: string };

function Catalog() {
  const products = useQuery(api.catalog.list, {});
  const setBarcode = useMutation(api.catalog.setBarcode);
  const setWholesale = useMutation(api.catalog.setWholesalePrice);
  const refreshNow = useAction(api.prices.refreshNow);
  const [scanFor, setScanFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshRows, setRefreshRows] = useState<RefreshRow[] | null>(null);

  async function onBarcode(sku: string, code: string) {
    try {
      const r = await setBarcode({ sku, barcode: code });
      setMessage(`Saved barcode ${r.barcode} on ${sku}`);
      setScanFor(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function onWholesale(sku: string, current: number | undefined) {
    const input = window.prompt(`Wholesale price per case for ${sku} (dollars)`, current !== undefined ? (current / 100).toFixed(2) : "");
    if (input === null) return;
    const cents = Math.round(Number(input.replace(/[^0-9.]/g, "")) * 100);
    try {
      await setWholesale({ sku, priceWholesaleCents: cents });
      setMessage(`Wholesale price for ${sku} set to ${usd(cents)}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    setRefreshRows(null);
    try {
      const rows = await refreshNow({});
      setRefreshRows(rows);
      if (rows.length === 0) setMessage("Price refresh skipped (APIFY_TOKEN not set); showing cached prices.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Catalog and prices</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Retail reference = Walmart price via Apify, per case, refreshed daily. An agreed price above it, or below 40% of it, is flagged.
          </p>
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {refreshing ? "Refreshing (up to ~3 min)…" : "Refresh prices"}
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-zinc-700">{message}</p>}
      {refreshRows && refreshRows.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md bg-zinc-100 p-3 text-xs">
          {refreshRows.map((r) => <li key={r.sku}><b>{r.sku}</b> {r.status}: {r.note}</li>)}
        </ul>
      )}
      <div className="mt-4 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Barcode</th>
              <th className="p-3">Wholesale / case</th>
              <th className="p-3">Retail ref / case</th>
            </tr>
          </thead>
          <tbody>
            {products === undefined && <tr><td colSpan={4} className="p-3 text-zinc-500">Loading…</td></tr>}
            {products?.length === 0 && (
              <tr><td colSpan={4} className="p-3 text-zinc-500">Catalog is empty. Run the seed command at the top of catalog:seed in convex/catalog.ts.</td></tr>
            )}
            {products?.map((p) => (
              <tr key={p._id} className="border-t align-top">
                <td className="p-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-zinc-500">{p.sku} · {p.unitsPerCase} per {p.unit}</div>
                </td>
                <td className="p-3">
                  <div className="font-mono text-xs">{p.barcode ?? "—"}</div>
                  <button onClick={() => setScanFor(scanFor === p.sku ? null : p.sku)} className="mt-1 text-xs text-blue-700 hover:underline">
                    {scanFor === p.sku ? "Cancel" : "Scan to set"}
                  </button>
                  {scanFor === p.sku && (
                    <div className="mt-2 w-72">
                      <BarcodeScanner compact onScan={(code) => void onBarcode(p.sku, code)} />
                    </div>
                  )}
                </td>
                <td className="p-3">
                  {usd(p.priceWholesaleCents)}
                  <button onClick={() => void onWholesale(p.sku, p.priceWholesaleCents)} className="ml-2 text-xs text-blue-700 hover:underline">edit</button>
                </td>
                <td className="p-3">
                  <div>{usd(p.priceRetailRefCents)}</div>
                  {p.priceRefSource && (
                    <a href={p.priceRefSource} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">Walmart listing</a>
                  )}
                  <div className="text-xs text-zinc-500">
                    {p.priceUpdatedAt ? `updated ${new Date(p.priceUpdatedAt).toLocaleString()}` : "never refreshed"}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
