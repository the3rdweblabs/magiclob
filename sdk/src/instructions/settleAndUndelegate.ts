// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `settle_and_undelegate` - commit ER state back to Solana and release the lock.
 *
 * Serializes the mutated book/trader accounts, then issues a
 * `commit_and_undelegate` intent through the Magic program. After this lands the
 * accounts are writable on the base layer again.
 *
 * This instruction is sent to the **Ephemeral Rollup**, not the base layer -
 * use `MagiCLOBClient.ephemeral` (or `sendOnEphemeral`) to route it correctly.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  MAGICLOB_PROGRAM_ID,
} from "../constants";
import { orderBookPda, traderPda } from "../pda";
import type { SettleAndUndelegateParams } from "../types";
import {
  DISCRIMINATORS,
  buildIx,
  ixData,
  mut,
  mutSigner,
  ro,
  signer,
} from "./shared";

/** Build a `settle_and_undelegate` instruction. */
export function createSettleAndUndelegateInstruction(
  params: SettleAndUndelegateParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, owner, payer = owner } = params;

  const keys = [
    mutSigner(payer),
    ro(market),
    mut(orderBookPda(market, programId).address),
    mut(traderPda(market, owner, programId).address),
    signer(owner),
    ro(MAGIC_PROGRAM_ID),
    mut(MAGIC_CONTEXT_ID),
  ];

  return buildIx(keys, ixData(DISCRIMINATORS.settle_and_undelegate).toBuffer(), programId);
}
