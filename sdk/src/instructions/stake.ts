// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `stake` - lock tokens into the market's staking pool to earn maker-fee rebates
 * and gain governance voting power.
 *
 * Transfers tokens from the caller's SPL token account into the vault and
 * credits `StakeInfo`. The trader must have sufficient deposited balance.
 * Base layer only.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../constants";
import { stakePda, traderPda, vaultBaseTokenPda, vaultPda, vaultQuoteTokenPda } from "../pda";
import type { StakeParams } from "../types";
import {
  DISCRIMINATORS,
  SYSTEM_PROGRAM_ID,
  buildIx,
  ixData,
  mut,
  mutSigner,
  ro,
} from "./shared";

/** Build a `stake` instruction. */
export function createStakeInstruction(
  params: StakeParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, owner, amount, tokenAccount, vaultAccount, mint } = params;

  const data = ixData(DISCRIMINATORS.stake)
    .u64(amount)
    .toBuffer();

  return buildIx(
    [
      mutSigner(owner),
      mut(market),
      mut(stakePda(market, owner, programId).address),
      mut(traderPda(market, owner, programId).address),
      mut(tokenAccount),
      mut(vaultAccount),
      ro(TOKEN_PROGRAM_ID),
      ro(SYSTEM_PROGRAM_ID),
    ],
    data,
    programId
  );
}
