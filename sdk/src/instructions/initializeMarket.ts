// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `initialize_market` - create the `MarketState`, `OrderBookState` and
 * `VaultState` PDAs for a base/quote pair.
 *
 * Admin-only in practice: the signer becomes `MarketState.authority`.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../constants";
import { marketPda, orderBookPda, vaultPda } from "../pda";
import type { InitializeMarketParams } from "../types";
import {
  DISCRIMINATORS,
  SYSTEM_PROGRAM_ID,
  buildIx,
  ixData,
  mut,
  mutSigner,
  ro,
} from "./shared";

/** Build an `initialize_market` instruction. */
export function createInitializeMarketInstruction(
  params: InitializeMarketParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const {
    authority,
    baseMint,
    quoteMint,
    takerFeeBps,
    makerFeeBps,
    integratorFeeBpsCap,
    tickSize,
    lotSize,
    minSize,
    stakeRequired = 0n,
  } = params;

  const market = marketPda(baseMint, quoteMint, programId).address;

  const data = ixData(DISCRIMINATORS.initialize_market)
    .u16(takerFeeBps)
    .u16(makerFeeBps)
    .u16(integratorFeeBpsCap)
    .u64(tickSize)
    .u64(lotSize)
    .u64(minSize)
    .u64(stakeRequired)
    .toBuffer();

  return buildIx(
    [
      mutSigner(authority),
      mut(market),
      mut(orderBookPda(market, programId).address),
      mut(vaultPda(market, programId).address),
      ro(baseMint),
      ro(quoteMint),
      ro(SYSTEM_PROGRAM_ID),
      ro(TOKEN_PROGRAM_ID),
    ],
    data,
    programId
  );
}
