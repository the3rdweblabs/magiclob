// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

/** Data hooks: market meta, live book, open orders, delegation, tape/candles. */
import {
  depth,
  topOfBook as topOfBookHelper,
  type MarketState,
  type MagiCLOBSDK,
  type OrderBookState,
  type TopOfBook,
} from "@magiclob/sdk";
import type { OrderNode } from "@magiclob/sdk";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import type { Decimals } from "@/lib/format";

// Market meta (fetch-once + 15s refresh)

export interface MarketMeta {
  market: PublicKey;
  state: MarketState;
  decimals: Decimals;
  tickSize: bigint;
}

const mintCache = new Map<string, number>();

/** Decimals live at byte 44 of a SPL Mint account. */
async function mintDecimals(
  sdk: MagiCLOBSDK,
  mint: PublicKey
): Promise<number> {
  const key = mint.toBase58();
  const cached = mintCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const info = await sdk.client.connection.getAccountInfo(mint);
    if (info && info.data.length > 45) {
      const decimals = info.data[44];
      mintCache.set(key, decimals);
      return decimals;
    }
  } catch {
    /* fall through */
  }
  return 9;
}

export function useMarket(
  sdk: MagiCLOBSDK,
  key: string | null,
  market: PublicKey | null
): { meta: MarketMeta | null; missing: boolean } {
  const [meta, setMeta] = useState<MarketMeta | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!market) {
      setMeta(null);
      setMissing(true);
      return;
    }
    let alive = true;
    setMissing(false);
    const load = async () => {
      try {
        const state = await sdk.getMarket(market, "base");
        if (!alive) return;
        if (!state) {
          setMeta(null);
          setMissing(true);
          return;
        }
        const [base, quote] = await Promise.all([
          mintDecimals(sdk, state.baseMint),
          mintDecimals(sdk, state.quoteMint),
        ]);
        if (!alive) return;
        setMeta({
          market,
          state,
          decimals: { base, quote },
          tickSize: state.tickSize,
        });
        setMissing(false);
      } catch {
        if (alive) setMeta(null);
      }
    };
    void load();
    const id = window.setInterval(load, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [sdk, key, market?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps

  return { meta, missing };
}

// Live book through the SDK's account-change subscription + polling fallback

export function useBook(
  sdk: MagiCLOBSDK,
  market: PublicKey | null,
  layer: "base" | "ephemeral"
): { book: OrderBookState | null } {
  const [book, setBook] = useState<OrderBookState | null>(null);
  const prevFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (!market) {
      setBook(null);
      return;
    }
    let alive = true;

    const apply = (next: OrderBookState) => {
      const fp = JSON.stringify(next);
      if (fp === prevFingerprint.current) return;
      prevFingerprint.current = fp;
      if (alive) setBook(next);
    };

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = sdk.watchOrderBook(market, apply, layer);
    } catch (e) {
      // Subscription unavailable (e.g. ER not live yet) - rely on polling.
    }
    void sdk
      .getOrderBook(market, layer)
      .then((b: OrderBookState | null) => {
        if (b) apply(b);
      })
      .catch(() => {});
    const poll = window.setInterval(() => {
      void sdk
        .getOrderBook(market, layer)
        .then((b: OrderBookState | null) => {
          if (b) apply(b);
        })
        .catch(() => {});
    }, 5_000);

    return () => {
      alive = false;
      window.clearInterval(poll);
      unsubscribe?.();
      prevFingerprint.current = null;
    };
  }, [sdk, market?.toBase58(), layer]); // eslint-disable-line react-hooks/exhaustive-deps

  return { book };
}

/** Derived best-first depth + top of book for rendering. */
export interface DepthView {
  bids: { price: bigint; qty: bigint; count: number; cumulative: bigint }[];
  asks: { price: bigint; qty: bigint; count: number; cumulative: bigint }[];
}

export function useDepthView(
  book: OrderBookState | null,
  levels = 9
): { depth: DepthView; top: TopOfBook } {
  if (!book) {
    return {
      depth: { bids: [], asks: [] },
      top: { bestBid: null, bestAsk: null, bidQty: 0n, askQty: 0n, spread: null },
    };
  }
  const d = depth(book);
  const build = (levelsArr: { price: bigint; totalQty: bigint; orderCount: number }[]) => {
    let cumulative = 0n;
    return levelsArr.slice(0, levels).map((l) => {
      cumulative += l.totalQty;
      return { price: l.price, qty: l.totalQty, count: l.orderCount, cumulative };
    });
  };
  return { depth: { bids: build(d.bids), asks: build(d.asks) }, top: topOfBookHelper(book) };
}

// Open orders (owner) - polled, invalidated after own writes

export function useOpenOrders(
  sdk: MagiCLOBSDK,
  market: PublicKey | null,
  owner: PublicKey | null,
  layer: "base" | "ephemeral",
  nonce?: number
): OrderNode[] {
  const [orders, setOrders] = useState<OrderNode[]>([]);
  useEffect(() => {
    if (!market || !owner) {
      setOrders([]);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const list = await sdk.getOpenOrders(market, owner);
        if (alive) setOrders(list);
      } catch {
        /* transient */
      }
    };
void load();
    const id = window.setInterval(load, 6_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [sdk, market?.toBase58(), owner?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps
  return orders;
}

// Delegation state (base layer) - polled

export function useDelegated(
  sdk: MagiCLOBSDK,
  market: PublicKey | null,
  owner: PublicKey | null
): boolean {
  const [delegated, setDelegated] = useState(false);
  useEffect(() => {
    if (!market || !owner) {
      setDelegated(false);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const value = await sdk.isDelegated(market, owner);
        if (alive) setDelegated(value);
      } catch {
        /* transient */
      }
    };
    void load();
    const id = window.setInterval(load, 5_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [sdk, market?.toBase58(), owner?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps
  return delegated;
}

// Indexer series (tape + candles) via the API

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}
export interface Fill {
  ts: number;
  sig: string;
  price: number;
  qty: number;
  side: "buy" | "sell";
  maker: string;
  taker: string;
}

export function useSeries(
  symbol: string | null,
  refreshKey?: number
): {
  candles: Candle[];
  fills: Fill[];
  updatedAt: number | null;
  error: string | null;
} {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [fills, setFills] = useState<Fill[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) {
      setCandles([]);
      setFills([]);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const [candleRes, tapeRes] = await Promise.all([
          fetch(`/api/candles?pair=${encodeURIComponent(symbol)}`).then((r) =>
            r.json()
          ),
          fetch(
            `/api/tape?pair=${encodeURIComponent(symbol)}&limit=200`
          ).then((r) => r.json()),
        ]);
        if (!alive) return;
        setCandles(candleRes.candles ?? []);
        setFills(tapeRes.fills ?? []);
        setError(candleRes.error ?? tapeRes.error ?? null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void load();
    const id = window.setInterval(load, 5_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [symbol, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { candles, fills, updatedAt, error };
}

export type { TopOfBook, OrderNode };