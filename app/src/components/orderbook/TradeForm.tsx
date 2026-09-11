// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { ChevronDown } from "lucide-react";
import {
  MagiCLOBError,
  OrderSide,
  SelfMatchingOption,
  TimeInForce,
  type TopOfBook,
} from "@magiclob/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { useToast } from "@/hooks/useToast";
import type { MarketMeta } from "@/hooks/useData";
import { formatPrice, formatQty, isMultiple, parseRaw, scaleAmount } from "@/lib/format";

export interface Prefill {
  side: OrderSide;
  price: bigint;
}

interface Props {
  meta: MarketMeta;
  top: TopOfBook;
  prefill: Prefill | null;
  onPrefillHandled: () => void;
  onMinimize?: () => void;
}

export function TradeForm({ meta, top, prefill, onPrefillHandled, onMinimize }: Props) {
  const app = useApp();
  const { tradeClient, auth, pair, bump } = app;
  const { push } = useToast();

  const [side, setSide] = useState<OrderSide>(OrderSide.Bid);
  const [mode, setMode] = useState<"limit" | "market">("limit");
  const [priceStr, setPriceStr] = useState("");
  const [qtyStr, setQtyStr] = useState("");
  const [tif, setTif] = useState<TimeInForce>(TimeInForce.GoodTillCancelled);
  const [selfMatch, setSelfMatch] = useState<SelfMatchingOption>(SelfMatchingOption.CancelTaker);
  const [busy, setBusy] = useState(false);

  const idRef = useRef(BigInt(Math.floor(Math.random() * 1e9)));

  useEffect(() => {
    if (!prefill) return;
    setSide(prefill.side);
    setPriceStr(formatPrice(prefill.price, meta.tickSize, meta.decimals.quote));
    onPrefillHandled();
  }, [prefill, meta.tickSize, meta.decimals.quote, onPrefillHandled]);

  const {
    baseDec,
    quoteDec,
    tickSize,
    lotSize,
    minSize,
  } = useMemo(
    () => ({
      baseDec: meta.decimals.base,
      quoteDec: meta.decimals.quote,
      tickSize: meta.state.tickSize,
      lotSize: meta.state.lotSize,
      minSize: meta.state.minSize,
    }),
    [meta]
  );

  const priceRaw = useMemo(() => (mode === "limit" ? parseRaw(priceStr, quoteDec) : null), [priceStr, quoteDec, mode]);
  const qtyRaw = useMemo(() => parseRaw(qtyStr, baseDec), [qtyStr, baseDec]);

  const priceErr = useMemo(() => {
    if (mode !== "limit") return null;
    if (!priceRaw || priceRaw <= 0n) return "enter a price";
    if (!isMultiple(priceRaw, tickSize))
      return `multiple of tick ${formatPrice(tickSize, tickSize, quoteDec)}`;
    return null;
  }, [mode, priceRaw, tickSize, quoteDec]);

  const qtyErr = useMemo(() => {
    if (!qtyRaw || qtyRaw <= 0n) return "enter a quantity";
    if (qtyRaw < minSize)
      return `min order ${formatQty(minSize, baseDec)} ${pair.base}`;
    if (!isMultiple(qtyRaw, lotSize))
      return `multiple of lot ${formatQty(lotSize, baseDec)}`;
    return null;
  }, [qtyRaw, minSize, lotSize, baseDec, pair.base]);

  const total = useMemo(() => {
    if (!priceRaw || !qtyRaw || priceErr || qtyErr) return null;
    return scaleAmount(priceRaw * qtyRaw, quoteDec);
  }, [priceRaw, qtyRaw, priceErr, qtyErr, quoteDec]);

  const canSubmit = !busy && auth.publicKey && !qtyErr && (mode === "market" || !priceErr);

  const bestBid = top.bestBid ?? null;
  const bestAsk = top.bestAsk ?? null;

  const submit = async () => {
    if (!canSubmit || !priceRaw || !qtyRaw || !auth.publicKey) return;
    setBusy(true);
    const market = meta.market;
    const owner = auth.publicKey;
    try {
      const clientOrderId = idRef.current;
      idRef.current += 1n;
      const sig =
        mode === "limit"
          ? await tradeClient!.placeLimit({
              market,
              owner,
              price: priceRaw,
              qty: qtyRaw,
              clientOrderId,
              isBid: side === OrderSide.Bid,
              timeInForce: tif,
              selfMatchingOption: selfMatch,
            })
          : await tradeClient!.placeMarket({
              market,
              owner,
              qty: qtyRaw,
              clientOrderId,
              isBid: side === OrderSide.Bid,
              selfMatchingOption: selfMatch,
            });
      push("success", `${side === OrderSide.Bid ? "Buy" : "Sell"} order accepted`, sig);
      setQtyStr("");
      bump();
    } catch (err) {
      const f = friendly(err);
      push("error", f.title, f.detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-[#1b2335] px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Trade
        </h2>
        <span className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          {mode === "limit" ? "limit" : "market"}
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              title="Minimize trade form"
              className="flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
            >
              Minimize
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>

      {/* Side + mode */}
      <div className="grid grid-cols-2 gap-2 px-3 pt-3">
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[#1b2335] text-[11px] font-semibold">
          <button
            onClick={() => setMode("limit")}
            className={`py-1.5 ${mode === "limit" ? "bg-violet-500/20 text-violet-200" : "text-slate-400 hover:text-slate-300"}`}
          >
            Limit
          </button>
          <button
            onClick={() => setMode("market")}
            className={`py-1.5 ${mode === "market" ? "bg-violet-500/20 text-violet-200" : "text-slate-400 hover:text-slate-300"}`}
          >
            Market
          </button>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[#1b2335] text-[11px] font-semibold">
          <button
            onClick={() => setSide(OrderSide.Bid)}
            className={`py-1.5 ${side === OrderSide.Bid ? "bg-emerald-500/20 text-emerald-200" : "text-slate-400 hover:text-slate-300"}`}
          >
            Buy
          </button>
          <button
            onClick={() => setSide(OrderSide.Ask)}
            className={`py-1.5 ${side === OrderSide.Ask ? "bg-rose-500/20 text-rose-200" : "text-slate-400 hover:text-slate-300"}`}
          >
            Sell
          </button>
        </div>
      </div>

      {/* Price */}
      {mode === "limit" && (
        <Field label={`Price (${pair.quote})`} error={priceErr} best={bestBid !== null ? bestBid : bestAsk} onBest={() => setPriceStr(formatPrice(bestBid ?? bestAsk!, tickSize, quoteDec))}>
          <input
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={inputCls(priceErr)}
          />
        </Field>
      )}

      {/* Qty */}
      <Field label={`Qty (${pair.base})`} error={qtyErr}>
        <input
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className={inputCls(qtyErr)}
        />
      </Field>

      {total !== null && (
        <div className="flex justify-between px-3 text-[11px]">
          <span className="text-slate-400">Total</span>
          <span className="lcd font-mono text-slate-200">
            {total.toLocaleString(undefined, { maximumFractionDigits: quoteDec - 0 })} {pair.quote}
          </span>
        </div>
      )}

      {/* TIF + self-match for limit */}
      {mode === "limit" && (
        <div className="grid grid-cols-2 gap-2 px-3 pt-1">
          <Field label="Time in force" error={null}>
            <select value={tif} onChange={(e) => setTif(Number(e.target.value))} className={selCls()}>
              <option value={TimeInForce.GoodTillCancelled}>GTC</option>
              <option value={TimeInForce.ImmediateOrCancel}>IOC</option>
              <option value={TimeInForce.FillOrKill}>FOK</option>
              <option value={TimeInForce.PostOnly}>Post-only</option>
            </select>
          </Field>
          <Field label="Self-match" error={null}>
            <select value={selfMatch} onChange={(e) => setSelfMatch(Number(e.target.value))} className={selCls()}>
              <option value={SelfMatchingOption.CancelTaker}>Cancel taker</option>
              <option value={SelfMatchingOption.CancelMaker}>Cancel maker</option>
              <option value={SelfMatchingOption.Allowed}>Allowed</option>
            </select>
          </Field>
        </div>
      )}

      <div className="mt-2 flex-1" />

      {/* Fees */}
      <div className="flex justify-between px-3 pb-2 text-[11px] text-slate-400">
        <span>
          fee {mode === "limit" ? meta.state.makerFeeBps : meta.state.takerFeeBps}/10000
        </span>
        {meta.state.makerRebateBps > 0 && <span>maker rebate {meta.state.makerRebateBps}/10000</span>}
      </div>

      <div className="p-3 pt-0">
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className={`w-full rounded-md py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            side === OrderSide.Bid
              ? "bg-emerald-500/90 text-emerald-950 hover:bg-emerald-400"
              : "bg-rose-500/90 text-rose-50 hover:bg-rose-400"
          }`}
        >
          {busy
            ? "Sending…"
            : !auth.publicKey
              ? "Connect a wallet"
              : `${side === OrderSide.Bid ? "Buy" : "Sell"} ${pair.base}`}
        </button>
        {(priceErr || qtyErr) && (
          <p className="mt-1 text-center font-mono text-[11px] text-rose-400/80">
            {priceErr ?? qtyErr}
          </p>
        )}
      </div>
    </div>
  );
}

function friendly(err: unknown): { title: string; detail: string } {
  if (err instanceof MagiCLOBError) {
    return {
      title: err.name.replace(/([A-Z])/g, " $1").trim(),
      detail: err.message,
    };
  }
  return {
    title: "Transaction failed",
    detail: String((err as { message?: string })?.message ?? err),
  };
}

function Field({
  label,
  error,
  children,
  best,
  onBest,
}: {
  label: string;
  error: string | null;
  children: React.ReactNode;
  best?: bigint | null;
  onBest?: () => void;
}) {
  return (
    <label className="block px-3 pt-2">
      <span className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
        {label}
        {onBest && best !== null ? (
          <button onClick={onBest} className="font-mono normal-case text-violet-400/70 hover:text-violet-300">
            best {best !== null ? "✓" : ""}
          </button>
        ) : null}
      </span>
      {children}
      {error && <span className="mt-1 block font-mono text-[11px] text-rose-400/80">{error}</span>}
    </label>
  );
}

function inputCls(error: string | null): string {
  return `w-full rounded-md border bg-[#080d18] px-2.5 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-violet-400/50 ${
    error ? "border-rose-500/40" : "border-[#1b2335]"
  }`;
}

function selCls(): string {
  return "w-full rounded-md border border-[#1b2335] bg-[#080d18] px-2 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-violet-400/50";
}