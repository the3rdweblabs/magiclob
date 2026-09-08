// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `cancel_order` - remove a resting order by `(side, client_order_id)`.
 *
 * Cancelling frees the slot back to the side's free list; it never touches
 * balances, so no maker accounts are required.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID } from "../constants";
import type { CancelOrderParams } from "../types";
import { DISCRIMINATORS, buildIx, ixData, tradeAccounts } from "./shared";

/** Build a `cancel_order` instruction. */
export function createCancelOrderInstruction(
  params: CancelOrderParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, owner, isBid, clientOrderId } = params;

  const data = ixData(DISCRIMINATORS.cancel_order)
    .bool(isBid)
    .u64(clientOrderId)
    .toBuffer();

  return buildIx(tradeAccounts(market, owner, programId), data, programId);
}
