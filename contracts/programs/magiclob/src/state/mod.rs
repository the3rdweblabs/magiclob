// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! On-chain account state for MagiCLOB.
//!
//! Three PDAs are used:
//!
//! * `[b"market", base_mint, quote_mint]` -> `MarketState` (config + fee ledger).
//! * `[b"order_book", market]`            -> `OrderBookState` (the two-side book).
//! * `[b"trader", market, owner]`         -> `TraderState` (virtual balances).
//! * `[b"vault", market]`                 -> `VaultState` (pool token custody).

pub mod flash_loan;
pub mod market;
pub mod order_book;
pub mod trader;
pub mod vault;
pub mod staking;
pub mod governance;

pub use flash_loan::*;
pub use market::*;
pub use order_book::*;
pub use trader::*;
pub use vault::*;
pub use staking::*;
pub use governance::*;

pub const MARKET_SEED: &[u8] = b"market";
pub const ORDER_BOOK_SEED: &[u8] = b"order_book";
pub const TRADER_SEED: &[u8] = b"trader";
pub const VAULT_SEED: &[u8] = b"vault";
pub const STAKE_SEED: &[u8] = b"stake";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
