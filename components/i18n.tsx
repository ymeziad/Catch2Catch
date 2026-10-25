"use client";

import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ES } from "@/components/es";

/**
 * English / Spanish for the whole dashboard.
 * - Fixed wording goes through t("English text", { values }); the Spanish lives in components/es.ts.
 * - Text the app can't know ahead of time (AI summaries, shop texts) goes through useTr(): Claude translates it once
 *   and Convex caches it (convex/translate.ts).
 * The language is saved in Convex settings, so it sticks across devices and the voice uses it too.
 */

export type Lang = "en" | "es";

// The current language for plain helper functions (usd/when/recSentence...). The provider sets it while rendering
// and remounts the page when it changes, so every helper call below it sees the new language.
let current: Lang = "en";
export function getLang(): Lang { return current; }
export function locale(): string { return current === "es" ? "es-US" : "en-US"; }

export function t(en: string, vars?: Record<string, string | number>): string {
  let s = current === "es" ? ES[en] ?? en : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
export function useLang() { return useContext(LangCtx); }

export function LangProvider({ children }: { children: ReactNode }) {
  const prefs = useQuery(api.owner.prefs, {});
  const save = useMutation(api.owner.setLang);
  const [picked, setPicked] = useState<Lang | null>(null); // switch right away, before the save comes back
  const lang: Lang = picked ?? prefs?.lang ?? "en";
  // eslint-disable-next-line react-hooks/globals -- read by plain helpers during this same render (see above)
  current = lang;
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({
    lang,
    setLang: (l: Lang) => { setPicked(l); save({ lang: l }).catch(() => {}); },
  }), [lang, save]);
  return (
    <LangCtx.Provider value={value}>
      <Fragment key={lang}>{children}</Fragment>
    </LangCtx.Provider>
  );
}

/** Spanish for text the app doesn't know ahead of time. Shows the original until the translation arrives. */
export function useTr(texts: (string | undefined | null)[]): (s: string | undefined | null) => string {
  const { lang } = useLang();
  const joined = texts.filter((x): x is string => !!x && x.trim().length > 0).join("\u0001");
  const list = useMemo(() => (joined ? [...new Set(joined.split("\u0001"))] : []), [joined]);
  const rows = useQuery(api.translate.cached, lang === "es" && list.length ? { lang, texts: list } : "skip");
  const cached = useMemo(() => (rows ? new Map(rows.map((r) => [r.source, r.text])) : undefined), [rows]);
  const translate = useAction(api.translate.translateMany);
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (lang !== "es" || !cached) return;
    const missing = list.filter((s) => !cached.has(s) && !asked.current.has(s));
    if (missing.length === 0) return;
    missing.forEach((s) => asked.current.add(s));
    for (let i = 0; i < missing.length; i += 40) translate({ lang, texts: missing.slice(i, i + 40) }).catch(() => {});
  }, [lang, cached, list, translate]);
  return (s) => (!s ? "" : lang === "es" ? cached?.get(s) ?? s : s);
}

/** "Español" / "English" switch for the top bar. */
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <button onClick={() => setLang(lang === "es" ? "en" : "es")} className={className} lang={lang === "es" ? "en" : "es"}>
      {lang === "es" ? "English" : "Español"}
    </button>
  );
}
