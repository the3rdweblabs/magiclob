// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Program ids, PDA seeds and well-known account addresses for magiCLOB.
 *
 * Every value here is mirrored from the on-chain program: 
 * seeds come from `state/mod.rs`, the delegation/magic addresses come
 * from the generated IDL (`target/idl/magiclob.json`).
 */
import { PublicKey } from "@solana/web3.js";

/** Deployed `magiclob_core` program id (matches `declare_id!` in `lib.rs`). */
export const MAGICLOB_PROGRAM_ID = new PublicKey(
  "DSMktdhdDAGgittEg88wqrh2AJmNq6oj2YDnNnmeKeQe"
);

/** Magicblock Delegation Program - owns delegated accounts during a session. */
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

/** Magicblock `Magic` program - executes commit / undelegate intents on the ER. */
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);

/** Magicblock magic-context account, required by every commit intent. */
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111"
);

/** SPL Token program (the program is built against classic SPL Token). */
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

/** PDA seeds, byte-identical to `state/mod.rs`. */
export const SEEDS = {
  market: Buffer.from("market"),
  orderBook: Buffer.from("order_book"),
  trader: Buffer.from("trader"),
  vault: Buffer.from("vault"),
  stake: Buffer.from("stake"),
  proposal: Buffer.from("proposal"),
  /** Sub-seeds for the vault's two SPL token accounts. */
  base: Buffer.from("base"),
  quote: Buffer.from("quote"),
} as const;

/** Delegation-program PDA seeds (from the IDL's generated `pda` specs). */
export const DELEGATION_SEEDS = {
  buffer: Buffer.from("buffer"),
  delegation: Buffer.from("delegation"),
  delegationMetadata: Buffer.from("delegation-metadata"),
} as const;

/**
 * Maximum resting orders per side - mirrors `MAX_ORDERS_PER_SIDE` in
 * `engine/order_types.rs`. The book is a fixed-capacity slot pool, so this is a
 * hard ceiling, not a hint.
 */
export const MAX_ORDERS_PER_SIDE = 13;

/** Maximum orders accepted by a single `bulk_batch_orders` call. */
export const MAX_BATCH_SIZE = 16;

/** Linked-list sentinel used by the on-chain book (`NONE_IDX`). */
export const NONE_IDX = 0xffff;

/** Public Magicblock RPC endpoints. */
export const ENDPOINTS = {
  devnetBase: "https://api.devnet.solana.com",
  devnetRouter: "https://devnet-router.magicblock.app",
  mainnetBase: "https://api.mainnet-beta.solana.com",
  mainnetRouter: "https://router.magicblock.app",
} as const;

/**
 * Sentinel for "this order never expires".
 *
 * The engine rejects an incoming order when `clock_timestamp > expire_timestamp`
 * and silently drops resting makers the same way (`engine/matcher.rs`). Passing
 * `0` therefore means *already expired*, not *no expiry* - so the SDK defaults
 * every `expireTimestamp` to `u64::MAX` instead.
 */
export const NO_EXPIRY = 18446744073709551615n; // 2^64 - 1
