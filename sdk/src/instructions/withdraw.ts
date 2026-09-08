// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `withdraw` - move SPL tokens from the pool vault back to the caller.
 *
 * Bounded by `TraderState.deposited_*`; the program reverts with
 * `InsufficientVaultBalance` on an over-withdrawal. Unlike `deposit`, the mints
 * are read from `MarketState` rather than passed in.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../constants";
import {
  traderPda,
  vaultBaseTokenPda,
  vaultPda,
  vaultQuoteTokenPda,
} from "../pda";
import type { VaultTransferParams } from "../types";
import {
  DISCRIMINATORS,
  SYSTEM_PROGRAM_ID,
  buildIx,
  ixData,
  mut,
  mutSigner,
  ro,
} from "./shared";

/** Build a `withdraw` instruction. */
export function createWithdrawInstruction(
  params: VaultTransferParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const {
    market,
    authority,
    baseTokenAccount,
    quoteTokenAccount,
    baseAmount = 0n,
    quoteAmount = 0n,
  } = params;

  const data = ixData(DISCRIMINATORS.withdraw)
    .u64(baseAmount)
    .u64(quoteAmount)
    .toBuffer();

  return buildIx(
    [
      mutSigner(authority),
      mut(market),
      mut(vaultPda(market, programId).address),
      mut(traderPda(market, authority, programId).address),
      mut(baseTokenAccount), // destination_base_account
      mut(quoteTokenAccount), // destination_quote_account
      mut(vaultBaseTokenPda(market, programId).address),
      mut(vaultQuoteTokenPda(market, programId).address),
      ro(TOKEN_PROGRAM_ID),
      ro(SYSTEM_PROGRAM_ID),
    ],
    data,
    programId
  );
}
