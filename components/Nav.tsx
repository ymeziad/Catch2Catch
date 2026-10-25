"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** OWNER: Amaan. Top menu: page links with a mustard underline that slides to the active page. */
const links: [string, string][] = [
  ["/today", "Today"],
  ["/invoices", "Bills"],
  ["/disputes", "Problems"],
  ["/reminders", "Reminders"],
  ["/calls", "Calls"],
  ["/messages", "Texts"],
];
const more: [string, string][] = [
  ["/ledger", "Books"],
  ["/audit", "History"],
  ["/admin/upload", "Upload a call"],
];

export function Nav() {
  const path = usePathname();
  const isOn = (href: string) => path === href || path.startsWith(href + "/");
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  // Move the underline to the active link (no state, so nothing re-renders).
  useLayoutEffect(() => {
    const nav = navRef.current, bar = barRef.current;
    if (!nav || !bar) return;
    const place = () => {
      const active = nav.querySelector<HTMLAnchorElement>('a[data-active="true"]');
      if (!active) { bar.style.opacity = "0"; return; }
      bar.style.opacity = "1";
      bar.style.left = `${active.offsetLeft}px`;
      bar.style.width = `${active.offsetWidth}px`;
      bar.style.top = `${active.offsetTop + active.offsetHeight - 2}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [path]);

  return (
    <header className="border-b-2 border-line bg-white">
      <nav ref={navRef} className="relative mx-auto flex max-w-4xl flex-wrap items-end gap-x-7 px-6 pt-5">
        <Link href="/today" className="mb-4 mr-4 flex items-center gap-3 text-2xl text-teal">
          <span className="grid h-10 w-14 place-items-center rounded-lg bg-teal text-base text-white">C2C</span>
          Catch2Catch
        </Link>
        {links.map(([href, label]) => (
          <Link key={href} href={href} data-active={isOn(href)}
            className={`pb-4 text-lg ${isOn(href) ? "text-ink" : "text-ink/60 hover:text-ink"}`}>
            {label}
          </Link>
        ))}
        <span ref={barRef} aria-hidden className="pointer-events-none absolute h-0.5 rounded-full bg-sun transition-all duration-300 ease-out motion-reduce:transition-none" style={{ opacity: 0 }} />
        <details className="relative mb-4 ml-auto">
          <summary className={`cursor-pointer list-none text-lg ${more.some(([h]) => isOn(h)) ? "text-ink" : "text-ink/60 hover:text-ink"}`}>More ▾</summary>
          <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl bg-white py-2 shadow-lg ring-1 ring-ink/15">
            {more.map(([href, label]) => (
              <Link key={href} href={href} className="block px-4 py-2 text-base hover:bg-mist">{label}</Link>
            ))}
          </div>
        </details>
      </nav>
    </header>
  );
}
