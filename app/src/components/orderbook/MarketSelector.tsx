// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useApp } from "@/hooks/useApp";

export function MarketSelector() {
  const { cfg, pair, setPair } = useApp();
  return (
    <div className="flex items-center gap-3">
      <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Market
      </label>
      <select
        value={pair?.symbol ?? ""}
        onChange={(e) => setPair(e.target.value)}
        className="rounded-md border border-[#1b2335] bg-[#070b14] px-2.5 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-violet-400/50"
      >
        {cfg.pairs.map((p) => (
          <option key={p.symbol} value={p.symbol} disabled={!p.market}>
            {p.symbol}
            {p.market ? "" : " · not set up"}
          </option>
        ))}
      </select>
      {pair?.market && (
        <span className="hidden font-mono text-[11px] text-slate-400 lg:inline">
          {pair.market.slice(0, 6)}…{pair.market.slice(-6)}
        </span>
      )}
    </div>
  );
}