// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Bulk order submission: an atomic sequence of limit/market orders.
//!
//! Each element runs `execute` with `is_market = price == 0`. If any element
//! fails, the entire batch reverts (all-or-nothing tx semantics).

use super::settle;
use super::ensure_active;
use crate::engine::{execute, Incoming, OrderArgs};
use crate::errors::MagiCLOBError;
use anchor_lang::prelude::*;

pub use super::place_limit_order::PlaceLimitOrder;

pub fn handle(ctx: Context<PlaceLimitOrder>, orders: Vec<OrderArgs>) -> Result<()> {
    ensure_active(&ctx.accounts.market)?;
    if orders.len() > crate::engine::order_types::MAX_BATCH_SIZE {
        return err!(MagiCLOBError::BatchTooLarge);
    }

    let clock = Clock::get()?.unix_timestamp as u64;

    for args in orders {
        require!(args.qty >= ctx.accounts.market.min_size, MagiCLOBError::InvalidMinSize);
        require!(args.qty % ctx.accounts.market.lot_size == 0, MagiCLOBError::InvalidLotSize);
        if args.price > 0 {
            require!(args.price % ctx.accounts.market.tick_size == 0, MagiCLOBError::InvalidTickSize);
        }

        let incoming = Incoming {
            is_bid: args.is_bid,
            is_market: args.price == 0,
            price: if args.is_bid {
                if args.price == 0 { u64::MAX } else { args.price }
            } else {
                args.price
            },
            qty: args.qty,
            client_order_id: args.client_order_id,
            owner: ctx.accounts.owner.key(),
            integrator: ctx.accounts.trader.owner,
            integrator_fee_bps: 0,
            time_in_force: args.time_in_force,
            self_matching_option: args.self_matching_option,
            expire_timestamp: args.expire_timestamp,
            clock_timestamp: clock,
        };

        let (report, taker_delta, deltas) = execute(
            &mut ctx.accounts.order_book,
            &mut ctx.accounts.market,
            &ctx.accounts.trader,
            &incoming,
        )?;

        settle(
            &ctx.accounts.market.key(),
            &mut ctx.accounts.trader,
            taker_delta,
            &deltas,
            &ctx.remaining_accounts,
        )?;

        emit!(super::OrderFilled {
            market: ctx.accounts.market.key(),
            report,
        });
    }

    Ok(())
}
