// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { resolveNetworkConfig } from "@/config/networks";
import { readCandles, readMeta } from "@/server/indexer-store";
import { ensureIndexer } from "@/server/indexer";
import { ensureMarketMaker } from "@/server/market-maker";

export const dynamic = "force-dynamic";

/** 1m candles for a pair, from the indexer store. */
export async function GET(req: Request) {
  ensureIndexer();
  ensureMarketMaker();
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("pair") ?? "";
  const cfg = resolveNetworkConfig();
  const pair = cfg.pairs.find((p) => p.symbol === symbol);
  if (!pair?.market) {
    return Response.json(
      { error: `pair ${symbol} is not configured on ${cfg.network}` },
      { status: 404 }
    );
  }
  const [candles, meta] = await Promise.all([
    readCandles(cfg.network, pair.market),
    readMeta(cfg.network, pair.market),
  ]);
  return Response.json({ pair: symbol, meta, candles });
}