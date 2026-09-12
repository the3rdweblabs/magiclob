// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { resolveNetworkConfig } from "@/config/networks";
import { loadMarketHistory } from "@/server/onchain-history";

export const dynamic = "force-dynamic";

/** Latest fills for a pair, read straight from on-chain trade events. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("pair") ?? "";
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") ?? 40)));
  const cfg = resolveNetworkConfig();
  const pair = cfg.pairs.find((p) => p.symbol === symbol);
  if (!pair?.market) {
    return Response.json(
      { error: `pair ${symbol} is not configured on ${cfg.network}` },
      { status: 404 }
    );
  }
  const { tape } = await loadMarketHistory(cfg.network, pair.market);
  return Response.json({ pair: symbol, fills: tape.slice(0, limit) });
}