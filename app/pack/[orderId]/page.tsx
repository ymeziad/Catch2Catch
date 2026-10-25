"use client";

import { Suspense, use, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BarcodeScanner } from "../BarcodeScanner";
import { celebrate } from "@/components/celebrate";
import { cleanError, sectionTitle, when } from "@/components/money";
import { t } from "@/components/i18n";

/**
 * Packing an order: scan every case, then take ONE PHOTO PER ITEM showing its full count together
 * (e.g. all 5 cases of Dr Pepper in the box). Scans and photos are saved as evidence for any later problem.
 */

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
    <Suspense fallback={<p className="text-ink/60">Loading…</p>}>
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

  const savedPacker = useSyncExternalStore(noSubscribe, () => { try { return localStorage.getItem("packerName") ?? ""; } catch { return ""; } }, () => "");
  const [typedPacker, setPacker] = useState<string | null>(null);
  const packer = typedPacker ?? savedPacker;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [itemPhotos, setItemPhotos] = useState<Record<string, Photo>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
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

  if (data === undefined) return <p className="text-ink/60">{t("Loading…")}</p>;
  if (data === null) return <p className="text-ink/60">{t("We couldn’t find this order.")}</p>;

  const expectedSkus = new Set(data.expected.map((e) => e.sku));
  const scannedFor = (sku: string) => Object.entries(counts).reduce((sum, [k, n]) => (skuOf(k) === sku ? sum + n : sum), 0);
  const extras = Object.entries(counts).filter(([k, n]) => n > 0 && !expectedSkus.has(skuOf(k) ?? ""));
  const needPhoto = data.expected.filter((e) => !itemPhotos[e.sku]);
  const anyUploading = Object.values(uploading).some(Boolean);

  function onScan(raw: string) {
    const code = raw.replace(/\D/g, "") || raw.trim();
    setCounts((c) => ({ ...c, [code]: (c[code] ?? 0) + 1 }));
    setLastScan(barcodeToSku.get(code)?.name ?? t("Unknown barcode {code}", { code }));
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

  async function onItemPhoto(sku: string, file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading((u) => ({ ...u, [sku]: true }));
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
      if (!res.ok) throw new Error(t("The photo didn’t upload. Check your signal and try again."));
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setItemPhotos((p) => ({ ...p, [sku]: { id: storageId, preview: URL.createObjectURL(file) } }));
      setResult(null);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setUploading((u) => ({ ...u, [sku]: false }));
    }
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      try { localStorage.setItem("packerName", packer.trim()); } catch { /* fine without it */ }
      const scans = Object.entries(counts).filter(([, n]) => n > 0).map(([barcode, qty]) => ({ barcode, qty }));
      const linePhotos = Object.entries(itemPhotos).map(([sku, p]) => ({ sku, fileId: p.id }));
      const r = await submitCheck({ orderId: id, packerName: packer, scans, photoFileIds: [], linePhotos });
      setResult({ checkId: r.checkId, result: r.result, problems: r.problems });
      if (r.result === "match") celebrate();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(cleanError(e));
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
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = data.packable && packer.trim() !== "" && needPhoto.length === 0 && !anyUploading && !busy;
  const statusLine = data.order.status === "confirmed" ? t("Confirmed by both sides.") : data.order.status === "verbal_agreement" ? t("The shop hasn’t confirmed this order yet.") : null;

  return (
    <div className="mx-auto max-w-2xl space-y-10 text-lg">
      <div>
        <Link href="/pack" className="inline-flex items-center gap-1.5 border-b-[1.5px] border-transparent pb-0.5 text-base text-ink/60 hover:border-ink hover:text-teal">
          <span aria-hidden>←</span> {t("Packing")}
        </Link>
        <h1 className="mt-4 text-3xl leading-snug">{t("Pack order #{ref}", { ref: data.ref })}</h1>
        {statusLine && <p className="mt-1 text-ink/60">{statusLine}</p>}
        {!data.packable && <p className="mt-3 text-ink/70">{t("There’s nothing to pack for this order.")}</p>}
        {data.readyToShip && !result && <p className="mt-3 text-teal">{t("Already checked and ready to ship.")}</p>}
      </div>

      {result?.result === "match" && (
        <div className="rounded-2xl bg-teal px-6 py-5 text-white">
          <p className="text-2xl font-semibold!">{t("It matches the order.")}</p>
          <p className="mt-1 text-white/85">{t("Ready to ship. The scans and photos are saved as proof.")}</p>
        </div>
      )}
      {result?.result === "override" && (
        <div className="rounded-2xl bg-sun/20 px-6 py-5">
          <p className="text-2xl font-semibold! text-ink">{t("Shipping as packed.")}</p>
          <p className="mt-1 text-ink/70">{t("The difference and the reason are on record.")}</p>
        </div>
      )}
      {result?.result === "mismatch" && (
        <div className="space-y-5 rounded-2xl bg-red-50 px-6 py-5 ring-1 ring-red-200">
          <div>
            <p className="text-2xl font-semibold! text-red-700">{t("Don’t ship this yet.")}</p>
            <ul className="mt-2 space-y-1 text-red-700">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            <p className="mt-2 text-base text-ink/70">{t("Fix the box and check again, or the owner can ship it anyway with a reason.")}</p>
          </div>
          <div className="space-y-3 border-t-2 border-red-200 pt-4">
            <p className="text-base font-semibold! text-ink">{t("Owner: ship it anyway")}</p>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder={t("Owner name")} className="w-full rounded-lg bg-white px-3 py-2 ring-1 ring-line" />
            <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder={t("Reason (for example: the shop agreed by phone to take 4 cases)")} rows={2} className="w-full rounded-lg bg-white px-3 py-2 ring-1 ring-line" />
            <button disabled={busy || !ownerName.trim() || overrideReason.trim().length < 5} onClick={onOverride} className="btn bg-ink px-4 py-2 text-base text-white disabled:opacity-40">
              {t("Ship it anyway")}
            </button>
          </div>
        </div>
      )}

      <section>
        <h2 className={sectionTitle}>{t("1. Scan every case")}</h2>
        <div className="mt-4"><BarcodeScanner onScan={onScan} /></div>
        {lastScan && <p className="mt-2 text-base text-ink/60">{t("Last scan:")} <span className="text-ink">{lastScan}</span></p>}
      </section>

      <section>
        <h2 className={sectionTitle}>{t("2. Count and photograph each item")}</h2>
        <p className="mt-2 text-base text-ink/60">{t("Put all the cases of one item together and take one photo that shows them all.")}</p>
        <ul className="mt-4 divide-y divide-line border-y-2 border-line">
          {data.expected.map((e) => (
            <ItemRow key={e.sku} name={e.name} unit={e.unit} ordered={e.qty} packed={scannedFor(e.sku)} noBarcode={!e.barcode}
              photo={itemPhotos[e.sku]} uploading={!!uploading[e.sku]}
              onMinus={() => adjust(e.sku, -1)} onPlus={() => adjust(e.sku, 1)}
              onPhoto={(f) => onItemPhoto(e.sku, f)} onRemovePhoto={() => setItemPhotos((p) => { const n = { ...p }; delete n[e.sku]; return n; })} />
          ))}
          {extras.map(([key, n]) => (
            <li key={key} className="flex items-center justify-between gap-4 bg-red-50 px-2 py-4">
              <div>
                <p>{barcodeToSku.get(key)?.name ?? t("Unknown barcode {code}", { code: key })}</p>
                <p className="text-base text-red-700">{t("Not part of this order")}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-semibold text-red-700 tabular-nums">{n}</span>
                <button onClick={() => setCounts((c) => ({ ...c, [key]: c[key] - 1 }))} className="grid h-10 w-10 place-items-center rounded-full text-xl text-teal ring-1 ring-line hover:bg-mist" aria-label="−">−</button>
              </div>
            </li>
          ))}
          {data.expected.length === 0 && <li className="py-4 text-ink/60">{t("This order has no items.")}</li>}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className={sectionTitle}>{t("3. Check and finish")}</h2>
        <label className="block text-base text-ink/70">{t("Your name")}
          <input value={packer} onChange={(e) => setPacker(e.target.value)} className="mt-1 w-full rounded-lg bg-mist px-3 py-2.5 text-lg text-ink" />
        </label>
        <button disabled={!canSubmit} onClick={onSubmit} className="btn w-full bg-go py-4 text-xl text-white disabled:opacity-40">
          {busy ? t("Checking…") : t("Check the box")}
        </button>
        {!canSubmit && data.packable && !busy && (
          <p className="text-base text-ink/60">
            {needPhoto.length > 0 ? t("Still needs a photo of: {items}", { items: needPhoto.map((e) => e.name).join(", ") }) : packer.trim() === "" ? t("Add your name.") : anyUploading ? t("Saving the photo…") : ""}
          </p>
        )}
        {error && <p className="text-late">{error}</p>}
      </section>

      {data.checks.length > 0 && (
        <section>
          <h2 className={sectionTitle}>{t("Earlier checks")}</h2>
          <ul className="mt-4 divide-y divide-line">
            {data.checks.map((c) => (
              <li key={c._id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6">
                  <span className={c.result === "match" ? "text-teal" : c.result === "override" ? "text-wait" : "text-red-700"}>
                    {t(c.result === "match" ? "Matched" : c.result === "override" ? "Shipped anyway" : "Didn’t match")}
                  </span>
                  <span className="text-base text-ink/50">{c.packerName} · {when(c.checkedAt)}</span>
                </div>
                {c.problems.length > 0 && <p className="mt-1 text-base text-ink/70">{c.problems.join("; ")}</p>}
                {c.overrideReason && <p className="mt-1 text-base text-wait">{t("Shipped anyway by {name}: {reason}", { name: c.overrideBy ?? "", reason: c.overrideReason })}</p>}
                {(c.linePhotoUrls.length > 0 || c.photoUrls.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(c.linePhotoUrls.length > 0 ? c.linePhotoUrls : c.photoUrls.map((url) => ({ sku: "", url }))).map((p) => (
                      <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={t("Packing photo")} className="h-20 w-20 rounded-lg object-cover ring-1 ring-line" />
                        {p.sku && <span className="mt-1 block max-w-20 truncate text-xs text-ink/50">{data.expected.find((e) => e.sku === p.sku)?.name ?? p.sku}</span>}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One item: ordered vs packed with − / +, and its photo slot ("Photo of the 5 cases"). */
function ItemRow(props: {
  name: string; unit: string; ordered: number; packed: number; noBarcode: boolean; photo?: Photo; uploading: boolean;
  onMinus: () => void; onPlus: () => void; onPhoto: (f: File | undefined) => void; onRemovePhoto: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { name, unit, ordered, packed, photo } = props;
  const off = packed !== ordered;
  return (
    <li className={`flex flex-wrap items-center gap-x-6 gap-y-4 px-2 py-5 ${off && packed > 0 ? "bg-red-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p>{name}</p>
        <p className="text-base text-ink/50">
          {t("Ordered {n}", { n: ordered })} · <span className={off ? "font-semibold text-red-700" : "text-teal"}>{t("Packed {n}", { n: packed })}</span>
          {props.noBarcode && <span> · {t("no barcode saved")}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={props.onMinus} className="grid h-10 w-10 place-items-center rounded-full text-xl text-teal ring-1 ring-line hover:bg-mist" aria-label={`− ${name}`}>−</button>
        <button onClick={props.onPlus} className="grid h-10 w-10 place-items-center rounded-full text-xl text-teal ring-1 ring-line hover:bg-mist" aria-label={`+ ${name}`}>+</button>
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { props.onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      {photo ? (
        <div className="relative">
          <button onClick={() => input.current?.click()} title={t("Retake")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.preview} alt={t("Photo of {name}", { name })} className="h-16 w-16 rounded-lg object-cover ring-2 ring-teal" />
          </button>
          <button onClick={props.onRemovePhoto} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-xs text-white" aria-label={t("Remove photo")}>✕</button>
        </div>
      ) : (
        <button onClick={() => input.current?.click()} disabled={props.uploading}
          className="inline-flex h-16 items-center gap-2 rounded-lg border-2 border-dashed border-teal/40 px-3 text-base text-teal hover:bg-mist disabled:opacity-50">
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          {props.uploading ? t("Saving…") : t("Photo of the {n} {unit}", { n: ordered, unit: ordered === 1 ? unit : `${unit}s` })}
        </button>
      )}
    </li>
  );
}
