// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { walletPnl } from "@/lib/pnl";
import type { Fill, MarketMeta, TopOfBook } from "@/hooks/useData";

function usd(value: number): string {
  return (value < 0 ? "-" : "") +
    Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function PnlPanel({
  owner,
  meta,
  top,
  fills,
  baseSymbol,
}: {
  owner: string;
  meta: MarketMeta;
  top: TopOfBook;
  fills: Fill[];
  baseSymbol: string;
}) {
  const mid =
    top.bestBid && top.bestAsk
      ? Number((top.bestBid + top.bestAsk) / 2n) / 10 ** meta.decimals.quote
      : null;
  const pnl = walletPnl(fills, owner, mid);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          P&L · {baseSymbol}
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          {pnl ? `${pnl.trades} fill(s)` : "live"}
        </span>
      </div>

      {!pnl ? (
        <p className="mt-1.5 font-mono text-xs leading-5 text-slate-400">
          No fills for your wallet yet - trade and your realised/mark-to-market
          P&L appears here.
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-[#1b2335]">
          <Cell label="Realised">
            <Value value={pnl.realized} />
          </Cell>
          <Cell label="Unrealised">
            <Value value={pnl.unrealized} />
          </Cell>
          <Cell label="Total">
            <Value value={pnl.total} />
          </Cell>
          <Cell label="Position">
            <span
              className={`font-mono text-[13px] font-semibold ${
                pnl.position > 0
                  ? "text-emerald-300"
                  : pnl.position < 0
                    ? "text-rose-300"
                    : "text-slate-300"
              }`}
            >
              {pnl.position === 0
                ? "flat"
                : `${pnl.position > 0 ? "long" : "short"} ${Math.abs(pnl.position).toLocaleString(
                    undefined,
                    { maximumFractionDigits: 4 }
                  )}`}
            </span>
          </Cell>
        </dl>
      )}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0b1220] px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Value({ value }: { value: number }) {
  const cls =
    value > 0
      ? "text-emerald-300"
      : value < 0
        ? "text-rose-300"
        : "text-slate-300";
  return (
    <span className={`lcd font-mono text-[13px] font-semibold ${cls}`}>
      {usd(value)}
    </span>
  );
}