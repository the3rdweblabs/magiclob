// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! `OrderBookState` - fixed-capacity, chain-deterministic price-time priority book.
//!
//! Structure
//!
//! ```text
//! bids:  [slot 0] <-> [slot 1] <-> ...   doubly linked, price DESC, then seq ASC
//!          ^ head = best bid
//! asks:  [slot 0] <-> [slot 1] <-> ...   doubly linked, price ASC,  then seq ASC
//!          ^ head = best ask
//! ```
//!
//! Each side manages its own slot pool with a free-list (`bid_free` / `ask_free`)
//! and a high-water mark (`bid_count` / `ask_count`). Slots are reused so the
//! arrays never grow. There is no heap allocation: on-chain behavior is
//! deterministic which keeps matches reproducible inside the Ephemeral Rollup.

pub use crate::engine::order_types::{OrderNode, OrderSide, MAX_ORDERS_PER_SIDE, NONE_IDX};
use crate::state::ORDER_BOOK_SEED;
use anchor_lang::prelude::*;

#[account]
pub struct OrderBookState {
    /// Market this book belongs to.
    pub market: Pubkey,
    /// Market authority (mirrors `MarketState.authority`).
    pub authority: Pubkey,
    /// Monotonic counter issuing `sequence` to resting orders (FIFO tiebreak).
    pub order_sequence: u64,
    /// Highest-price active bid slot, or `NONE_IDX`.
    pub bid_head: u16,
    /// Lowest-price active ask slot, or `NONE_IDX`.
    pub ask_head: u16,
    /// Free-slot stack head for the bid pool, or `NONE_IDX`.
    pub bid_free: u16,
    /// Free-slot stack head for the ask pool, or `NONE_IDX`.
    pub ask_free: u16,
    /// High-water mark (slots ever handed out) for the bid pool.
    pub bid_count: u16,
    /// High-water mark (slots ever handed out) for the ask pool.
    pub ask_count: u16,
    /// Bid slot pool.
    pub bids: [OrderNode; MAX_ORDERS_PER_SIDE],
    /// Ask slot pool.
    pub asks: [OrderNode; MAX_ORDERS_PER_SIDE],
}

impl Default for OrderBookState {
    fn default() -> Self {
        Self {
            market: Pubkey::default(),
            authority: Pubkey::default(),
            order_sequence: 0,
            bid_head: NONE_IDX,
            ask_head: NONE_IDX,
            bid_free: NONE_IDX,
            ask_free: NONE_IDX,
            bid_count: 0,
            ask_count: 0,
            bids: [OrderNode::default(); MAX_ORDERS_PER_SIDE],
            asks: [OrderNode::default(); MAX_ORDERS_PER_SIDE],
        }
    }
}

impl OrderBookState {
    /// Exact on-chain size in bytes: discriminator (8) + header + two node pools.
    /// Borsh emits no padding, so field sizes sum exactly:
    /// 8 + 32(market) + 32(authority) + 8(seq) + 6*2(heads/counts)
    ///   + 2 * MAX_ORDERS_PER_SIDE * OrderNode::borsh_size()
    pub const SIZE: usize = 8
        + 32
        + 32
        + 8
        + (6 * 2)
        + (MAX_ORDERS_PER_SIDE * OrderNode::borsh_size()) * 2;
}

/// Returns the `OrderBookState` PDA for a `MarketState` key.
pub fn order_book_pda(market: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[ORDER_BOOK_SEED, market.as_ref()], &crate::ID)
}
