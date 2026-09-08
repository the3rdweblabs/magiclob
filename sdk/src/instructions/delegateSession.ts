// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `delegate_trader_session` - open a zero-gas Ephemeral Rollup session.
 *
 * Delegates **both** the trader's `TraderState` and the market's shared
 * `OrderBookState` to the ER through the Magicblock Delegation Program. Each
 * delegated account needs three extra PDAs (buffer / record / metadata), which
 * the `#[delegate]` macro injects into the account list - the order below is the
 * IDL's order and must not be rearranged.
 *
 * Note the order book is *shared* market state: delegating it moves the whole
 * market into the session, not just this trader.
 *
 * This instruction is sent to the **base layer**, not the ER.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  MAGICLOB_PROGRAM_ID,
} from "../constants";
import { delegationAccountsFor, orderBookPda, traderPda } from "../pda";
import type { DelegateSessionParams } from "../types";
import {
  DISCRIMINATORS,
  SYSTEM_PROGRAM_ID,
  buildIx,
  ixData,
  mut,
  ro,
  signer,
} from "./shared";

/** Build a `delegate_trader_session` instruction. */
export function createDelegateSessionInstruction(
  params: DelegateSessionParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, owner, payer = owner, validator } = params;

  const trader = traderPda(market, owner, programId).address;
  const orderBook = orderBookPda(market, programId).address;
  const traderDel = delegationAccountsFor(trader, programId);
  const bookDel = delegationAccountsFor(orderBook, programId);

  const keys = [
    signer(payer),
    mut(market),
    mut(traderDel.buffer),
    mut(traderDel.record),
    mut(traderDel.metadata),
    mut(trader),
    mut(bookDel.buffer),
    mut(bookDel.record),
    mut(bookDel.metadata),
    mut(orderBook),
    signer(owner),
    ro(programId), // owner_program
    ro(DELEGATION_PROGRAM_ID),
    ro(SYSTEM_PROGRAM_ID),
  ];

  // The handler reads `remaining_accounts.first()` to pin the session to a
  // specific ER validator identity; omitting it lets the router choose.
  if (validator !== undefined) {
    keys.push(ro(validator));
  }

  return buildIx(keys, ixData(DISCRIMINATORS.delegate_trader_session).toBuffer(), programId);
}
