"use client";

import { useEffect, useRef, useState } from "react";

// The Barcode Detection API isn't in TypeScript's DOM lib yet.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
const SAME_CODE_COOLDOWN_MS = 1500;

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
  return (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
}

/**
 * Camera barcode scanning via the browser's BarcodeDetector (Chrome/Edge on Android, Chrome on macOS).
 * Browsers without it (iOS Safari, Firefox) and USB/Bluetooth scanners use the text box, which submits on Enter.
 * The camera needs HTTPS (or localhost).
 */
export function BarcodeScanner({ onScan, compact = false }: { onScan: (code: string) => void; compact?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lastSeen = new Map<string, number>();

    (async () => {
      try {
        const Ctor = detectorCtor();
        if (!Ctor) throw new Error("This browser can't scan with the camera. Type the barcode or use a USB scanner, or open this page in Chrome on Android.");
        let detector: BarcodeDetectorLike;
        try {
          detector = new Ctor({ formats: FORMATS });
        } catch {
          detector = new Ctor();
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            try {
              const now = Date.now();
              for (const { rawValue } of await detector.detect(video)) {
                // Holding the same can in view counts once; take it away and show it again to count another.
                if (now - (lastSeen.get(rawValue) ?? 0) > SAME_CODE_COOLDOWN_MS) {
                  onScanRef.current(rawValue);
                  navigator.vibrate?.(60);
                }
                lastSeen.set(rawValue, now);
              }
            } catch {
              // A dropped frame; keep scanning.
            }
          }
          timer = setTimeout(tick, 200);
        };
        void tick();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setActive(false);
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (code) onScan(code);
    setManual("");
  }

  return (
    <div className="space-y-2">
      {active && (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} muted playsInline className={`w-full object-cover ${compact ? "h-40" : "h-64"}`} />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setActive((a) => !a);
          }}
          className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-zinc-200" : "bg-zinc-900 text-white"}`}
        >
          {active ? "Stop camera" : "Scan with camera"}
        </button>
        <form onSubmit={submitManual} className="flex flex-1 gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="numeric"
            placeholder="Type barcode or use scanner"
            className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md border bg-white px-3 py-2 text-sm">Add</button>
        </form>
      </div>
      {error && <p className="text-sm text-amber-700">{error}</p>}
    </div>
  );
}
