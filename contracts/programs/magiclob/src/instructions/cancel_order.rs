// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Cancel a resting order identified by owner + client order id.

use super::ensure_active;
use crate::engine::{cancel_order as match_cancel, OrderSide};
use anchor_lang::prelude::*;

pub use super::place_limit_order::PlaceLimitOrder;

pub fn handle(
    ctx: Context<PlaceLimitOrder>,
    is_bid: bool,
    client_order_id: u64,
) -> Result<()> {
    ensure_active(&ctx.accounts.market)?;

    let side = if is_bid { OrderSide::Bid } else { OrderSide::Ask };
    let node = match_cancel(
        &mut ctx.accounts.order_book,
        side,
        &ctx.accounts.owner.key(),
        client_order_id,
    )?;

    emit!(super::OrderCancelled {
        market: ctx.accounts.market.key(),
        client_order_id: node.client_order_id,
        side: node.side,
        price: node.price,
        qty_remaining: node.qty_remaining,
        owner: node.owner,
    });

    Ok(())
}