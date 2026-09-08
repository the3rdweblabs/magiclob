// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `modify_order` - shrink a resting order while keeping its queue position.
 *
 * The program only allows reducing size: `new_quantity` must sit strictly
 * between `filled_quantity` and `original_quantity`, and the price may not
 * change (pass `0n`, the default, to keep it).
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID } from "../constants";
import type { ModifyOrderParams } from "../types";
import { DISCRIMINATORS, buildIx, ixData, tradeAccounts } from "./shared";

/** Build a `modify_order` instruction. */
export function createModifyOrderInstruction(
  params: ModifyOrderParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, owner, clientOrderId, isBid, newQuantity, newPrice = 0n } =
    params;

  const data = ixData(DISCRIMINATORS.modify_order)
    .u64(clientOrderId)
    .bool(isBid)
    .u64(newQuantity)
    .u64(newPrice)
    .toBuffer();

  return buildIx(tradeAccounts(market, owner, programId), data, programId);
}
