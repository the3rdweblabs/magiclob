// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  createTextWatermark,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { MoveDown, RotateCcw } from "lucide-react";
import type { Candle } from "@/hooks/useData";

interface LegendState {
  last: string;
  change: string | null;
  dir: "up" | "down" | "flat";
}

const UP = "#34d399";
const DOWN = "#fb7185";

/**
 * TradingView lightweight-charts candlesticks fed by the indexer: a last-price
 * line, volume histogram, live legend, and TradingView-style controls
 * (reset view, jump to latest, corner resize handle).
 */
export function PriceChart({ candles, symbol }: { candles: Candle[]; symbol?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const [legend, setLegend] = useState<LegendState | null>(null);
  const [minHeight, setMinHeight] = useState(300);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || chartRef.current) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1220" },
        textColor: "#94a3b8",
        fontSize: 11,
        fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#10182b" },
        horzLines: { color: "#10182b" },
      },
      timeScale: {
        borderColor: "#1b2335",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
      },
      rightPriceScale: {
        borderColor: "#1b2335",
        scaleMargins: { top: 0.08, bottom: 0.3 },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "#475569", labelBackgroundColor: "#334155" },
        horzLine: { color: "#475569", labelBackgroundColor: "#334155" },
      },
    });

    createTextWatermark(chart.panes()[0], {
      horzAlign: "left",
      vertAlign: "bottom",
      lines: [
        {
          text: "magiCLOB",
          color: "rgba(148, 163, 184, 0.1)",
          fontSize: 24,
        },
      ],
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      priceLineRef.current = null;
    };
  }, []);

  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;

  useEffect(() => {
    const series = seriesRef.current;
    const volume = volumeRef.current;
    if (!series || !volume) return;

    if (candles.length === 0) {
      series.setData([]);
      volume.setData([]);
      if (priceLineRef.current) {
        series.removePriceLine(priceLineRef.current);
        priceLineRef.current = null;
      }
      setLegend(null);
      return;
    }

    const rows = candles.map((c) => ({
      time: Math.floor(c.t / 1000) as UTCTimestamp,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));
    series.setData(rows);
    volume.setData(
      candles.map((c) => ({
        time: Math.floor(c.t / 1000) as UTCTimestamp,
        value: c.v,
        color: c.c >= c.o ? "rgba(52, 211, 153, 0.28)" : "rgba(251, 113, 133, 0.28)",
      }))
    );

    if (priceLineRef.current) series.removePriceLine(priceLineRef.current);
    priceLineRef.current = series.createPriceLine({
      price: lastCandle!.c,
      color: "#a78bfa",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: `last ${lastCandle!.c}`,
    });

    const prev = candles.length > 1 ? candles[candles.length - 2] : null;
    const change = prev ? ((lastCandle!.c - prev.c) / prev.c) * 100 : null;
    setLegend({
      last: lastCandle!.c.toLocaleString(undefined, { maximumFractionDigits: 6 }),
      change: change === null ? null : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
      dir: change === null ? "flat" : change >= 0 ? "up" : "down",
    });
  }, [candles, lastCandle]);

  const resetView = () => {
    chartRef.current?.timeScale().fitContent();
  };
  const jumpToLatest = () => {
    chartRef.current?.timeScale().scrollToRealTime();
  };

  const lastColor =
    !legend || legend.dir === "flat"
      ? "text-slate-200"
      : legend.dir === "up"
        ? "text-emerald-300"
        : "text-rose-300";

  return (
    <div className="relative h-full w-full" style={{ minHeight }}>
      {/* Legend */}
      <div className="pointer-events-none absolute left-3 top-2 z-10 flex items-center gap-3 rounded-md border border-white/5 bg-[#0b1220]/85 px-2.5 py-1 font-mono text-[11px] backdrop-blur-sm">
        <span className="font-semibold text-slate-100">{symbol ?? "-"}</span>
        <span className={`lcd ${lastColor}`}>{legend?.last ?? "-"}</span>
        {legend?.change && (
          <span className={`lcd ${legend.dir === "up" ? "text-emerald-300" : "text-rose-300"}`}>
            {legend.change}
          </span>
        )}
      </div>

      {/* TradingView-style controls */}
      <div className="absolute right-3 top-2 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={resetView}
          title="Reset view"
          aria-label="Reset chart view to default"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/5 bg-[#0b1220]/85 text-slate-300 transition-colors hover:text-slate-100"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={jumpToLatest}
          title="Jump to the latest candle"
          aria-label="Scroll chart to the latest candle"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/5 bg-[#0b1220]/85 text-slate-300 transition-colors hover:text-slate-100"
        >
          <MoveDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* Empty-state hint (chart frame stays visible) */}
      {candles.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-4 text-center font-mono text-xs leading-5 text-slate-400">
          No candles yet - start the indexer (`npm run indexer`) and
          <br />
          seed history (`npm run seed:history`) to light the chart.
        </div>
      )}

      <div ref={containerRef} className="h-full w-full" />

      {/* Corner resize handle */}
      <div
        role="separator"
        aria-label="Resize chart"
        aria-orientation="vertical"
        onPointerDown={(e) => {
          const startY = e.clientY;
          const startH = minHeight;
          const move = (ev: PointerEvent) => {
            setMinHeight(Math.max(200, Math.min(700, startH + (ev.clientY - startY))));
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
        className="absolute bottom-0 right-0 z-20 flex h-4 w-4 cursor-se-resize items-end justify-end"
        style={{ touchAction: "none" }}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path d="M3 9h6M4.5 6.5L9 11M1.5 4l5.5 5.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}