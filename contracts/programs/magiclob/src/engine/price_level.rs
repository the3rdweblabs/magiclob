// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Price-level views over the book.
//!
//! The matcher works directly on the per-side linked slot pools; this module
//! provides aggregation helpers that collapse consecutive equal-priced nodes
//! into "levels" (total quantity + order count at a price), used for top-of-book
//! and depth reporting. Duplicates are never written by the engine, so each
//! level here corresponds to one or more FIFO orders at the same price.

use crate::engine::order_types::{NONE_IDX, OrderNode, OrderSide};
use crate::state::order_book::OrderBookState;

/// Aggregated state of a single price level.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PriceLevel {
    /// Limit price of the level.
    pub price: u64,
    /// Total remaining base quantity across orders at this price.
    pub total_qty: u64,
    /// Number of orders at this price.
    pub order_count: u16,
    /// Front of the FIFO queue at this price (earliest sequence).
    pub head_slot: u16,
}

/// Walks the side's linked list and returns the aggregated levels, best-first
/// (highest price for bids, lowest price for asks), most-significant first.
pub fn levels(book: &OrderBookState, side: OrderSide) -> Vec<PriceLevel> {
    let mut out: Vec<PriceLevel> = Vec::with_capacity(32);
    let mut slot = match side {
        OrderSide::Bid => book.bid_head,
        OrderSide::Ask => book.ask_head,
    };
    // Trust only nodes that match the side being walked; the pool is shared.
    while slot != NONE_IDX {
        let node: &OrderNode = match side {
            OrderSide::Bid => &book.bids[slot as usize],
            OrderSide::Ask => &book.asks[slot as usize],
        };
        if !node.active || node.side != side {
            break;
        }
        match out.last_mut() {
            Some(lvl) if lvl.price == node.price => {
                lvl.total_qty = lvl.total_qty.saturating_add(node.qty_remaining);
                lvl.order_count += 1;
            }
            _ => out.push(PriceLevel {
                price: node.price,
                total_qty: node.qty_remaining,
                order_count: 1,
                head_slot: slot,
            }),
        }
        slot = node.next;
    }
    out
}

/// Best (head-of-list) price for a side, or `None` when the side is empty.
pub fn best_price(book: &OrderBookState, side: OrderSide) -> Option<u64> {
    let slot = match side {
        OrderSide::Bid => book.bid_head,
        OrderSide::Ask => book.ask_head,
    };
    if slot == NONE_IDX {
        return None;
    }
    Some(match side {
        OrderSide::Bid => book.bids[slot as usize].price,
        OrderSide::Ask => book.asks[slot as usize].price,
    })
}

/// Top-of-book summary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TopOfBook {
    pub best_bid: Option<u64>,
    pub best_ask: Option<u64>,
    pub bid_qty: u64,
    pub ask_qty: u64,
}

pub fn top_of_book(book: &OrderBookState) -> TopOfBook {
    let bid_qty = levels(book, OrderSide::Bid).first().map(|l| l.total_qty).unwrap_or(0);
    let ask_qty = levels(book, OrderSide::Ask).first().map(|l| l.total_qty).unwrap_or(0);
    TopOfBook {
        best_bid: best_price(book, OrderSide::Bid),
        best_ask: best_price(book, OrderSide::Ask),
        bid_qty,
        ask_qty,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::order_book::OrderBookState;

    fn node(price: u64, qty: u64, seq: u64) -> OrderNode {
        OrderNode {
            active: true,
            side: OrderSide::Bid,
            price,
            qty_remaining: qty,
            sequence: seq,
            prev: NONE_IDX,
            next: NONE_IDX,
            ..Default::default()
        }
    }

    #[test]
    fn collapses_equal_prices_into_one_level() {
        let mut book = OrderBookState::default();
        for (i, (p, q)) in [(100, 5), (100, 7), (99, 2)].iter().enumerate() {
            book.bids[i] = node(*p, *q, i as u64);
        }
        book.bids[0].next = 1;
        book.bids[1].prev = 0;
        book.bids[1].next = 2;
        book.bids[2].prev = 1;
        book.bid_head = 0;
        book.bid_count = 3;

        let lvls = levels(&book, OrderSide::Bid);
        assert_eq!(lvls.len(), 2);
        assert_eq!(lvls[0].price, 100);
        assert_eq!(lvls[0].total_qty, 12);
        assert_eq!(lvls[0].order_count, 2);
        assert_eq!(lvls[1].price, 99);
        assert_eq!(lvls[1].total_qty, 2);
    }

    #[test]
    fn best_price_is_head() {
        let mut book = OrderBookState::default();
        book.bids[0] = node(100, 5, 0);
        book.bid_head = 0;
        book.asks[0] = node(101, 3, 0);
        book.ask_head = 0;
        assert_eq!(best_price(&book, OrderSide::Bid), Some(100));
        assert_eq!(best_price(&book, OrderSide::Ask), Some(101));

        let empty = OrderBookState::default();
        assert_eq!(best_price(&empty, OrderSide::Bid), None);
        assert_eq!(top_of_book(&empty), TopOfBook::default());
    }
}