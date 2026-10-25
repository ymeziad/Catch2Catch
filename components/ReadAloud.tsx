"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { t } from "@/components/i18n";
import { cleanError } from "@/components/money";

/** "Read it to me": a natural voice (ElevenLabs, via convex/voice.ts) reads the page's words out loud. */
export function ReadAloud({ text, className = "" }: { text: () => string; className?: string }) {
  const speak = useAction(api.voice.speak);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [err, setErr] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audio.current?.pause(); }, []);

  async function go() {
    if (state === "playing") { audio.current?.pause(); setState("idle"); return; }
    if (state === "loading") return;
    setErr(""); setState("loading");
    try {
      const url = await speak({ text: text() });
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => setState("idle");
      a.onerror = () => { setState("idle"); setErr(t("The recording couldn't be played.")); };
      await a.play();
      setState("playing");
    } catch (e) {
      setState("idle");
      setErr(cleanError(e));
    }
  }

  return (
    <span className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button onClick={go} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-base text-teal ring-1 ring-line transition-colors hover:bg-mist" aria-live="polite">
        {state === "loading" ? (
          <span aria-hidden className="flex gap-1">
            {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />)}
          </span>
        ) : state === "playing" ? (
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        ) : (
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" />
          </svg>
        )}
        {state === "playing" ? t("Stop") : t("Read it to me")}
      </button>
      {err && <span className="max-w-xs text-right text-sm text-late">{err}</span>}
    </span>
  );
}
