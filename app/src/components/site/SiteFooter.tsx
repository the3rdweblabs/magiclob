// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { site } from "@/config/site";

/** Site footer for the product pages. */
export default function SiteFooter() {
  return (
    <footer className="relative border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-slate-500 sm:flex-row">
        <span>
          {site.name} - an open CLOB for Solana
        </span>
        <a href={site.links.github} className="transition-colors hover:text-slate-200" target="_blank" rel="noreferrer">
          GPL-3.0 · source on GitHub
        </a>
      </div>
    </footer>
  );
}