// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * PDA derivations for magiCLOB.
 *
 * Seeds mirror `state/mod.rs`:
 *
 * ```text
 * [b"market", base_mint, quote_mint] -> MarketState
 * [b"order_book", market]            -> OrderBookState
 * [b"trader", market, owner]         -> TraderState
 * [b"vault", market]                 -> VaultState
 * [b"vault", market, b"base"]        -> vault base SPL token account
 * [b"vault", market, b"quote"]       -> vault quote SPL token account
 * [b"stake", market, owner]          -> StakeInfo
 * [b"proposal", market, id_bytes]    -> Proposal
 * [b"flash_loan", market, borrower, [asset]] -> FlashLoan
 * ```
 *
 * The delegation PDAs are owned by the Magicblock Delegation Program (except the
 * buffer, which is owned by magiCLOB itself) and are taken from the IDL's
 * generated `pda` specs for `delegate_trader_session`.
 */
import { PublicKey } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  DELEGATION_SEEDS,
  MAGICLOB_PROGRAM_ID,
  SEEDS,
} from "./constants";

/** A derived address plus its canonical bump. */
export interface Pda {
  address: PublicKey;
  bump: number;
}

function derive(seeds: Buffer[], programId: PublicKey): Pda {
  const [address, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { address, bump };
}

/** `[b"market", base_mint, quote_mint]` */
export function marketPda(
  baseMint: PublicKey,
  quoteMint: PublicKey,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive(
    [SEEDS.market, baseMint.toBuffer(), quoteMint.toBuffer()],
    programId
  );
}

/** `[b"order_book", market]` */
export function orderBookPda(
  market: PublicKey,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive([SEEDS.orderBook, market.toBuffer()], programId);
}

/** `[b"trader", market, owner]` */
export function traderPda(
  market: PublicKey,
  owner: PublicKey,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive(
    [SEEDS.trader, market.toBuffer(), owner.toBuffer()],
    programId
  );
}

/** `[b"vault", market]` */
export function vaultPda(
  market: PublicKey,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive([SEEDS.vault, market.toBuffer()], programId);
}

/** `[b"vault", market, b"base"]` - the pool's base SPL token account. */
export function vaultBaseTokenPda(
  market: PublicKey,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive([SEEDS.vault, market.toBuffer(), SEEDS.base], programId);
}

/** `[b"vault", market, b"quote"]` - the pool's quote SPL token account. */
export function vaultQuoteTokenPda(
  market: PublicKey,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive([SEEDS.vault, market.toBuffer(), SEEDS.quote], programId);
}

/** `[b"stake", market, owner]` */
export function stakePda(
  market: PublicKey,
  owner: PublicKey,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive(
    [SEEDS.stake, market.toBuffer(), owner.toBuffer()],
    programId
  );
}

/** `[b"proposal", market, id.to_le_bytes()]` */
export function proposalPda(
  market: PublicKey,
  id: bigint,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(id, 0);
  return derive(
    [SEEDS.proposal, market.toBuffer(), idBuf],
    programId
  );
}

/** `[b"flash_loan", market, borrower, [asset]]` - `asset`: 0=base, 1=quote. */
export function flashLoanPda(
  market: PublicKey,
  borrower: PublicKey,
  asset: number,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive(
    [Buffer.from("flash_loan"), market.toBuffer(), borrower.toBuffer(), Buffer.from([asset])],
    programId
  );
}

// Delegation-program PDAs

/**
 * `[b"buffer", delegated_account]` under the **owning program** (magiCLOB),
 * not the delegation program - this is where the pre-delegation snapshot lives.
 */
export function delegationBufferPda(
  delegatedAccount: PublicKey,
  ownerProgram: PublicKey = MAGICLOB_PROGRAM_ID
): Pda {
  return derive(
    [DELEGATION_SEEDS.buffer, delegatedAccount.toBuffer()],
    ownerProgram
  );
}

/** `[b"delegation", delegated_account]` under the Delegation Program. */
export function delegationRecordPda(delegatedAccount: PublicKey): Pda {
  return derive(
    [DELEGATION_SEEDS.delegation, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

/** `[b"delegation-metadata", delegated_account]` under the Delegation Program. */
export function delegationMetadataPda(delegatedAccount: PublicKey): Pda {
  return derive(
    [DELEGATION_SEEDS.delegationMetadata, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

/** The three delegation PDAs an account needs to enter an ER session. */
export interface DelegationAccounts {
  buffer: PublicKey;
  record: PublicKey;
  metadata: PublicKey;
}

/** Derive all delegation PDAs for one account in a single call. */
export function delegationAccountsFor(
  delegatedAccount: PublicKey,
  ownerProgram: PublicKey = MAGICLOB_PROGRAM_ID
): DelegationAccounts {
  return {
    buffer: delegationBufferPda(delegatedAccount, ownerProgram).address,
    record: delegationRecordPda(delegatedAccount).address,
    metadata: delegationMetadataPda(delegatedAccount).address,
  };
}

/** Every PDA belonging to one market, derived in one call. */
export interface MarketAddresses {
  market: PublicKey;
  orderBook: PublicKey;
  vault: PublicKey;
  vaultBaseToken: PublicKey;
  vaultQuoteToken: PublicKey;
}

/** Convenience bundle for a market's full PDA set. */
export function marketAddresses(
  baseMint: PublicKey,
  quoteMint: PublicKey,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): MarketAddresses {
  const market = marketPda(baseMint, quoteMint, programId).address;
  return {
    market,
    orderBook: orderBookPda(market, programId).address,
    vault: vaultPda(market, programId).address,
    vaultBaseToken: vaultBaseTokenPda(market, programId).address,
    vaultQuoteToken: vaultQuoteTokenPda(market, programId).address,
  };
}
