// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { resolveNetworkConfig } from "@/config/networks";
import { readMeta, readTape } from "@/server/indexer-store";
import { ensureIndexer } from "@/server/indexer";

export const dynamic = "force-dynamic";

/** Latest fills for a pair, from the indexer store. */
export async function GET(req: Request) {
  ensureIndexer();
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
  const [fills, meta] = await Promise.all([
    readTape(cfg.network, pair.market, limit),
    readMeta(cfg.network, pair.market),
  ]);
  return Response.json({ pair: symbol, meta, fills });
}