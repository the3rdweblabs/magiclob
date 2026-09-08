// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `place_market_order` - sweep the opposite side; never rests.
 *
 * The program forces IOC semantics and an unbounded limit price internally, so
 * only the quantity and self-trade policy are caller-controlled.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID } from "../constants";
import { SelfMatchingOption, type PlaceMarketOrderParams } from "../types";
import {
  DISCRIMINATORS,
  buildIx,
  ixData,
  makerAccounts,
  tradeAccounts,
} from "./shared";

/** Build a `place_market_order` instruction. */
export function createPlaceMarketOrderInstruction(
  params: PlaceMarketOrderParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const {
    market,
    owner,
    qty,
    clientOrderId,
    isBid,
    integratorFeeBps = 0,
    selfMatchingOption = SelfMatchingOption.Allowed,
    makers,
  } = params;

  const data = ixData(DISCRIMINATORS.place_market_order)
    .u64(qty)
    .u64(clientOrderId)
    .bool(isBid)
    .u16(integratorFeeBps)
    .u8(selfMatchingOption)
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
