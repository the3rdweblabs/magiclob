// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { resolveNetworkConfig } from "@/config/networks";
import { ensureMarketMaker } from "@/server/market-maker";
import { loadMarketHistory } from "@/server/onchain-history";

export const dynamic = "force-dynamic";

/** 1m candles for a pair, aggregated straight from on-chain trade events. */
export async function GET(req: Request) {
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
  const { candles } = await loadMarketHistory(cfg.network, pair.market);
  return Response.json({ pair: symbol, candles });
}