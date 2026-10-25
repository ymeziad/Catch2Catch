"use client";

import { Suspense, use, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BarcodeScanner } from "../BarcodeScanner";

type Photo = { id: Id<"_storage">; preview: string };
type CheckResult = { checkId: Id<"packingChecks">; result: "match" | "mismatch" | "override"; problems: string[] };

const noSubscribe = () => () => {};

/** Same rule as the server: a 12-digit UPC-A and its 13-digit EAN form (leading 0) are one code. */
function codeKeys(raw: string): string[] {
  const code = raw.replace(/\D/g, "");
  if (code.length === 13 && code.startsWith("0")) return [code, code.slice(1)];
  if (code.length === 12) return [code, "0" + code];
  return [code];
}

export default function PackOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
      <PackCheck params={params} />
    </Suspense>
  );
}

function PackCheck({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const id = orderId as Id<"orders">;
  const data = useQuery(api.orders.getForPacking, { orderId: id });
  const generateUploadUrl = useMutation(api.orders.generatePackingUploadUrl);
  const submitCheck = useMutation(api.orders.submitPackingCheck);
  const overrideCheck = useMutation(api.orders.overridePackingCheck);

  const savedPacker = useSyncExternalStore(noSubscribe, () => localStorage.getItem("packerName") ?? "", () => "");
  const [typedPacker, setPacker] = useState<string | null>(null);
  const packer = typedPacker ?? savedPacker;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(0);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const barcodeToSku = useMemo(() => {
    const m = new Map<string, { sku: string; name: string }>();
    for (const b of data?.barcodes ?? []) for (const k of codeKeys(b.barcode)) m.set(k, { sku: b.sku, name: b.name });
    return m;
  }, [data?.barcodes]);

  const skuOf = (key: string): string | null => (key.startsWith("manual:") ? key.slice(7) : barcodeToSku.get(key)?.sku ?? null);

  if (data === undefined) return <p className="text-zinc-500">Loading…</p>;
  if (data === null) return <p className="text-zinc-500">Order not found.</p>;

  const expectedSkus = new Set(data.expected.map((e) => e.sku));
  const scannedFor = (sku: string) => Object.entries(counts).reduce((sum, [k, n]) => (skuOf(k) === sku ? sum + n : sum), 0);
  const extras = Object.entries(counts).filter(([k, n]) => n > 0 && !expectedSkus.has(skuOf(k) ?? ""));

  function onScan(raw: string) {
    const code = raw.replace(/\D/g, "") || raw.trim();
    setCounts((c) => ({ ...c, [code]: (c[code] ?? 0) + 1 }));
    setLastScan(barcodeToSku.get(code)?.name ?? `Unknown barcode ${code}`);
    setResult(null);
  }

  function adjust(sku: string, delta: 1 | -1) {
    setResult(null);
    setCounts((c) => {
      const next = { ...c };
      const manualKey = `manual:${sku}`;
      if (delta > 0) next[manualKey] = (next[manualKey] ?? 0) + 1;
      else if ((next[manualKey] ?? 0) > 0) next[manualKey] -= 1;
      else {
        const key = Object.keys(next).find((k) => skuOf(k) === sku && next[k] > 0);
        if (key) next[key] -= 1;
      }
      return next;
    });
  }

  async function onPhotos(files: FileList | null) {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
        if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        setPhotos((p) => [...p, { id: storageId, preview: URL.createObjectURL(file) }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem("packerName", packer.trim());
      const scans = Object.entries(counts).filter(([, n]) => n > 0).map(([barcode, qty]) => ({ barcode, qty }));
      const r = await submitCheck({ orderId: id, packerName: packer, scans, photoFileIds: photos.map((p) => p.id) });
      setResult({ checkId: r.checkId, result: r.result, problems: r.problems });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onOverride() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      await overrideCheck({ checkId: result.checkId, ownerName, reason: overrideReason });
      setResult({ ...result, result: "override" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = data.packable && packer.trim() !== "" && photos.length > 0 && uploading === 0 && !busy;

  return (
    <div className="mx-auto max-w-md space-y-5 pb-16">
      <div>
        <Link href="/pack" className="text-sm text-zinc-500 hover:underline">← Packing</Link>
        <h1 className="text-2xl font-semibold">Pack order #{data.ref}</h1>
        <p className="text-sm text-zinc-600">
          Status <b>{data.order.status}</b>
          {data.readyToShip && <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">ready to ship</span>}
        </p>
        {data.order.status !== "confirmed" && data.packable && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Not confirmed by both parties yet.</p>
        )}
        {!data.packable && <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-sm">This order has nothing to pack ({data.order.status}).</p>}
      </div>

      {result?.result === "match" && (
        <div className="rounded-xl bg-emerald-600 p-5 text-white">
          <div className="text-2xl font-bold">✓ Matches the order</div>
          <div className="mt-1">Ready to ship. Scans and photos are saved as evidence.</div>
        </div>
      )}
      {result?.result === "override" && (
        <div className="rounded-xl bg-amber-500 p-5 text-white">
          <div className="text-2xl font-bold">Owner override</div>
          <div className="mt-1">Shipping as packed. The mismatch and reason are on record.</div>
        </div>
      )}
      {result?.result === "mismatch" && (
        <div className="space-y-4 rounded-xl bg-red-600 p-5 text-white">
          <div>
            <div className="text-2xl font-bold">✗ Do not ship</div>
            <ul className="mt-2 space-y-1 text-lg font-medium">
              {result.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <p className="mt-2 text-sm text-red-100">Fix the box and scan again, or the owner can override with a reason.</p>
          </div>
          <div className="space-y-2 rounded-lg bg-white/10 p-3">
            <div className="text-sm font-semibold">Owner override</div>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Owner name" className="w-full rounded-md px-3 py-2 text-sm text-zinc-900" />
            <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason (e.g. buyer agreed by phone to take 4 cases)" rows={2} className="w-full rounded-md px-3 py-2 text-sm text-zinc-900" />
            <button disabled={busy || !ownerName.trim() || overrideReason.trim().length < 5} onClick={onOverride} className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
              Override and mark ready to ship
            </button>
          </div>
        </div>
      )}

      <section className="space-y-2 rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">Scan one item per {data.expected[0]?.unit ?? "case"}</div>
        <BarcodeScanner onScan={onScan} />
        {lastScan && <p className="text-sm text-zinc-600">Last scan: <b>{lastScan}</b></p>}
      </section>

      <section className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr><th className="p-3">Item</th><th className="p-3 text-center">Order</th><th className="p-3 text-center">Scanned</th><th /></tr>
          </thead>
          <tbody>
            {data.expected.map((e) => {
              const n = scannedFor(e.sku);
              const tone = n === e.qty ? "bg-emerald-50" : n > e.qty ? "bg-amber-50" : "";
              return (
                <tr key={e.sku} className={`border-t ${tone}`}>
                  <td className="p-3">
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-zinc-500">{e.unit}{e.barcode ? "" : " · no barcode registered"}</div>
                  </td>
                  <td className="p-3 text-center text-base">{e.qty}</td>
                  <td className="p-3 text-center text-base font-semibold">{n}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => adjust(e.sku, -1)} className="h-9 w-9 rounded-md border text-lg" aria-label={`One fewer ${e.name}`}>−</button>
                      <button onClick={() => adjust(e.sku, 1)} className="h-9 w-9 rounded-md border text-lg" aria-label={`One more ${e.name}`}>+</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {extras.map(([key, n]) => (
              <tr key={key} className="border-t bg-amber-50">
                <td className="p-3">
                  <div className="font-medium">{barcodeToSku.get(key)?.name ?? `Unknown barcode ${key}`}</div>
                  <div className="text-xs text-amber-700">not in this order</div>
                </td>
                <td className="p-3 text-center">0</td>
                <td className="p-3 text-center font-semibold">{n}</td>
                <td className="p-3">
                  <div className="flex justify-end">
                    <button onClick={() => setCounts((c) => ({ ...c, [key]: c[key] - 1 }))} className="h-9 w-9 rounded-md border text-lg">−</button>
                  </div>
                </td>
              </tr>
            ))}
            {data.expected.length === 0 && (
              <tr><td colSpan={4} className="p-3 text-zinc-500">This order has no lines.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">Photo of the packed order (required)</div>
        <label className="inline-block cursor-pointer rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
          Take photo
          <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { void onPhotos(e.target.files); e.target.value = ""; }} />
        </label>
        {uploading > 0 && <span className="ml-3 text-sm text-zinc-500">Uploading…</span>}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="Packed order" className="h-24 w-full rounded-md object-cover" />
                <button onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">✕</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-4">
        <label className="block text-sm">Packer name
          <input value={packer} onChange={(e) => setPacker(e.target.value)} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" />
        </label>
        <button disabled={!canSubmit} onClick={onSubmit} className="w-full rounded-md bg-emerald-600 py-3 text-base font-semibold text-white disabled:opacity-40">
          {busy ? "Checking…" : "Submit check"}
        </button>
        {!canSubmit && data.packable && !busy && (
          <p className="text-xs text-zinc-500">Needs a packer name and at least one photo.</p>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      {data.checks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-600">Previous checks</h2>
          {data.checks.map((c) => (
            <div key={c._id} className="rounded-lg border bg-white p-3 text-sm">
              <div className="flex justify-between">
                <b className={c.result === "match" ? "text-emerald-700" : c.result === "override" ? "text-amber-700" : "text-red-700"}>{c.result}</b>
                <span className="text-zinc-500">{c.packerName} · {new Date(c.checkedAt).toLocaleString()}</span>
              </div>
              {c.problems.length > 0 && <div className="mt-1 text-zinc-700">{c.problems.join("; ")}</div>}
              {c.overrideReason && <div className="mt-1 text-amber-800">Override by {c.overrideBy}: {c.overrideReason}</div>}
              {c.photoUrls.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {c.photoUrls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="Packing evidence" className="h-16 w-16 rounded object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
