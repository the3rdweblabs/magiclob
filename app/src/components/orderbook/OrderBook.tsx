// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { ChevronDown } from "lucide-react";
import { OrderSide } from "@magiclob/sdk";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/useApp";
import type { DepthView } from "@/hooks/useData";
import { formatPrice, formatQty } from "@/lib/format";

interface Props {
  depth: DepthView;
  decimals: { base: number; quote: number };
  tickSize: bigint;
  onSelectPrice?: (price: bigint, side: OrderSide) => void;
  quoteSymbol: string;
  baseSymbol: string;
  onMinimize?: () => void;
}

export function OrderBook({ depth, decimals, tickSize, onSelectPrice, quoteSymbol, baseSymbol, onMinimize }: Props) {
  const { cfg } = useApp();

  const rows = useMemo(() => {
    const maxQty = Math.max(
      ...depth.bids.map((b) => Number(b.cumulative)),
      ...depth.asks.map((a) => Number(a.cumulative)),
      1
    );
    return { maxQty };
  }, [depth]);

  const spreadRow = useMemo(() => {
    const bestBid = depth.bids[0];
    const bestAsk = depth.asks[0];
    if (!bestBid || !bestAsk) return null;
    const spread = bestAsk.price - bestBid.price;
    return {
      spread,
      pct: Number(spread) / (Number(bestAsk.price) || 1) / 100,
    };
  }, [depth]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#1b2335] px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Order book
        </h2>
        <span className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          {cfg.routerUrl ? "live · ER" : "live"}
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              title="Minimize order book"
              className="flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
            >
              Minimize
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-3 border-b border-[#141c2e] px-3 py-1 text-right font-mono text-[11px] uppercase tracking-wider text-slate-400">
        <span className="text-left">Price ({quoteSymbol})</span>
        <span>Size ({baseSymbol})</span>
        <span>Total</span>
      </div>

      {/* Asks, best first */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {depth.asks.map((a, i) => (
          <Row
            key={`a-${a.price.toString()}`}
            side={OrderSide.Ask}
            price={a.price}
            qty={a.qty}
            cum={a.cumulative}
            width={Math.max((Number(a.cumulative) / rows.maxQty) * 100, 2)}
            decimals={decimals}
            tickSize={tickSize}
            onClick={onSelectPrice ? () => onSelectPrice(a.price, OrderSide.Ask) : undefined}
          />
        ))}
        {depth.asks.length === 0 && <EmptyRow label={`No asks on ${cfg.network}`} />}
      </div>

      {/* Spread */}
      <div className="grid grid-cols-3 border-y border-[#141c2e] bg-[#0d1526] px-3 py-1 text-right font-mono text-[11px] text-slate-400">
        <span className="text-left">
          {depth.bids[0] ? formatPrice(depth.bids[0].price, tickSize, decimals.quote) : "-"}
        </span>
        <span className={spreadRow ? "text-slate-300" : "text-slate-400"}>
          {spreadRow ? `spread ${formatPrice(spreadRow.spread, tickSize, decimals.quote)}` : "-"}
        </span>
        <span>
          {depth.asks[0] ? formatPrice(depth.asks[0].price, tickSize, decimals.quote) : "-"}
        </span>
      </div>

      {/* Bids, best first */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {depth.bids.map((b, i) => (
          <Row
            key={`b-${b.price.toString()}`}
            side={OrderSide.Bid}
            price={b.price}
            qty={b.qty}
            cum={b.cumulative}
            width={Math.max((Number(b.cumulative) / rows.maxQty) * 100, 2)}
            decimals={decimals}
            tickSize={tickSize}
            onClick={onSelectPrice ? () => onSelectPrice(b.price, OrderSide.Bid) : undefined}
          />
        ))}
        {depth.bids.length === 0 && <EmptyRow label={`No bids on ${cfg.network}`} />}
      </div>
    </div>
  );
}

function Row({
  side,
  price,
  qty,
  cum,
  width,
  decimals,
  tickSize,
  onClick,
}: {
  side: OrderSide;
  price: bigint;
  qty: bigint;
  cum: bigint;
  width: number;
  decimals: { base: number; quote: number };
  tickSize: bigint;
  onClick?: () => void;
}) {
  const bid = side === OrderSide.Bid;
  return (
    <button
      onClick={onClick}
      title={onClick ? "Click to pre-fill the order form" : undefined}
      className="group relative block w-full cursor-default overflow-hidden px-3 py-[3px] text-right font-mono text-[11px] leading-4 transition-colors hover:bg-white/[0.03]"
    >
      <span
        className={`absolute inset-y-0 right-0 opacity-[0.12] transition-all group-hover:opacity-[0.2] ${
          bid ? "bg-emerald-400" : "bg-rose-400"
        }`}
        style={{ width: `${Math.min(width, 100)}%` }}
      />
      <span className="relative grid grid-cols-3">
        <span className={`text-left lcd ${bid ? "text-emerald-300" : "text-rose-300"}`}>
          {formatPrice(price, tickSize, decimals.quote)}
        </span>
        <span className="lcd text-slate-300">{formatQty(qty, decimals.base)}</span>
        <span className="lcd text-slate-400">{formatQty(cum, decimals.base)}</span>
      </span>
    </button>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center py-6 font-mono text-[11px] text-slate-400">
      {label}
    </div>
  );
}

export { OrderSide as OrderBookSide };