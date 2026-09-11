// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { site } from "@/config/site";

/** Sticky marketing nav used by the product pages. */
export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = site.nav.filter((item) => !("cta" in item));
  const ctas = site.nav.filter((item) => "cta" in item);

  const linkClass = (href: string) =>
    pathname === href
      ? "rounded-md bg-white/5 text-slate-50"
      : "rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100";

  return (
    <header className="fixed left-1/2 top-3 z-50 w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 rounded-lg border border-white/10 bg-[#070b14]/85 backdrop-blur-md lg:w-auto">
      <div className="flex h-10 items-center justify-between gap-10 px-6 lg:justify-start">
        <a
          href="/"
          className="flex items-center text-base font-bold tracking-tight text-slate-50 transition-colors hover:text-slate-200"
        >
          {site.name}
        </a>
        <nav className="hidden items-center gap-2 text-sm lg:flex" aria-label="Primary">
          {links.map((item) => (
            <a key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={`px-4 py-2 transition-colors ${linkClass(item.href)}`}>
              {item.label}
            </a>
          ))}
          <span className="mx-1.5 h-5 w-px bg-white/10" aria-hidden="true" />
          {ctas.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100 lg:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div id="site-menu" className="border-t border-white/10 px-3 pb-3 pt-2 sm:hidden">
          <div className="flex flex-col gap-1">
            {links.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`px-3 py-2 text-sm transition-colors ${linkClass(item.href)}`}
              >
                {item.label}
              </a>
            ))}
            {ctas.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="mt-1 rounded-md bg-violet-600 px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-violet-500"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}