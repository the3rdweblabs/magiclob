// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Flash loan instructions: `borrow_flashloan_base`, `borrow_flashloan_quote`,
 * `return_flashloan_base`, `return_flashloan_quote`.
 *
 * A flash loan borrows tokens from the vault within a single atomic
 * transaction; the return instruction must credit the vault back (plus fee)
 * before the transaction lands. The `FlashLoan` PDA tracks the outstanding
 * loan so the program can reject unrepaid borrows at the end of the call.
 *
 * Base layer only (custody operations).
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../constants";
import { flashLoanPda, traderPda, vaultBaseTokenPda, vaultPda, vaultQuoteTokenPda } from "../pda";
import type { FlashLoanParams } from "../types";
import {
  DISCRIMINATORS,
  SYSTEM_PROGRAM_ID,
  buildIx,
  ixData,
  mut,
  mutSigner,
  ro,
} from "./shared";

function buildFlashLoanIx(
  discriminator: readonly number[],
  params: FlashLoanParams,
  programId: PublicKey,
  isBorrow: boolean,
  isBase: boolean
): TransactionInstruction {
  const { market, owner, amount, sourceAccount, destinationAccount } = params;
  const vault = vaultPda(market, programId).address;
  const trader = traderPda(market, owner, programId).address;
  const vaultTokenAccount = isBase
    ? vaultBaseTokenPda(market, programId).address
    : vaultQuoteTokenPda(market, programId).address;
  const flashLoan = flashLoanPda(market, owner, isBase ? 0 : 1, programId).address;

  const data = ixData(discriminator)
    .u64(amount)
    .toBuffer();

  const keys = isBorrow
    ? [
        mutSigner(owner),
        mut(market),
        mut(vault),
        mut(trader),
        mut(vaultTokenAccount),
        mut(destinationAccount),
        mut(flashLoan),
        ro(TOKEN_PROGRAM_ID),
        ro(SYSTEM_PROGRAM_ID),
      ]
    : [
        mutSigner(owner),
        mut(market),
        mut(vault),
        mut(trader),
        mut(vaultTokenAccount),
        mut(sourceAccount),
        mut(flashLoan),
        ro(TOKEN_PROGRAM_ID),
      ];

  return buildIx(keys, data, programId);
}

/** Build a `borrow_flashloan_base` instruction. */
export function createBorrowFlashLoanBaseInstruction(
  params: FlashLoanParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  return buildFlashLoanIx(DISCRIMINATORS.borrow_flashloan_base, params, programId, true, true);
}

/** Build a `borrow_flashloan_quote` instruction. */
export function createBorrowFlashLoanQuoteInstruction(
  params: FlashLoanParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  return buildFlashLoanIx(DISCRIMINATORS.borrow_flashloan_quote, params, programId, true, false);
}

/** Build a `return_flashloan_base` instruction. */
export function createReturnFlashLoanBaseInstruction(
  params: FlashLoanParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  return buildFlashLoanIx(DISCRIMINATORS.return_flashloan_base, params, programId, false, true);
}

/** Build a `return_flashloan_quote` instruction. */
export function createReturnFlashLoanQuoteInstruction(
  params: FlashLoanParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  return buildFlashLoanIx(DISCRIMINATORS.return_flashloan_quote, params, programId, false, false);
}
