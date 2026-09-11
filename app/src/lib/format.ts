// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * BigInt-safe display helpers.
 *
 * Every on-chain amount is a raw `bigint` (base units for quantities,
 * quote-units-per-base-unit for prices). Display formatting happens here in one
 * place so the UI never does raw floating-point arithmetic on ledger values.
 */

export interface Decimals {
  base: number;
  quote: number;
}

/** Raw integer -> floating display string, scaled by `decimals`. */
export function scaleAmount(input: bigint | number, decimals: number): number {
  const n = typeof input === "bigint" ? Number(input) : input;
  return n / 10 ** decimals;
}

/** Price with tick-aware precision (forces the tick's decimal count). */
export function formatPrice(
  raw: bigint,
  tickSize: bigint,
  quoteDecimals: number,
  maxFrac = 6
): string {
  if (raw === 0n) return "0";
  const frac = Math.min(_decimalsOf(tickSize, quoteDecimals), maxFrac);
  return _toUnits(raw, quoteDecimals, frac);
}

/** Quantity at the market's lot precision. */
export function formatQty(raw: bigint, baseDecimals: number, maxFrac = 6): string {
  if (raw === 0n) return "0";
  return _toUnits(raw, baseDecimals, Math.min(baseDecimals, maxFrac));
}

function _decimalsOf(value: bigint, quoteDecimals: number): number {
  // Number of decimal places the tick actually encodes.
  let decimals = quoteDecimals;
  let v = value;
  while (v > 0n && v % 10n === 0n) {
    v /= 10n;
    decimals -= 1;
  }
  return Math.max(decimals, 0);
}

function _toUnits(raw: bigint, decimals: number, frac: number): string {
  const neg = raw < 0n;
  const abs = raw < 0n ? -raw : raw;
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = abs / scale;
  const rem = abs % scale;
  if (rem === 0n) return (neg ? "-" : "") + whole.toString();
  const fracStr = rem.toString().padStart(decimals, "0");
  const cut = Math.min(frac, fracStr.length);
  const trimmed = fracStr.slice(0, cut).replace(/0+$/, "");
  if (trimmed === "") return (neg ? "-" : "") + whole.toString();
  return `${neg ? "-" : ""}${whole}.${trimmed}`;
}

/** Parse a user-typed decimal string back to raw `bigint` units. */
export function parseRaw(
  input: string,
  decimals: number
): bigint | null {
  const text = input.trim();
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;
  if (text === "0" || text === "0." || text === ".0") return 0n;
  const [whole, fracRaw = ""] = text.split(".");
  const frac = fracRaw.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole === "" ? "0" : whole) * 10n ** BigInt(decimals) + BigInt(frac === "" ? "0" : frac);
}

/** True when `raw` is an exact multiple of `step`. */
export function isMultiple(raw: bigint, step: bigint): boolean {
  if (step <= 0n) return true;
  return raw % step === 0n;
}

/** Compact pubkey: `AbC1…WxYz`. */
export function shortPubkey(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) return "now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}