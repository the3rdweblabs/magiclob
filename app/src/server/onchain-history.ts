import { PublicKey } from "@solana/web3.js";
import { MagiCLOBClient, MagiCLOBSDK } from "@magiclob/sdk";
import { decodeTradeEvent, eventPayloadFromLog } from "../../scripts/lib/events";
import type { Network } from "../config/networks";

export const CANDLE_MS = 60_000;

export interface HistoryCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  [key: string]: unknown;
}

export interface HistoryFill {
  ts: number;
  sig: string;
  price: number;
  qty: number;
  side: "buy" | "sell";
  maker: string;
  taker: string;
}

interface MarketMeta {
  baseDecimals: number;
  quoteDecimals: number;
}

interface HistoryCache {
  candles: HistoryCandle[];
  tape: HistoryFill[];
  fetchedAt: number;
}

const scale = (raw: bigint, decimals: number): number => Number(raw) / 10 ** decimals;

async function mintDecimals(client: MagiCLOBClient, mint: PublicKey): Promise<number> {
  try {
    const info = await client.getAccountInfo(mint, "base");
    if (info && info.data.length > 45) return info.data[44];
  } catch {
    /* fall through */
  }
  return 9;
}

/** Fee payer / first signer of the fill transaction - the aggressive trader. */
function takerOf(tx: { transaction?: { message?: { staticAccountKeys?: unknown[]; accountKeys?: unknown[] } } } | null): string | null {
  const msg = tx?.transaction?.message;
  if (!msg) return null;
  const first = Array.isArray(msg.staticAccountKeys)
    ? (msg.staticAccountKeys as unknown[])[0]
    : (msg.accountKeys as unknown[] | undefined)?.[0];
  const withPubkey = first as { pubkey?: { toBase58?: () => string } };
  const pk = withPubkey.pubkey ?? (first as { toBase58?: () => string } | undefined);
  return typeof pk?.toBase58 === "function" ? pk.toBase58() : null;
}

const sweepDepth = (): number => {
  const raw = Number(process.env.HISTORY_DEPTH ?? 150);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1000;
};

const HISTORY_TTL_MS = Number(process.env.HISTORY_TTL_MS ?? 45_000);
const CONCURRENCY = Number(process.env.HISTORY_CONCURRENCY ?? 6);

const caches = new Map<string, HistoryCache>();
const sweepingNow = new Map<string, Promise<boolean>>();

/**
 * Send exactly zero bytes through the store: trade history is aggregated on
 * demand straight from the chain. Each market's own account history is
 * replayed (that is where every one of its fills lives, however old), then
 * cached in-memory so serverless polling stays cheap until the TTL expires.
 */
export async function loadMarketHistory(
  network: Network,
  market: string
): Promise<{ candles: HistoryCandle[]; tape: HistoryFill[] }> {
  const key = `${network}:${market}`;
  const hit = caches.get(key);
  if (hit && Date.now() - hit.fetchedAt < HISTORY_TTL_MS) {
    return { candles: hit.candles, tape: hit.tape };
  }
  if (!sweepingNow.has(key)) {
    sweepingNow.set(
      key,
      sweepMarket(network, market)
        .catch((err) => {
          console.warn(
            `[onchain-history] sweep ${market} failed:`,
            err instanceof Error ? err.message : err
          );
          return false;
        })
        .finally(() => sweepingNow.delete(key))
    );
  }
  await sweepingNow.get(key);
  const fresh = caches.get(key);
  return {
    candles: fresh?.candles ?? [],
    tape: fresh?.tape ?? [],
  };
}

async function sweepMarket(network: Network, marketAddress: string): Promise<boolean> {
  const cfg = (await import("@/config/networks")).resolveNetworkConfig(network);
  if (!cfg.pairs.some((p) => p.market === marketAddress)) return false;
  const client = new MagiCLOBClient({
    connection: cfg.rpcUrl,
    ephemeralConnection: cfg.routerUrl ?? undefined,
    programId: cfg.programId,
  });
  const sdk = new MagiCLOBSDK(client);
  const market = new PublicKey(marketAddress);
  const depth = sweepDepth();

  let signatures: string[] = [];
  try {
    const list = await client.connection.getSignaturesForAddress(
      market,
      depth > 0 ? { limit: depth } : undefined,
      "confirmed"
    );
    signatures = (Array.isArray(list) ? list : []).map((s) => s.signature).reverse();
  } catch (err) {
    console.warn(
      `[onchain-history] signatures for ${marketAddress} unavailable:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
  if (signatures.length === 0) return false;

  const raw: Array<{
    ts: number;
    sig: string;
    price: bigint;
    qty: bigint;
    maker: string;
    taker: string;
    isBid: boolean;
  }> = [];
  for (let i = 0; i < signatures.length; i += CONCURRENCY) {
    const batch = signatures.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (signature) => {
        try {
          const tx = await client.connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          return { signature, tx };
        } catch {
          return null;
        }
      })
    );
    for (const row of results) {
      if (!row) continue;
      const { signature, tx } = row;
      const at = (tx?.blockTime ?? 0) * 1_000;
      const taker = takerOf(tx);
      for (const line of tx?.meta?.logMessages ?? []) {
        const payload = eventPayloadFromLog(line);
        if (!payload) continue;
        const event = decodeTradeEvent(Buffer.from(payload, "base64"));
        if (event?.kind !== "OrderFilled") continue;
        for (const f of event.report.fills) {
          raw.push({
            ts: at,
            sig: signature,
            price: f.price,
            qty: f.qty,
            maker: f.maker,
            taker: taker ?? "",
            isBid: event.report.isBid,
          });
        }
      }
    }
  }

  if (raw.length === 0) {
    caches.set(`${network}:${marketAddress}`, { candles: [], tape: [], fetchedAt: Date.now() });
    return true;
  }

  const state = await sdk.getMarket(market, "base").catch(() => null);
  if (!state) return false;
  const meta: MarketMeta = {
    baseDecimals: await mintDecimals(client, state.baseMint),
    quoteDecimals: await mintDecimals(client, state.quoteMint),
  };

  const candles = new Map<number, HistoryCandle>();
  const tape: HistoryFill[] = [];
  for (const fill of raw) {
    const price = scale(fill.price, meta.quoteDecimals);
    const qty = scale(fill.qty, meta.baseDecimals);
    if (price <= 0 || qty <= 0) continue;
    tape.push({ ts: fill.ts, sig: fill.sig, price, qty, side: fill.isBid ? "buy" : "sell", maker: fill.maker, taker: fill.taker });
    const bucket = Math.floor(fill.ts / CANDLE_MS) * CANDLE_MS;
    const prev = candles.get(bucket);
    candles.set(
      bucket,
      prev
        ? { t: bucket, o: prev.o, h: Math.max(prev.h, price), l: Math.min(prev.l, price), c: price, v: prev.v + qty }
        : { t: bucket, o: price, h: price, l: price, c: price, v: qty }
    );
  }

  caches.set(`${network}:${marketAddress}`, {
    candles: [...candles.values()].sort((a, b) => a.t - b.t),
    tape: [...tape].sort((a, b) => b.ts - a.ts),
    fetchedAt: Date.now(),
  });
  console.log(
    `[onchain-history] ${marketAddress}: ${raw.length} fill(s), ${candles.size} candle(s) from ${signatures.length} tx(s)`
  );
  return true;
}