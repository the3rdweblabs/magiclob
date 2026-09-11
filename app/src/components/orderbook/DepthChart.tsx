// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useMemo } from "react";
import type { DepthView } from "@/hooks/useData";
import { formatPrice } from "@/lib/format";

/** SVG cumulative depth chart, bids rising from the left, asks from the right. */
export function DepthChart({
  depth,
  decimals,
  tickSize,
  quoteSymbol,
}: {
  depth: DepthView;
  decimals: { base: number; quote: number };
  tickSize: bigint;
  quoteSymbol: string;
}) {
  const W = 100;
  const H = 34;

  const view = useMemo(() => {
    if (depth.bids.length === 0 && depth.asks.length === 0) return null;
    const bids = [...depth.bids].sort(
      (a, b) => Number(a.price) - Number(b.price)
    );
    const asks = [...depth.asks].sort(
      (a, b) => Number(a.price) - Number(b.price)
    );
    const prices = [
      ...bids.map((b) => Number(b.price)),
      ...asks.map((a) => Number(a.price)),
    ];
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const span = Math.max(maxP - minP, 1e-9);
    const yMax = Math.max(
      ...bids.map((b) => Number(b.cumulative)),
      ...asks.map((a) => Number(a.cumulative)),
      1e-9
    );
    const x = (p: number) => ((p - minP) / span) * W;
    const y = (q: number) => H - (Number(q) / yMax) * H;

    const bidPts = bids.map((b) => `${x(Number(b.price)).toFixed(3)},${y(Number(b.cumulative)).toFixed(3)}`);
    const askPts = asks.map((a) => `${x(Number(a.price)).toFixed(3)},${y(Number(a.cumulative)).toFixed(3)}`);

    const bidPath =
      bids.length === 0
        ? ""
        : `M${x(Number(bids[0].price)).toFixed(3)},${H} L ${bidPts.join(" L ")} L${x(Number(bids[bids.length - 1].price)).toFixed(3)},${H} Z`;
    const askPath =
      asks.length === 0
        ? ""
        : `M${x(Number(asks[0].price)).toFixed(3)},${H} L ${askPts.join(" L ")} L${x(Number(asks[asks.length - 1].price)).toFixed(3)},${H} Z`;

    const xLabel = (p: number) => ((p - minP) / span) * W;
    return {
      bidPath,
      askPath,
      xLabel,
      yMax,
      midX: bids.length && asks.length ? x(Number(asks[0].price)) : null,
      pounds: formatPrice(BigInt(Math.round(minP)), tickSize, decimals.quote),
      pright: formatPrice(BigInt(Math.round(maxP)), tickSize, decimals.quote),
    };
  }, [depth, tickSize, decimals]);

  if (!view) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] text-slate-400">
        No depth yet
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        {view.bidPath && (
          <path d={view.bidPath} fill="rgba(52,211,153,0.18)" stroke="rgba(52,211,153,0.55)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
        )}
        {view.askPath && (
          <path d={view.askPath} fill="rgba(251,113,133,0.16)" stroke="rgba(251,113,133,0.55)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
        )}
        {view.midX !== null && (
          <line x1={view.midX} y1="0" x2={view.midX} y2={String(H)} stroke="rgba(148,163,184,0.25)" strokeWidth="0.15" strokeDasharray="1 0.8" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="flex justify-between font-mono text-[11px] text-slate-400">
        <span>{view.pounds}</span>
        <span>{quoteSymbol}</span>
        <span>{view.pright}</span>
      </div>
    </div>
  );
}