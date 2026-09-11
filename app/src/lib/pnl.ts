// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Per-wallet P&L from the live tape.
 *
 * Fills are attributed by role: the tape `side` records the *taker's* direction,
 * so the taker moves with it and the resting maker moves against it. A simple
 * running-position ledger turns the wallet's own fills into realized P&L, and
 * the open position is marked to the current mid for unrealized P&L.
 */
import type { Fill } from "@/hooks/useData";

export interface Pnl {
  /** Signed base position: positive = long, negative = short. */
  position: number;
  /** Average price of the open long, or 0 when flat/short. */
  avgLong: number;
  /** Average price of the open short, or 0 when flat/long. */
  avgShort: number;
  realized: number;
  unrealized: number;
  total: number;
  trades: number;
}

export function walletPnl(
  fills: Fill[],
  wallet: string | null,
  mid: number | null
): Pnl | null {
  if (!wallet) return null;
  const own = fills
    .filter((f) => f.taker === wallet || f.maker === wallet)
    .sort((a, b) => a.ts - b.ts);
  if (own.length === 0) return null;

  let position = 0;
  let avgLong = 0;
  let avgShort = 0;
  let realized = 0;

  for (const f of own) {
    const dir = f.side === "buy" ? 1 : -1;
    const flow = f.taker === wallet ? dir * f.qty : -dir * f.qty;
    if (flow > 0) {
      if (position >= 0) {
        const prev = position;
        position += flow;
        avgLong = position === 0 ? 0 : (avgLong * prev + f.price * flow) / position;
      } else {
        const matched = Math.min(flow, -position);
        realized += (avgShort - f.price) * matched;
        position += matched;
        const leftover = flow - matched;
        if (leftover > 0) {
          position = leftover;
          avgLong = f.price;
          avgShort = 0;
        } else if (position === 0) {
          avgShort = 0;
        }
      }
    } else {
      const qty = -flow;
      if (position <= 0) {
        const prev = position;
        position += flow;
        avgShort = position === 0 ? 0 : (avgShort * -prev + f.price * qty) / -position;
      } else {
        const matched = Math.min(qty, position);
        realized += (f.price - avgLong) * matched;
        position -= matched;
        if (position === 0) avgLong = 0;
        const leftover = qty - matched;
        if (leftover > 0) {
          position = -leftover;
          avgShort = f.price;
        }
      }
    }
  }

  const unrealized =
    position > 0 && mid != null
      ? position * (mid - avgLong)
      : position < 0 && mid != null
        ? position * (mid - avgShort)
        : 0;

  return {
    position,
    avgLong,
    avgShort,
    realized,
    unrealized,
    total: realized + unrealized,
    trades: own.length,
  };
}