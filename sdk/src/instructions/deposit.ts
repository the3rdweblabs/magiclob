// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `deposit` - move SPL tokens from the caller's token accounts into the pool
 * vault, crediting `TraderState.deposited_*`.
 *
 * Base and quote move in one instruction; pass `0n` for a side to skip it.
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

/** Build a `deposit` instruction. */
export function createDepositInstruction(
  params: VaultTransferParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const {
    market,
    authority,
    baseMint,
    quoteMint,
    baseTokenAccount,
    quoteTokenAccount,
    baseAmount = 0n,
    quoteAmount = 0n,
  } = params;

  const data = ixData(DISCRIMINATORS.deposit)
    .u64(baseAmount)
    .u64(quoteAmount)
    .toBuffer();

  return buildIx(
    [
      mutSigner(authority),
      mut(market),
      mut(vaultPda(market, programId).address),
      mut(traderPda(market, authority, programId).address),
      ro(baseMint),
      ro(quoteMint),
      mut(baseTokenAccount),
      mut(quoteTokenAccount),
      mut(vaultBaseTokenPda(market, programId).address),
      mut(vaultQuoteTokenPda(market, programId).address),
      ro(TOKEN_PROGRAM_ID),
      ro(SYSTEM_PROGRAM_ID),
    ],
    data,
    programId
  );
}
