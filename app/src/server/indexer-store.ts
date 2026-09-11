// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Server-side read access to the indexer store.
 *
 * The in-app indexer (`src/server/indexer.ts`, bootstrapped by the server) is
 * the only writer; API routes are read-only. Everything lives under
 * `<app>/.indexer/<network>/<market>/` so no network ever pollutes another.
 * Missing files are legitimate (market or indexer not running yet) and read as
 * empty collections, never as an error.
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Candle {
  /** Bucket start, epoch ms. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface FillRecord {
  /** Event time, epoch ms. */
  ts: number;
  sig: string;
  price: number;
  qty: number;
  /** Taker perspective: "buy" = taker bought base. */
  side: "buy" | "sell";
  maker: string;
  taker: string;
}

export interface MarketMeta {
  baseDecimals: number;
  quoteDecimals: number;
  baseMint: string;
  quoteMint: string;
}

const ROOT = join(process.cwd(), ".indexer");

export function indexerRoot(): string {
  return ROOT;
}

export function marketDir(network: string, market: string): string {
  return join(ROOT, network, market);
}

export async function readMeta(
  network: string,
  market: string
): Promise<MarketMeta | null> {
  try {
    return JSON.parse(
      await readFile(join(marketDir(network, market), "meta.json"), "utf8")
    ) as MarketMeta;
  } catch {
    return null;
  }
}

export async function readTape(
  network: string,
  market: string,
  limit = 50
): Promise<FillRecord[]> {
  try {
    const raw = await readFile(
      join(marketDir(network, market), "tape.jsonl"),
      "utf8"
    );
    const lines = raw.split("\n").filter(Boolean).slice(-Math.max(limit * 2, 200));
    return lines
      .map((line) => JSON.parse(line) as FillRecord)
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}

export async function readCandles(
  network: string,
  market: string
): Promise<Candle[]> {
  try {
    const raw = await readFile(
      join(marketDir(network, market), "candles.jsonl"),
      "utf8"
    );
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Candle);
  } catch {
    return [];
  }
}

/** Ensure the store dir exists (used by the indexer before writing). */
export async function ensureDir(network: string, market: string): Promise<string> {
  const dir = marketDir(network, market);
  await mkdir(dir, { recursive: true });
  return dir;
}