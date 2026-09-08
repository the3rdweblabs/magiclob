// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Order primitive types shared by the engine and the instruction layer.
//!
//! The on-chain book is a pair of fixed-size slot pools (`bids` / `asks` arrays
//! in `OrderBookState`). Each side is a singly-ordered doubly-linked list keyed
//! by `(price, sequence)`:
//!
//! `bids` sort price descending (best bid at the head), tie broken by
//! ascending sequence (FIFO).
//! `asks` sort price ascending (best ask at the head), tie broken by
//! ascending sequence (FIFO).
//!
//! This gives exact price-time priority without heap allocation, which keeps the
//! book deterministic on-chain and cheap on the Ephemeral Rollup.

use anchor_lang::prelude::*;

/// Maximum number of resting orders kept per side.
///
/// Bounded by the 4096-byte SBF stack frame: every `Account<OrderBookState>`
/// deserialization constructs the struct on the stack, so the whole book
/// (discriminator + header + 2 * MAX_ORDERS_PER_SIDE * OrderNode::borsh_size())
/// must stay comfortably under 4 KiB. Bumping this requires moving the pools
/// behind `#[account(zero_copy)]` / `AccountLoader`.
pub const MAX_ORDERS_PER_SIDE: usize = 13;

/// Maximum number of orders accepted in a single `bulk_batch_orders` call.
pub const MAX_BATCH_SIZE: usize = 16;

/// Head/tail sentinel for the linked slot pools (`u16` can address 64 slots).
pub const NONE_IDX: u16 = u16::MAX;

/// Side of the book.
#[derive(
    Default, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord,
)]
pub enum OrderSide {
    #[default]
    Bid,
    Ask,
}

/// Self-trade prevention mode.
#[derive(
    Default, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord,
)]
pub enum SelfMatchingOption {
    #[default]
    Allowed,
    CancelTaker,
    CancelMaker,
}

/// Order lifecycle status.
#[derive(
    Default, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord,
)]
pub enum OrderStatus {
    #[default]
    New,
    PartiallyFilled,
    Filled,
    Cancelled,
}

/// Time in force - only GTC for the MVP.
#[derive(
    Default, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord,
)]
pub enum TimeInForce {
    #[default]
    GoodTillCancelled,
    ImmediateOrCancel,
    FillOrKill,
    PostOnly,
}

/// On-disk representation of a resting order inside an `OrderBookState`.
///
/// Not an account: this borsh-serializes inside the order book account.
#[derive(
    Default, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord,
)]
pub struct OrderNode {
    /// True while the slot is occupied by a live order.
    pub active: bool,
    /// Which side of the book this order rests on.
    pub side: OrderSide,
    /// Limit price (quote units per base unit). Market-shaped leftovers never rest.
    pub price: u64,
    /// Remaining unfilled quantity (base units).
    pub qty_remaining: u64,
    /// Owner of the order (trader).
    pub owner: Pubkey,
    /// Integrator credited with the integrator fee on this order.
    pub integrator: Pubkey,
    /// Integrator fee rate (bp) locked at placement; capped per market.
    pub integrator_fee_bps: u16,
    /// Client-supplied order id used for cancels and reporting.
    pub client_order_id: u64,
    /// Book sequence number - FIFO tiebreaker at equal price.
    pub sequence: u64,
    /// Previous slot in the per-side doubly linked list, or `NONE_IDX`.
    pub prev: u16,
    /// Next slot in the per-side doubly linked list, or `NONE_IDX`.
    pub next: u16,
    /// Expiration timestamp in Unix seconds. Order is invalid after this time.
    pub expire_timestamp: u64,
    /// Filled quantity so far, used for status and modification checks.
    pub filled_quantity: u64,
    /// Time-in-force governing this order.
    pub time_in_force: TimeInForce,
    /// Self-trade prevention mode.
    pub self_matching_option: SelfMatchingOption,
}

impl OrderNode {
    pub(crate) const fn borsh_size() -> usize {
        1 + 1 + 8 + 8 + 32 + 32 + 2 + 8 + 8 + 2 + 2 + 8 + 8 + 1 + 1
    }
}

/// Client input for a single order (used by place instructions and batches).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct OrderArgs {
    /// True for a bid (buy), false for an ask (sell).
    pub is_bid: bool,
    /// Limit price; `0` is treated as a market order.
    pub price: u64,
    /// Quantity in base units.
    pub qty: u64,
    /// Client-supplied order id.
    pub client_order_id: u64,
    /// Time-in-force for this order.
    pub time_in_force: TimeInForce,
    /// Self-trade prevention mode.
    pub self_matching_option: SelfMatchingOption,
    /// Expiration timestamp in Unix seconds.
    pub expire_timestamp: u64,
}

/// One executed fill report.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Fill {
    /// Execution price of this fill.
    pub price: u64,
    /// Filled base quantity.
    pub qty: u64,
    /// Sequence id of the resting (maker) order.
    pub maker_order_id: u64,
    /// Owner of the resting (maker) order.
    pub maker: Pubkey,
    /// Maker fee charged on this fill.
    pub maker_fee: u64,
}

/// End-of-call summary for a single aggressive order; emitted as an event.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, Default)]
pub struct MatchReport {
    /// Sequence id assigned to this aggressive order.
    pub taker_order_id: u64,
    /// True if the aggressive order was a bid.
    pub is_bid: bool,
    /// Total base filled.
    pub total_base_filled: u64,
    /// Total quote value filled (excludes fees).
    pub total_quote_filled: u64,
    /// VWAP of the fills.
    pub avg_fill_price: u64,
    /// Base quantity that remains unmatched (kept resting for limits).
    pub remaining_base: u64,
    /// Per-fill breakdown.
    pub fills: Vec<Fill>,
    /// Total taker fee charged this call.
    pub taker_fee_total: u64,
    /// Total maker fee charged this call.
    pub maker_fee_total: u64,
    /// Total integrator fee charged this call (credited to `accumulated_integrator_fees`).
    pub integrator_fee_total: u64,
    /// True if a self-trade was detected and handled.
    pub self_trade: bool,
    /// True if any maker was skipped due to expiration.
    pub order_expired: bool,
}