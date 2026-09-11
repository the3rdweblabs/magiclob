// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useApp } from "@/hooks/useApp";

export function NetworkBadge() {
  const { cfg, delegated, layer } = useApp();
  const colors: Record<string, string> = {
    local: "text-slate-300 border-white/10 bg-white/5",
    devnet: "text-amber-300 border-amber-400/30 bg-amber-400/5",
    mainnet: "text-violet-300 border-violet-400/30 bg-violet-400/5",
  };
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${colors[cfg.network] ?? colors.local}`}
      title={
        cfg.routerUrl
          ? `${cfg.network} + Magicblock Ephemeral Rollup (${cfg.routerUrl})`
          : `${cfg.network} base layer (no ER configured)`
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          delegated ? "bg-emerald-400" : "bg-slate-400"
        }`}
      />
      {cfg.network}
      {cfg.routerUrl ? (
        <span className="opacity-60">{delegated ? "· delegated" : "· er"}</span>
      ) : null}
      <span className="hidden text-[11px] opacity-40 lg:inline">{layer}</span>
    </div>
  );
}