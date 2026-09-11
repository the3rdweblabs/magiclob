// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import type { Fill } from "@/hooks/useData";
import { fmtClock, shortPubkey } from "@/lib/format";

export function TradeTape({
  fills,
  quoteSymbol,
  baseSymbol,
  network,
  onMinimize,
}: {
  fills: Fill[];
  quoteSymbol: string;
  baseSymbol: string;
  network: string;
  onMinimize?: () => void;
}) {
  const explorer = (sig: string): string | null => {
    if (network === "devnet") return `https://solscan.io/tx/${sig}?cluster=devnet`;
    if (network === "mainnet") return `https://solscan.io/tx/${sig}`;
    return null;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#1b2335] px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Trades
        </h2>
        <span className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          {baseSymbol}/{quoteSymbol}
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              title="Minimize trades"
              className="flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
            >
              Minimize
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-4 border-b border-[#141c2e] px-3 py-1 text-right font-mono text-[11px] uppercase tracking-wider text-slate-400">
        <span className="text-left">Time</span>
        <span>Price</span>
        <span>Qty</span>
        <span>Maker</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {fills.length === 0 && (
          <div className="flex h-full items-center justify-center font-mono text-[11px] text-slate-400">
            Waiting for fills…
          </div>
        )}
        {fills.map((f, i) => {
          const href = explorer(f.sig);
          return (
            <div
              key={`${f.sig}-${i}`}
              className="grid grid-cols-4 items-center px-3 py-[3px] text-right font-mono text-[11px] leading-4"
            >
              <span className="text-left text-slate-400">{fmtClock(f.ts)}</span>
              <span className={`lcd ${f.side === "buy" ? "text-emerald-300" : "text-rose-300"}`}>
                {f.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </span>
              <span className="lcd text-slate-300">
                {f.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </span>
              <span className="flex items-center justify-end gap-1.5">
                <span className="text-slate-400">{shortPubkey(f.maker)}</span>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Verify this fill on Solscan`}
                    title="Verify on Solscan"
                    className="text-slate-500 transition-colors hover:text-violet-300"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}