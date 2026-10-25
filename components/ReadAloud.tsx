"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { locale, t } from "@/components/i18n";
import { cleanError } from "@/components/money";

/**
 * Read with the browser's own voice: the fallback when the ElevenLabs voice isn't set up or doesn't answer,
 * so the button always works. Picks the best installed voice for the page's language.
 */
function speakInBrowser(text: string, onEnd: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const lang = locale(); // "en-US" or "es-US"
  const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, " ").trim());
  u.lang = lang;
  u.rate = 0.98;
  const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const prefer = ["Samantha", "Ava", "Allison", "Google US English", "Paulina", "Mónica", "Google español de Estados Unidos"];
  u.voice = prefer.map((n) => voices.find((v) => v.name.startsWith(n))).find(Boolean) ?? voices.find((v) => v.localService) ?? voices[0] ?? null;
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
  return true;
}

/** "Read it to me": a natural voice (ElevenLabs, via convex/voice.ts) reads the page's words out loud. */
export function ReadAloud({ text, className = "" }: { text: () => string; className?: string }) {
  const speak = useAction(api.voice.speak);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [err, setErr] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audio.current?.pause(); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  async function go() {
    if (state === "playing") { audio.current?.pause(); window.speechSynthesis?.cancel(); setState("idle"); return; }
    if (state === "loading") return;
    setErr(""); setState("loading");
    const words = text();
    try {
      const url = await speak({ text: words });
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => setState("idle");
      a.onerror = () => { setState("idle"); setErr(t("The recording couldn't be played.")); };
      await a.play();
      setState("playing");
    } catch (e) {
      // ElevenLabs not set up or not answering: read it with the browser's voice instead.
      if (speakInBrowser(words, () => setState("idle"))) {
        console.warn("[ReadAloud] using the browser voice:", cleanError(e));
        setState("playing");
        return;
      }
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
