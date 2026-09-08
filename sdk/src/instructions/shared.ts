// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Instruction discriminators and account-meta helpers shared by the builders.
 *
 * Discriminators are the exact 8-byte tags from `target/idl/magiclob.json`
 * (Anchor's `sha256("global:<name>")[..8]`). Account order in every builder
 * matches the IDL account list position-for-position - Solana matches accounts
 * by index, so order is part of the ABI.
 */
import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { BorshWriter } from "../codec";
import { MAGICLOB_PROGRAM_ID } from "../constants";
import { orderBookPda, traderPda } from "../pda";

/** 8-byte Anchor discriminators, copied verbatim from the generated IDL. */
export const DISCRIMINATORS = {
  initialize_market: [35, 35, 189, 193, 155, 48, 170, 203],
  register_trader: [75, 243, 224, 167, 1, 5, 51, 32],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  delegate_trader_session: [63, 206, 115, 151, 124, 70, 96, 100],
  place_limit_order: [108, 176, 33, 186, 146, 229, 1, 197],
  place_market_order: [90, 118, 192, 252, 192, 99, 39, 145],
  cancel_order: [95, 129, 237, 240, 8, 49, 223, 132],
  modify_order: [47, 124, 117, 255, 201, 197, 130, 94],
  bulk_batch_orders: [100, 166, 227, 38, 133, 129, 186, 101],
  settle_and_undelegate: [169, 143, 70, 235, 249, 1, 119, 52],
  stake: [206, 176, 202, 18, 200, 209, 179, 108],
  unstake: [90, 95, 107, 42, 205, 124, 50, 225],
  claim_rebates: [110, 14, 89, 21, 203, 12, 2, 135],
  borrow_flashloan_base: [61, 189, 220, 31, 32, 11, 107, 222],
  borrow_flashloan_quote: [66, 183, 35, 226, 1, 217, 26, 72],
  return_flashloan_base: [137, 145, 102, 191, 232, 51, 128, 111],
  return_flashloan_quote: [2, 36, 13, 241, 29, 46, 24, 116],
  submit_proposal: [224, 38, 210, 52, 167, 150, 221, 150],
  vote: [227, 110, 155, 23, 136, 126, 172, 25],
  execute_proposal: [186, 60, 116, 133, 108, 128, 111, 28],
  process_undelegation: [196, 28, 41, 206, 48, 37, 51, 167],
  initialize_vault_accounts: [167, 28, 249, 202, 129, 245, 121, 235],
} as const;

/** Start an instruction data buffer with the given discriminator. */
export function ixData(
  discriminator: readonly number[]
): BorshWriter {
  return new BorshWriter().bytes(discriminator as unknown as number[]);
}

/** Writable, non-signer account meta. */
export const mut = (pubkey: PublicKey): AccountMeta => ({
  pubkey,
  isSigner: false,
  isWritable: true,
});

/** Read-only, non-signer account meta. */
export const ro = (pubkey: PublicKey): AccountMeta => ({
  pubkey,
  isSigner: false,
  isWritable: false,
});

/** Read-only signer meta. */
export const signer = (pubkey: PublicKey): AccountMeta => ({
  pubkey,
  isSigner: true,
  isWritable: false,
});

/** Writable signer meta (fee payers, rent payers). */
export const mutSigner = (pubkey: PublicKey): AccountMeta => ({
  pubkey,
  isSigner: true,
  isWritable: true,
});

export const SYSTEM_PROGRAM_ID = SystemProgram.programId;

/**
 * The four-account `TradeCtx` bundle shared by `place_limit_order`,
 * `place_market_order`, `cancel_order`, `modify_order` and `bulk_batch_orders`.
 */
export function tradeAccounts(
  market: PublicKey,
  owner: PublicKey,
  programId: PublicKey
): AccountMeta[] {
  return [
    mut(market),
    mut(orderBookPda(market, programId).address),
    mut(traderPda(market, owner, programId).address),
    signer(owner),
  ];
}

/**
 * Maker `TraderState` PDAs for `remaining_accounts`.
 *
 * The program compares this set for *exact* equality against the makers it
 * actually filled, and it applies the taker's own deltas in-place rather than
 * through `remaining_accounts` - so the taker is always excluded here.
 */
export function makerAccounts(
  market: PublicKey,
  owner: PublicKey,
  makers: PublicKey[] | undefined,
  programId: PublicKey
): AccountMeta[] {
  if (makers === undefined || makers.length === 0) return [];
  const seen = new Set<string>([owner.toBase58()]);
  const metas: AccountMeta[] = [];
  for (const maker of makers) {
    const key = maker.toBase58();
    if (seen.has(key)) continue; // drop the taker and any duplicates
    seen.add(key);
    metas.push(mut(traderPda(market, maker, programId).address));
  }
  return metas;
}

/** Assemble a `TransactionInstruction` for the magiCLOB program. */
export function buildIx(
  keys: AccountMeta[],
  data: Buffer,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  return new TransactionInstruction({ programId, keys, data });
}
