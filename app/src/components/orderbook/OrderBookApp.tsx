// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MarketSelector } from "@/components/orderbook/MarketSelector";
import { NetworkBadge } from "@/components/orderbook/NetworkBadge";
import { OrderBook, OrderBookSide } from "@/components/orderbook/OrderBook";
import { DepthChart } from "@/components/orderbook/DepthChart";
import { PriceChart } from "@/components/orderbook/PriceChart";
import { TradeTape } from "@/components/orderbook/TradeTape";
import { PnlPanel } from "@/components/orderbook/PnlPanel";
import { TradeForm, type Prefill } from "@/components/orderbook/TradeForm";
import { OpenOrders } from "@/components/orderbook/OpenOrders";
import { VaultDelegate } from "@/components/orderbook/VaultDelegate";
import { DemoFund } from "@/components/orderbook/DemoFund";
import { WalletControl } from "@/components/orderbook/WalletControl";
import { useApp } from "@/hooks/useApp";
import {
  useBook,
  useDelegated as useDelegatedValue,
  useDepthView,
  useMarket,
  useSeries,
} from "@/hooks/useData";
import { formatPrice, formatQty } from "@/lib/format";

/** Order-book mark: three cumulative-depth rungs. */
function Logo() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="1" y="1.8" width="14" height="2.6" rx="1" fill="#a78bfa" />
      <rect x="1" y="6.7" width="9" height="2.6" rx="1" fill="#a78bfa" opacity="0.75" />
      <rect x="1" y="11.6" width="14" height="2.6" rx="1" fill="#a78bfa" />
    </svg>
  );
}

export function OrderBookApp() {
  const app = useApp();
  const { sdk, cfg, pair, market, auth, layer, setDelegated } = app;

  const { meta, missing } = useMarket(sdk, pair?.symbol ?? null, market);
  const delegated = useDelegatedValue(sdk, market, auth.publicKey);
  useEffect(() => {
    setDelegated(delegated);
  }, [delegated, setDelegated]);

  const { book } = useBook(sdk, market, layer);
  const { depth, top } = useDepthView(book);
  const { candles, fills } = useSeries(pair?.symbol ?? null);

  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [tapeOpen, setTapeOpen] = useState(false);

  const centerSpan =
    leftOpen && rightOpen
      ? "lg:col-span-6"
      : leftOpen === rightOpen
        ? "lg:col-span-10"
        : "lg:col-span-8";

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col p-3 sm:p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b1220]">
          {/* App header */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#1b2335] px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href="/"
              className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-100 transition-colors hover:text-slate-50"
              aria-label="Close MagicBook and go to magiCLOB"
            >
              <Logo />
              <span className="hidden sm:inline">MagicBook</span>
            </a>
            <span className="hidden h-4 w-px shrink-0 bg-[#1b2335] sm:block" aria-hidden="true" />
            <MarketSelector />
            <NetworkBadge />
          </div>
          <WalletControl />
        </div>

        {/* Top-of-book strip */}
        {meta && (
          <div className="grid grid-cols-2 gap-px bg-[#1b2335] sm:grid-cols-4">
            <Stat label={`Best bid · ${pair.quote}`}>
              {top.bestBid ? (
                <>
                  <span className="lcd text-lg font-semibold text-emerald-300">
                    {formatPrice(top.bestBid, meta.tickSize, meta.decimals.quote)}
                  </span>
                  <Small>
                    {formatQty(top.bidQty ?? 0n, meta.decimals.base)} {pair.base}
                  </Small>
                </>
              ) : (
                "-"
              )}
            </Stat>
            <Stat label={`Best ask · ${pair.quote}`}>
              {top.bestAsk ? (
                <>
                  <span className="lcd text-lg font-semibold text-rose-300">
                    {formatPrice(top.bestAsk, meta.tickSize, meta.decimals.quote)}
                  </span>
                  <Small>
                    {formatQty(top.askQty ?? 0n, meta.decimals.base)} {pair.base}
                  </Small>
                </>
              ) : (
                "-"
              )}
            </Stat>
            <Stat label="Spread">
              <span className="lcd text-sm font-semibold text-slate-100">
                {top.spread ? formatPrice(top.spread, meta.tickSize, meta.decimals.quote) : "-"}
              </span>
            </Stat>
            <Stat label="Layer">
              <span className={`font-mono text-sm font-semibold ${layer === "ephemeral" ? "text-violet-300" : "text-slate-100"}`}>
                {layer === "ephemeral" ? "ephemeral rollup" : "base layer"}
              </span>
            </Stat>
          </div>
        )}

        {missing || !meta ? (
          <SetupPanel network={cfg.network} configured={pair?.symbol} />
        ) : (
          <div
            className={`grid min-h-0 flex-1 grid-cols-1 gap-px overflow-y-auto bg-[#1b2335] lg:grid-cols-12 ${
              ordersOpen
                ? "lg:grid-rows-[minmax(0,1fr)_minmax(0,13rem)]"
                : "lg:grid-rows-[minmax(0,1fr)_auto]"
            }`}
          >
            {/* Left: ladder + depth (collapsible) */}
            <div
              className={`flex min-h-0 flex-col bg-[#0b1220] ${leftOpen ? "lg:col-span-3" : "lg:col-span-1"}`}
            >
              {leftOpen ? (
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="h-[320px] min-h-0 shrink-0 lg:h-auto lg:flex-1">
                    <OrderBook
                      depth={depth}
                      decimals={meta.decimals}
                      tickSize={meta.tickSize}
                      quoteSymbol={pair.quote}
                      baseSymbol={pair.base}
                      onSelectPrice={(price, side) =>
                        setPrefill({ side: side as OrderBookSide, price })
                      }
                      onMinimize={() => setLeftOpen(false)}
                    />
                  </div>
                  <div className="h-24 shrink-0 border-t border-[#1b2335] p-2">
                    <DepthChart
                      depth={depth}
                      decimals={meta.decimals}
                      tickSize={meta.tickSize}
                      quoteSymbol={pair.quote}
                    />
                  </div>
                </div>
              ) : (
                <SideRail label="Order book" onExpand={() => setLeftOpen(true)} />
              )}
            </div>

            {/* Center: price chart + tape */}
            <div className={`flex min-h-0 flex-col bg-[#0b1220] ${centerSpan}`}>
              {tapeOpen ? (
                <>
                  <div className="relative h-[300px] shrink-0 overflow-hidden">
                    <PriceChart candles={candles} symbol={pair.symbol} />
                  </div>
                  <div className="h-[320px] min-h-0 shrink-0 border-t border-[#1b2335] lg:h-auto lg:min-h-[160px] lg:flex-1">
                    <TradeTape
                      fills={fills}
                      quoteSymbol={pair.quote}
                      baseSymbol={pair.base}
                      network={cfg.network}
                      onMinimize={() => setTapeOpen(false)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    <PriceChart candles={candles} symbol={pair.symbol} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setTapeOpen(true)}
                    className="flex h-8 shrink-0 items-center justify-center gap-2 border-t border-[#1b2335] bg-[#0b1220] text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-violet-300"
                    title="Expand trades"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    Trades
                  </button>
                </>
              )}
            </div>

            {/* Right: trade form + delegation + funds (collapsible) */}
            <div
              className={`flex min-h-0 flex-col bg-[#0b1220] ${rightOpen ? "lg:col-span-3 lg:overflow-y-auto" : "lg:col-span-1"}`}
            >
              {rightOpen ? (
                <div className="flex h-full flex-col">
                  <div className="h-[440px] min-h-0 shrink-0 lg:h-auto lg:flex-1">
                    <TradeForm
                      meta={meta}
                      top={top}
                      prefill={prefill}
                      onPrefillHandled={() => setPrefill(null)}
                      onMinimize={() => setRightOpen(false)}
                    />
                  </div>
                  <div className="shrink-0 border-t border-[#1b2335]">
                    <VaultDelegate />
                  </div>
                  {auth.publicKey && meta && (
                    <div className="shrink-0 border-t border-[#1b2335]">
                      <PnlPanel
                        owner={auth.publicKey.toBase58()}
                        meta={meta}
                        top={top}
                        fills={fills}
                        baseSymbol={pair.base}
                      />
                    </div>
                  )}
                  <div className="shrink-0 border-t border-[#1b2335]">
                    <DemoFund meta={meta} />
                  </div>
                </div>
              ) : (
                <SideRail label="Trade" onExpand={() => setRightOpen(true)} />
              )}
            </div>

            {/* Bottom: open orders (collapsible) */}
            {ordersOpen ? (
              <div className="min-h-0 bg-[#0b1220] lg:col-span-12">
                <OpenOrders meta={meta} onMinimize={() => setOrdersOpen(false)} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOrdersOpen(true)}
                className="flex h-9 items-center justify-center gap-2 bg-[#0b1220] text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-violet-300 lg:col-span-12"
                title="Expand open orders"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Open orders
              </button>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function SideRail({ label, onExpand }: { label: string; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Expand ${label}`}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-slate-500 transition-colors hover:bg-white/[0.03] hover:text-violet-300"
    >
      <ChevronRight className="h-4 w-4" />
      <span className="rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider">
        {label}
      </span>
    </button>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0b1220] px-4 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-slate-100">{children}</div>
    </div>
  );
}

function Small({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 font-mono text-[11px] text-slate-400">{children}</span>;
}

function SetupPanel({ network, configured }: { network: string; configured?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#2a3652] bg-[#0b1220] p-8 text-center">
      <h3 className="text-sm font-semibold text-slate-200">
        No market configured for <span className="text-violet-400">{network}</span>
      </h3>
      <p className="mx-auto mt-2 max-w-xl font-mono text-[12px] leading-6 text-slate-400">
        {configured ? (
          <>
            Market <span className="text-slate-300">{configured}</span> is listed but not
            found on-chain - deploy it first.
          </>
        ) : (
          <>
            Add a market to your <span className="text-slate-300">.env</span> via{" "}
            <span className="text-slate-300">MARKETS_{network.toUpperCase()}</span>.
          </>
        )}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded-md border border-[#1b2335] px-3 py-1.5 font-mono text-[11px] text-slate-300 hover:border-violet-400/40"
      >
        refresh
      </button>
    </div>
  );
}

export type { OrderBookSide };