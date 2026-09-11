// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * In-app indexer: subscribes to the program's trade events on the live
 * network and writes the per-market tape + candle store that the API reads.
 *
 * The Next server bootstraps this at startup (via `instrumentation.ts`) and
 * the API routes lazily ensure it, so the app has no separately-running
 * indexer service. The same entry is also used by the standalone
 * `scripts/indexer` CLI for local validator development.
 */
import { appendFile, writeFile } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import { MagiCLOBClient, MagiCLOBSDK } from "@magiclob/sdk";
import type { Network } from "../config/networks";
import { getNetwork, resolveNetworkConfig } from "../config/networks";
import {
  ensureDir,
  marketDir,
  readCandles,
  type Candle,
} from "./indexer-store";
import { decodeTradeEvent, eventPayloadFromLog } from "../../scripts/lib/events";

/**
 * Candle bucket width - one minute, so a candle aggregates several fills and
 * draws a real OHLC body instead of a single degenerate point.
 */
const CANDLE_MS = 60_000;

interface MarketCtx {
  market: string;
  symbol: string;
  baseDecimals: number;
  quoteDecimals: number;
  /** in-memory candle map keyed by bucket start (ms). */
  candles: Map<number, Candle>;
}

function scale(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

async function mintDecimals(client: MagiCLOBClient, mint: PublicKey): Promise<number> {
  try {
    const info = await client.getAccountInfo(mint, "base");
    if (info && info.data.length > 45) return info.data[44];
  } catch {
    /* fall through */
  }
  return 9;
}

let running: Promise<void> | null = null;

/**
 * Ensure the in-app indexer is subscribed. Idempotent: instrumentation and the
 * API routes share one subscription. A failure is logged and cleared so the
 * next request can retry.
 */
export function ensureIndexer(network?: Network): Promise<void> {
  if (!running) {
    running = startIndexer(network ?? getNetwork()).catch((err) => {
      running = null;
      console.error(
        "[indexer] in-app indexer stopped:",
        err instanceof Error ? err.message : err
      );
    });
  }
  return running;
}

/**
 * Subscribe to trade events for every configured market and keep the local
 * store (`.indexer/<network>/<market>/{meta,tape,candles}.{json,jsonl}`) fresh.
 * Runs for the lifetime of the process; returns once subscribed.
 */
export async function startIndexer(network: Network = getNetwork()): Promise<void> {
  const cfg = resolveNetworkConfig(network);
  console.log(`[indexer] network=${cfg.network} program=${cfg.programId.toBase58()} (in-app)`);

  const client = new MagiCLOBClient({
    connection: cfg.rpcUrl,
    ephemeralConnection: cfg.routerUrl ?? undefined,
    programId: cfg.programId,
  });
  const sdk = new MagiCLOBSDK(client);

  const byMarket = new Map<string, MarketCtx>();
  for (const pair of cfg.pairs) {
    if (!pair.market) {
      console.log(`[indexer] ${pair.symbol}: no market address - skipped (run setup:market)`);
      continue;
    }
    const market = pair.market;
    const state = await sdk
      .getMarket(new PublicKey(market), "base")
      .catch(() => null);
    if (!state) {
      console.log(`[indexer] ${pair.symbol}: market ${market} not found on ${network} - skipped`);
      continue;
    }
    const baseDecimals = await mintDecimals(client, state.baseMint);
    const quoteDecimals = await mintDecimals(client, state.quoteMint);
    const ctx: MarketCtx = {
      market,
      symbol: pair.symbol,
      baseDecimals,
      quoteDecimals,
      candles: new Map(),
    };
    // Seed from the last file so a restart does not drop history.
    for (const candle of await readCandles(network, market)) {
      ctx.candles.set(candle.t, candle);
    }
    byMarket.set(market, ctx);
    await ensureDir(network, market);
    await writeFile(
      `${marketDir(network, market)}/meta.json`,
      JSON.stringify({
        baseMint: state.baseMint.toBase58(),
        quoteMint: state.quoteMint.toBase58(),
        baseDecimals,
        quoteDecimals,
      })
    );
    console.log(`[indexer] watching ${pair.symbol} @ ${market}`);
  }

  if (byMarket.size === 0) {
    console.error("[indexer] nothing to watch - configure MARKETS_* for this network first.");
    return;
  }

  const pending: Array<{ market: string; line: string }> = [];
  let pendingTs = Date.now();

  // Resolved taker does not change for a given transaction; cache per signature.
  const takerCache = new Map<string, string | null>();

  /** Fee payer / first signer of the fill transaction - the aggressive trader. */
  const resolveTaker = async (sig: string): Promise<string | null> => {
    if (takerCache.has(sig)) return takerCache.get(sig) ?? null;
    let taker: string | null = null;
    try {
      const tx = await client.connection.getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const msg = (tx?.transaction as { message?: any }).message;
      if (msg) {
        const first =
          Array.isArray(msg.staticAccountKeys)
            ? msg.staticAccountKeys[0]
            : msg.accountKeys?.[0];
        const pk = first?.pubkey ?? first;
        taker = typeof pk?.toBase58 === "function" ? pk.toBase58() : null;
      }
    } catch {
      /* keep null */
    }
    takerCache.set(sig, taker);
    return taker;
  };

  const flushTape = async (): Promise<void> => {
    if (pending.length === 0) return;
    const lines = pending.splice(0, pending.length);
    for (const market of new Set(lines.map((l) => l.market))) {
      await ensureDir(network, market);
      await appendFile(
        `${marketDir(network, market)}/tape.jsonl`,
        lines.filter((l) => l.market === market).map((l) => l.line).join("\n") + "\n",
        "utf8"
      );
    }
  };

  const flushCandles = async (): Promise<void> => {
    for (const ctx of byMarket.values()) {
      if (ctx.candles.size === 0) continue;
      const rows = [...ctx.candles.values()].sort((a, b) => a.t - b.t);
      await ensureDir(network, ctx.market);
      await writeFile(
        `${marketDir(network, ctx.market)}/candles.jsonl`,
        rows.map((c) => JSON.stringify(c)).join("\n") + "\n",
        "utf8"
      );
    }
  };

  const handleFills = (
    sig: string,
    taker: string | null,
    ctx: MarketCtx,
    calls: { price: bigint; qty: bigint; maker: string }[],
    isBid: boolean,
    at: number = Date.now()
  ): void => {
    const { baseDecimals, quoteDecimals } = ctx;
    for (const fill of calls) {
      const price = scale(fill.price, quoteDecimals);
      const qty = scale(fill.qty, baseDecimals);
      if (price <= 0 || qty <= 0) continue;
      pending.push({
        market: ctx.market,
        line: JSON.stringify({
          ts: at,
          sig,
          price,
          qty,
          side: isBid ? "buy" : "sell",
          maker: fill.maker,
          taker: taker ?? "",
        }),
      });
      const bucket = Math.floor(at / CANDLE_MS) * CANDLE_MS;
      const prev = ctx.candles.get(bucket);
      ctx.candles.set(
        bucket,
        prev
          ? {
              t: bucket,
              o: prev.o,
              h: Math.max(prev.h, price),
              l: Math.min(prev.l, price),
              c: price,
              v: prev.v + qty,
            }
          : { t: bucket, o: price, h: price, l: price, c: price, v: qty }
      );
    }
  };

  let lastFlush = Date.now();
  let lastHeartbeat = Date.now();

  client.connection.onLogs(
    cfg.programId,
    async (logs) => {
      if (logs.err) return;
      const signature = logs.signature;
      const taker = await resolveTaker(signature);
      for (const line of logs.logs) {
        const payload = eventPayloadFromLog(line);
        if (!payload) continue;
        const event = decodeTradeEvent(Buffer.from(payload, "base64"));
        if (!event) continue;
        if (event.kind === "OrderFilled") {
          const ctx = byMarket.get(event.market);
          if (ctx) {
            handleFills(
              signature,
              taker,
              ctx,
              event.report.fills.map((f) => ({
                price: f.price,
                qty: f.qty,
                maker: f.maker,
              })),
              event.report.isBid
            );
          }
        }
      }
      const now = Date.now();
      if (now - pendingTs > 1_000) {
        pendingTs = now;
        await flushTape();
      }
      if (now - lastFlush > 3_000) {
        lastFlush = now;
        await flushTape();
        await flushCandles();
      }
      if (now - lastHeartbeat > 30_000) {
        lastHeartbeat = now;
        const markets = [...byMarket.values()].map(
          (m) => `${m.symbol}:${m.candles.size}c`
        );
        console.log(`[indexer] ${markets.join("  ")}`);
      }
    },
    "confirmed"
  );

  console.log(`\n[indexer] live (in-app). ${byMarket.size} market(s) - no separate service needed.`);

  /**
   * On a fresh (empty) store, replay recent program transactions so the tape
   * and candles are seeded from history instead of starting empty. Pace the
   * `getTransaction` lookups so the sweep does not rate-limit the RPC. Enable
   * on any network with `INDEXER_BACKFILL=<n>`; `0` turns it off entirely.
   */
  const storeHadHistory = [...byMarket.values()].some((ctx) => ctx.candles.size > 0);
  const backfillLimit =
    Number(process.env.INDEXER_BACKFILL ?? (network === "mainnet" ? "0" : "40"));
  const backfillHistory = async (): Promise<void> => {
    if (storeHadHistory || backfillLimit <= 0) return;
    let signatures: Array<{ signature: string }>;
    try {
      const list = await client.connection.getSignaturesForAddress(
        cfg.programId,
        { limit: backfillLimit },
        "confirmed"
      );
      signatures = (Array.isArray(list) ? list : []).slice(-backfillLimit);
    } catch (err) {
      console.warn(
        `[indexer] history backfill unavailable (${err instanceof Error ? err.message : err})`
      );
      return;
    }
    if (signatures.length === 0) return;
    let fills = 0;
    for (const { signature } of signatures) {
      try {
        const tx = await client.connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        const logs = tx?.meta?.logMessages ?? [];
        const at = (tx?.blockTime ?? 0) * 1_000;
        const taker = await resolveTaker(signature);
        for (const line of logs) {
          const payload = eventPayloadFromLog(line);
          if (!payload) continue;
          const event = decodeTradeEvent(Buffer.from(payload, "base64"));
          if (event?.kind !== "OrderFilled") continue;
          const ctx = byMarket.get(event.market);
          if (!ctx) continue;
          handleFills(
            signature,
            taker,
            ctx,
            event.report.fills.map((f) => ({
              price: f.price,
              qty: f.qty,
              maker: f.maker,
            })),
            event.report.isBid,
            at
          );
          fills += event.report.fills.length;
        }
      } catch {
        /* one bad transaction must not abort the sweep */
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await flushTape();
    await flushCandles();
    if (fills > 0) {
      console.log(`[indexer] backfilled ${fills} historical fill(s) from ${signatures.length} tx(s)`);
    }
  };
  void backfillHistory().catch((err) => {
    console.warn(
      "[indexer] history backfill failed:",
      err instanceof Error ? err.message : err
    );
  });
}