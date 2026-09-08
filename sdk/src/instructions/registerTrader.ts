// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `register_trader` - create the `TraderState` PDA for `(market, owner)`.
 *
 * Required before the owner can place any order. `baseEndowment` /
 * `quoteEndowment` seed the *internal ledger* balances directly - useful on
 * localnet/devnet fixtures, and normally left at `0n` in production where
 * balances arrive through `deposit`.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID } from "../constants";
import { traderPda } from "../pda";
import type { RegisterTraderParams } from "../types";
import {
  DISCRIMINATORS,
  SYSTEM_PROGRAM_ID,
  buildIx,
  ixData,
  mut,
  mutSigner,
  ro,
  signer,
} from "./shared";

/** Build a `register_trader` instruction. */
export function createRegisterTraderInstruction(
  params: RegisterTraderParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const {
    market,
    owner,
    payer = owner,
    baseEndowment = 0n,
    quoteEndowment = 0n,
  } = params;

  const data = ixData(DISCRIMINATORS.register_trader)
    .u64(baseEndowment)
    .u64(quoteEndowment)
    .toBuffer();

  return buildIx(
    [
      mutSigner(payer),
      mut(market),
      mut(traderPda(market, owner, programId).address),
      signer(owner),
      ro(SYSTEM_PROGRAM_ID),
    ],
    data,
    programId
  );
}
