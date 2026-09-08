// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `MarketState` fetch + decode.
 *
 * Field order is the declaration order in `state/market.rs`; borsh writes no
 * padding, so the reader just walks it top to bottom.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshReader, readerAfterDiscriminator } from "../codec";
import { MarketStatus, type MarketState } from "../types";

/** Anchor account discriminator for `MarketState`. */
export const MARKET_STATE_DISCRIMINATOR = [0, 125, 123, 215, 95, 96, 164, 194] as const;

/** Decode a raw `MarketState` account buffer. */
export function decodeMarketState(data: Buffer): MarketState {
  const r = readerAfterDiscriminator(data, MARKET_STATE_DISCRIMINATOR, "MarketState");
  return readMarketState(r);
}

function readMarketState(r: BorshReader): MarketState {
  const authority = r.pubkey();
  const baseMint = r.pubkey();
  const quoteMint = r.pubkey();
  const takerFeeBps = r.u16();
  const makerFeeBps = r.u16();
  const integratorFeeBpsCap = r.u16();
  const status = r.u8() as MarketStatus;
  const accumulatedFees = r.u64();
  const accumulatedIntegratorFees = r.u64();
  const bump = r.u8();
  const tickSize = r.u64();
  const lotSize = r.u64();
  const minSize = r.u64();
  const epoch = r.u64();
  const epochStartTimestamp = r.u64();
  const epochDuration = r.u64();
  const currentTakerFeeBps = r.u16();
  const currentMakerFeeBps = r.u16();
  const nextTakerFeeBps = r.u16();
  const nextMakerFeeBps = r.u16();
  const stakeRequired = r.u64();
  const minOrderSize = r.u64();
  const makerRebateBps = r.u16();
  const baseDecimals = r.u8();
  const quoteDecimals = r.u8();
  r.skip(4); // _reserved

  return {
    authority,
    baseMint,
    quoteMint,
    takerFeeBps,
    makerFeeBps,
    integratorFeeBpsCap,
    status,
    accumulatedFees,
    accumulatedIntegratorFees,
    bump,
    tickSize,
    lotSize,
    minSize,
    epoch,
    epochStartTimestamp,
    epochDuration,
    currentTakerFeeBps,
    currentMakerFeeBps,
    nextTakerFeeBps,
    nextMakerFeeBps,
    stakeRequired,
    minOrderSize,
    makerRebateBps,
    baseDecimals,
    quoteDecimals,
  };
}

/** Fetch and decode a `MarketState`, or `null` when the account does not exist. */
export async function fetchMarketState(
  connection: Connection,
  market: PublicKey
): Promise<MarketState | null> {
  const info = await connection.getAccountInfo(market);
  if (info === null) return null;
  return decodeMarketState(info.data);
}

/** True when the market is accepting orders. */
export function isMarketActive(market: MarketState): boolean {
  return market.status === MarketStatus.Active;
}
