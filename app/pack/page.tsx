"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BarcodeScanner } from "./BarcodeScanner";
import { when } from "@/components/money";
import { t } from "@/components/i18n";

function usd(cents: number | undefined) {
  return cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`;
}

export default function PackingHome() {
  return (
    <div className="space-y-14">
      <Queue />
      <Catalog />
    </div>
  );
}

function Queue() {
  const rows = useQuery(api.orders.packingQueue, {});
  const word = (r: { latestResult: string | null }) =>
    r.latestResult === "match" ? { text: t("Ready to ship"), cls: "text-teal" }
    : r.latestResult === "override" ? { text: t("Shipped anyway"), cls: "text-wait" }
    : r.latestResult === "mismatch" ? { text: t("Didn’t match"), cls: "text-red-700" }
    : { text: t("Not packed yet"), cls: "text-ink/50" };
  return (
    <section>
      <h1 className="text-3xl leading-snug">{t("Packing")}</h1>
      <p className="mt-2 text-lg text-ink/60">{t("Open an order on your phone, scan every case, take a photo of each item, and check the box.")}</p>
      {rows === undefined && <p className="mt-6 text-lg text-ink/60">{t("Loading…")}</p>}
      {rows?.length === 0 && <p className="mt-6 text-lg text-ink/60">{t("No orders waiting to be packed.")}</p>}
      <ul className="mt-6 divide-y divide-line border-y-2 border-line text-lg">
        {rows?.map((r) => {
          const w = word(r);
          return (
            <li key={r.orderId}>
              <Link href={`/pack/${r.orderId}`} className="group grid items-baseline gap-x-6 gap-y-1 py-4 sm:grid-cols-[9rem_1fr_9rem]">
                <span className="whitespace-nowrap text-base text-ink/50">{when(r.createdAt)}</span>
                <span className="underline-offset-4 group-hover:underline">
                  {t("Order #{ref}", { ref: r.ref })}
                  <span className="text-base text-ink/50"> · {r.lineCount === 1 ? t("1 item") : t("{n} items", { n: r.lineCount })}</span>
                </span>
                <span className={`text-base sm:text-right ${w.cls}`}>{w.text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
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
          <h2 className="text-xl font-semibold">{t("Catalog and prices")}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {t("Store price = the Walmart price per case, refreshed daily. An agreed price above it, or below 40% of it, gets flagged.")}
          </p>
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {t(refreshing ? "Refreshing (up to 3 minutes)…" : "Refresh prices")}
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
              <th className="p-3">{t("Product")}</th>
              <th className="p-3">{t("Barcode")}</th>
              <th className="p-3">{t("Your price / case")}</th>
              <th className="p-3">{t("Store price / case")}</th>
            </tr>
          </thead>
          <tbody>
            {products === undefined && <tr><td colSpan={4} className="p-3 text-zinc-500">{t("Loading…")}</td></tr>}
            {products?.length === 0 && (
              <tr><td colSpan={4} className="p-3 text-zinc-500">Catalog is empty. Run the seed command at the top of catalog:seed in convex/catalog.ts.</td></tr>
            )}
            {products?.map((p) => (
              <tr key={p._id} className="border-t align-top">
                <td className="p-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-zinc-500">{p.sku} · {t("{n} per case", { n: p.unitsPerCase })}</div>
                </td>
                <td className="p-3">
                  <div className="font-mono text-xs">{p.barcode ?? "—"}</div>
                  <button onClick={() => setScanFor(scanFor === p.sku ? null : p.sku)} className="mt-1 text-xs text-blue-700 hover:underline">
                    {t(scanFor === p.sku ? "Cancel" : "Scan to set")}
                  </button>
                  {scanFor === p.sku && (
                    <div className="mt-2 w-72">
                      <BarcodeScanner compact onScan={(code) => void onBarcode(p.sku, code)} />
                    </div>
                  )}
                </td>
                <td className="p-3">
                  {usd(p.priceWholesaleCents)}
                  <button onClick={() => void onWholesale(p.sku, p.priceWholesaleCents)} className="ml-2 text-xs text-blue-700 hover:underline">{t("edit")}</button>
                </td>
                <td className="p-3">
                  <div>{usd(p.priceRetailRefCents)}</div>
                  {p.priceRefSource && (
                    <a href={p.priceRefSource} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">{t("Walmart listing")}</a>
                  )}
                  <div className="text-xs text-zinc-500">
                    {p.priceUpdatedAt ? t("updated {date}", { date: when(p.priceUpdatedAt) }) : t("never refreshed")}
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
