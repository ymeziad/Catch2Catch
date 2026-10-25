"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export default function UploadPage() {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.admin.generateUploadUrl);
  const runPipeline = useAction(api.admin.runPipelineOnUpload);
  const sendTest = useAction(api.admin.sendTestSms);
  const [file, setFile] = useState<File | null>(null);
  const [buyerPhone, setBuyerPhone] = useState("+15550100001");
  const [sellerPhone, setSellerPhone] = useState("+15550100002");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsTo, setSmsTo] = useState("");
  const [smsBody, setSmsBody] = useState("Catch2Catch test: reply CONFIRM or DISPUTE.");
  const [smsResult, setSmsResult] = useState<string | null>(null);

  async function onRun() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "audio/wav" }, body: file });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const { callId } = await runPipeline({ fileId: storageId, buyerPhone, sellerPhone });
      router.push(`/calls/${callId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSendTest() {
    setSmsResult(null);
    try {
      const r = await sendTest({ to: smsTo, body: smsBody });
      setSmsResult(`status: ${r.status}`);
    } catch (e) {
      setSmsResult(e instanceof Error ? e.message : String(e));
    }
  }

  const input = "mt-1 w-full rounded-md border px-3 py-2 text-sm bg-white";
  return (
    <div className="space-y-10 max-w-xl">
      <section>
        <h1 className="text-2xl font-semibold">Run pipeline on an uploaded recording</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Demo safety net. Upload a WAV (stereo: left = buyer, right = seller; mono is diarized) and the
          transcription → analysis pipeline runs exactly as it would after a live call.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">Recording (.wav)
            <input className={input} type="file" accept="audio/wav,audio/x-wav,.wav" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="block text-sm">Buyer phone
            <input className={input} value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
          </label>
          <label className="block text-sm">Seller phone
            <input className={input} value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} />
          </label>
          <button disabled={!file || busy} onClick={onRun} className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Running…" : "Upload and transcribe"}
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Send a test SMS</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">To
            <input className={input} placeholder="+1..." value={smsTo} onChange={(e) => setSmsTo(e.target.value)} />
          </label>
          <label className="block text-sm">Body
            <textarea className={input} rows={3} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} />
          </label>
          <button disabled={!smsTo} onClick={onSendTest} className="rounded-md border bg-white px-4 py-2 text-sm disabled:opacity-50">Send</button>
          {smsResult && <p className="text-sm text-zinc-700">{smsResult}</p>}
        </div>
      </section>
    </div>
  );
}
