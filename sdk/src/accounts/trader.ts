// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `TraderState` fetch + decode. Field order mirrors `state/trader.rs`.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { readerAfterDiscriminator } from "../codec";
import { TraderStatus, type TraderState } from "../types";

/** Anchor account discriminator for `TraderState`. */
export const TRADER_STATE_DISCRIMINATOR = [124, 33, 101, 17, 158, 79, 26, 140] as const;

/** Decode a raw `TraderState` account buffer. */
export function decodeTraderState(data: Buffer): TraderState {
  const r = readerAfterDiscriminator(data, TRADER_STATE_DISCRIMINATOR, "TraderState");
  return {
    owner: r.pubkey(),
    baseBalance: r.u64(),
    quoteBalance: r.u64(),
    status: r.u8() as TraderStatus,
    bump: r.u8(),
    depositedBase: r.u64(),
    depositedQuote: r.u64(),
    baseVault: r.pubkey(),
    quoteVault: r.pubkey(),
    stakedAmount: r.u64(),
    stakeEpoch: r.u64(),
    epochMakerFeesPaid: r.u64(),
  };
}

/** Fetch and decode a `TraderState`, or `null` when it is not registered yet. */
export async function fetchTraderState(
  connection: Connection,
  trader: PublicKey
): Promise<TraderState | null> {
  const info = await connection.getAccountInfo(trader);
  if (info === null) return null;
  return decodeTraderState(info.data);
}

/** True while the trader is inside an Ephemeral Rollup session. */
export function isDelegated(trader: TraderState): boolean {
  return trader.status === TraderStatus.Delegated;
}
