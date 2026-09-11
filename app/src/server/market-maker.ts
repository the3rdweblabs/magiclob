// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * In-app market maker: a small automated market maker (buy-side/sell-side
 * quote refresh + periodic taker) that places REAL orders and fills through the
 * deployed magiCLOB program, so the orderbook trades itself.
 *
 * The Next server bootstraps this alongside the in-app indexer (via
 * `instrumentation.ts` and the data routes), making the app self-contained:
 * start it, and the book, tape and candlesticks come alive on devnet localnet
 * without any external service.
 *
 * Safety: enabled automatically on `local` and `devnet`; `mainnet` only when
 * `MARKET_MAKER=1`. Every action is try/caught - a failure is logged and the
 * loop continues; it never crashes the server. Funding the payer keypair on
 * devnet is up to you (10 SOL devnet faucet).
 */
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  MagiCLOBClient,
  MagiCLOBSDK,
  OrderSide,
  SelfMatchingOption,
  TimeInForce,
  type MarketState,
} from "@magiclob/sdk";
import type { Network } from "../config/networks";
import { getNetwork, resolveNetworkConfig } from "../config/networks";
import { payerKeypair } from "../../scripts/lib/keys";

const MID: Record<string, bigint> = {
  "SOL/USDC": 95_000_000n,   // 95.00 USDC per SOL
  "MAGIC/USDC": 1_200_000n,  // 1.20 USDC per MAGIC
};
const DEFAULT_MID = 50_000_000n;

const CYCLE_MS = 12_000;
const MAX_CYCLES = Number(process.env.SEED_MAX_CYCLES ?? "0"); // 0 = forever

/** Space out individual transactions so a burst never rate-limits the RPC. */
const PACE_MS = 250;

function rng(): bigint {
  return BigInt(Math.floor(Math.random() * 1_000_000_000));
}

function drift(mid: bigint): bigint {
  const pct = (Math.random() - 0.48) * 0.004; // ±0.2% walk - visible candle bodies
  return mid + BigInt(Math.round(Number(mid) * pct));
}

let running: Promise<void> | null = null;

/** Which networks trade automatically. Mainnet must be explicitly opted in. */
function makerEnabled(network: Network): boolean {
  const forced = process.env.MARKET_MAKER;
  if (forced !== undefined) return forced === "1" || forced === "true";
  return network === "local" || network === "devnet";
}

/**
 * Ensure the in-app market maker is running. Idempotent; a failure is logged
 * and cleared so the next call can retry.
 */
export function ensureMarketMaker(
  opts: { network?: Network; dryRun?: boolean } = {}
): Promise<void> {
  const network = opts.network ?? getNetwork();
  if (!opts.dryRun && !makerEnabled(network)) return Promise.resolve();
  if (!running) {
    running = startMarketMaker({ network, dryRun: opts.dryRun }).catch((err) => {
      running = null;
      console.error(
        "[maker] in-app market maker stopped:",
        err instanceof Error ? err.message : err
      );
    });
  }
  return running;
}

export async function startMarketMaker(
  opts: { network?: Network; dryRun?: boolean } = {}
): Promise<void> {
  const network = opts.network ?? getNetwork();
  const dryRun = opts.dryRun ?? false;
  const cfg = resolveNetworkConfig(network);

  let payer;
  try {
    payer = payerKeypair();
  } catch (err) {
    console.warn(
      "[maker] " + (err instanceof Error ? err.message : err) +
        " - live demo trades disabled (in-app indexer still runs)."
    );
    return;
  }

  console.log(`[maker] network=${network}${dryRun ? "  (DRY RUN)" : ""} bot=${payer.publicKey.toBase58()}`);

  const client = new MagiCLOBClient({
    connection: cfg.rpcUrl,
    ephemeralConnection: cfg.routerUrl ?? undefined,
    programId: cfg.programId,
  });
  const sdk = new MagiCLOBSDK(client);
  const conn = client.connection;

  const pairs = cfg.pairs.filter((p) => p.market);
  if (pairs.length === 0) {
    console.warn("[maker] no markets configured - no demo trades.");
    return;
  }

  let budgetBase = BigInt(process.env.SEED_BASE_AMOUNT ?? "150000000000");   // 150 base
  let budgetQuote = BigInt(process.env.SEED_QUOTE_AMOUNT ?? "60000000000");  // 60_000 quote

  if (dryRun) {
    for (const pair of pairs) {
      const marketAddr = new PublicKey(pair.market!);
      const state = await sdk.getMarket(marketAddr, "base").catch(() => null);
      const mid = MID[pair.symbol] ?? DEFAULT_MID;
      console.log(`[maker] ${pair.symbol} @ ${mid.toLocaleString()} (${marketAddr.toBase58()})`);
      console.log(
        `   would cycle: 2 bids (mid-1t/-3t), 2 asks (mid+1t/+3t) + a taker per cycle` +
          ` (tick=${state?.tickSize?.toString()} lot=${state?.lotSize?.toString()} min=${state?.minSize?.toString()})`
      );
    }
    console.log("[maker] dry-run complete - set SEED_ENABLE_REAL=1 or run in-app to trade.");
    return;
  }

  const cycles = new Map<string, bigint>();
  const trackers = new Map<string, { mid: bigint }>();

  for (const pair of pairs) {
    const market = new PublicKey(pair.market!);
    let state: MarketState | null = null;
    try {
      state = await sdk.getMarket(market, "base");
    } catch {
      state = null;
    }
    if (!state) {
      console.warn(`[maker] ${pair.symbol}: market ${market.toBase58()} not found on ${network} - skipping.`);
      continue;
    }

    try {
      const trader = await sdk.getTrader(market, payer.publicKey, "base");
      if (!trader) {
        await sdk.registerTrader({ market, owner: payer.publicKey }, [payer]);
        console.log(`[maker] ${pair.symbol}: registered trader`);
      }
      const baseAta = (await getOrCreateAssociatedTokenAccount(conn, payer, state.baseMint, payer.publicKey)).address;
      const quoteAta = (await getOrCreateAssociatedTokenAccount(conn, payer, state.quoteMint, payer.publicKey)).address;
      await sdk.deposit(
        {
          market,
          authority: payer.publicKey,
          baseMint: state.baseMint,
          quoteMint: state.quoteMint,
          baseTokenAccount: baseAta,
          quoteTokenAccount: quoteAta,
          baseAmount: budgetBase,
          quoteAmount: budgetQuote,
        },
        [payer]
      );
      cycles.set(pair.symbol, rng());
      trackers.set(pair.symbol, { mid: MID[pair.symbol] ?? DEFAULT_MID });
      console.log(`[maker] ${pair.symbol}: registered + deposited (${pair.symbol === "SOL/USDC" ? "150 SOL / 60,000 USDC" : "150 MAGIC / 60,000 USDC"})`);
    } catch (err) {
      console.warn(
        `[maker] ${pair.symbol}: setup failed (${err instanceof Error ? err.message : err}) - skipping; fund the payer keypair and restart to trade it.`
      );
      continue;
    }
  }

  if (cycles.size === 0) {
    console.warn("[maker] no markets ready to trade. Check the payer keypair funding and market addresses.");
    return;
  }

  console.log("\n[maker] trading…  (running with the app - Ctrl-C/CD to stop)");

  let turn = 0;
  let doneRounds = 0;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (; MAX_CYCLES === 0 || doneRounds < MAX_CYCLES; ) {
    const start = Date.now();
    for (const pair of pairs) {
      const market = new PublicKey(pair.market!);
      const state = await sdk.getMarket(market, "base").catch(() => null);
      if (!state) continue;
      const t = trackers.get(pair.symbol);
      const id = cycles.get(pair.symbol);
      if (!t || id === undefined) continue;
      const tick = state.tickSize;
      const lot = state.lotSize;
      const owner = payer.publicKey;

      t.mid = drift(t.mid);
      t.mid = (t.mid / tick) * tick; // snap to tick size

      try {
        const open = await sdk.getOpenOrders(market, owner, "base");
        for (const o of open) {
          await sdk.cancelOrder(
            { market, owner, isBid: o.side === OrderSide.Bid, clientOrderId: o.clientOrderId },
            [payer],
            "base"
          );
          await sleep(PACE_MS);
        }
      } catch (err) {
        console.warn(`[maker] WARN ${pair.symbol} cancel phase failed: ${(err as Error).message}`);
      }

      const floor = (p: bigint) => (p >= tick ? p : tick);
      const bids = [
        { price: floor(t.mid - tick), qty: lot * 3n },
        { price: floor(t.mid - tick * 3n), qty: lot * 2n },
      ];
      const asks = [
        { price: t.mid + tick, qty: lot * 3n },
        { price: t.mid + tick * 3n, qty: lot * 2n },
      ];
      for (const [i, o] of bids.entries()) {
        try {
          await sdk.placeLimitOrder(
            { market, owner, price: o.price, qty: o.qty, clientOrderId: id + BigInt(i), isBid: true, timeInForce: TimeInForce.GoodTillCancelled, selfMatchingOption: SelfMatchingOption.Allowed },
            [payer],
            "base"
          );
        } catch (err) {
          console.warn(`[maker] WARN ${pair.symbol} BID phase-price=mid-${i === 0 ? "1t" : "3t"} p=${o.price} q=${o.qty} failed: ${(err as Error).message}`);
        }
        await sleep(PACE_MS);
      }
      for (const [i, o] of asks.entries()) {
        try {
          await sdk.placeLimitOrder(
            { market, owner, price: o.price, qty: o.qty, clientOrderId: id + BigInt(10 + i), isBid: false, timeInForce: TimeInForce.GoodTillCancelled, selfMatchingOption: SelfMatchingOption.Allowed },
            [payer],
            "base"
          );
        } catch (err) {
          console.warn(`[maker] WARN ${pair.symbol} ASK phase-price=mid+${i === 0 ? "1t" : "3t"} p=${o.price} q=${o.qty} failed: ${(err as Error).message}`);
        }
        await sleep(PACE_MS);
      }

      // small taker order, alternating side each cycle → fills on our own book
      await sleep(600);
      const takerBid = (turn + (pair.symbol === pairs[0].symbol ? 0 : 1)) % 2 === 0;
      const qty = lot * 2n;
      try {
        const makers = await sdk.resolveMakers(market, takerBid, qty, null, "base");
        if (makers.length > 0) {
          await sdk.placeMarketOrder(
            { market, owner, qty, clientOrderId: id + 100n, isBid: takerBid, selfMatchingOption: SelfMatchingOption.Allowed, makers },
            [payer],
            "base"
          );
        } else {
          console.log(`[maker] ${pair.symbol}: no makers for taker (book empty?)`);
        }
      } catch (err) {
        console.warn(`[maker] WARN ${pair.symbol} taker failed: ${(err as Error).message}`);
      }

      cycles.set(pair.symbol, id + 1000n);
    }
    turn += 1;
    doneRounds += 1;
    const elapsed = Date.now() - start;
    const wait = Math.max(CYCLE_MS - elapsed, 500);
    await sleep(wait);
  }
  console.log("[maker] done.");
}