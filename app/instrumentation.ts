// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Server-startup hook: boots the built-in indexer so the app reads the
 * on-chain tape + candles without a separately-running service.
 *
 * Runs once per Next server process (dev and `next start`). Skipped during
 * `next build`. The API routes also lazily ensure the indexer, so the chart is
 * populated even if this hook is bypassed.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { ensureIndexer } = await import("./src/server/indexer");
    ensureIndexer();
  } catch (err) {
    console.error("[indexer] failed to start in-app indexer:", err);
  }
  try {
    const { ensureMarketMaker } = await import("./src/server/market-maker");
    ensureMarketMaker();
  } catch (err) {
    console.error("[maker] failed to start in-app market maker:", err);
  }
}