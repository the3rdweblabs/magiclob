// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `place_limit_order` - rest a priced order, matching whatever it crosses first.
 *
 * Matching is all-or-nothing: if any resulting fill cannot be settled the whole
 * transaction reverts, so every maker this order will cross must be supplied in
 * `makers` (see `makersForOrder()`).
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID, NO_EXPIRY } from "../constants";
import {
  SelfMatchingOption,
  TimeInForce,
  type PlaceLimitOrderParams,
} from "../types";
import {
  DISCRIMINATORS,
  buildIx,
  ixData,
  makerAccounts,
  tradeAccounts,
} from "./shared";

/** Build a `place_limit_order` instruction. */
export function createPlaceLimitOrderInstruction(
  params: PlaceLimitOrderParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const {
    market,
    owner,
    price,
    qty,
    clientOrderId,
    isBid,
    integratorFeeBps = 0,
    timeInForce = TimeInForce.GoodTillCancelled,
    selfMatchingOption = SelfMatchingOption.Allowed,
    expireTimestamp = NO_EXPIRY,
    makers,
  } = params;

  const data = ixData(DISCRIMINATORS.place_limit_order)
    .u64(price)
    .u64(qty)
    .u64(clientOrderId)
    .bool(isBid)
    .u16(integratorFeeBps)
    .u8(timeInForce)
    .u8(selfMatchingOption)
    .u64(expireTimestamp)
    .toBuffer();

  return buildIx(
    [
      ...tradeAccounts(market, owner, programId),
      ...makerAccounts(market, owner, makers, programId),
    ],
    data,
    programId
  );
}
