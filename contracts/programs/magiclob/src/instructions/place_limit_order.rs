// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Limit order placement.
//!
//! The `TradeCtx` accounts bundle (market, order book, trader) is shared with
//! `place_market_order`, `cancel_order` and `bulk_batch_orders`.
//!
//! Matching is **all-or-nothing**: if any fill cannot be settled (insufficient
//! taker balance, insufficient maker balance, arithmetic overflow) the whole
//! transaction reverts. Maker `TraderState` PDAs that earned a fill must be
//! passed in `remaining_accounts`.

use super::settle;
use super::ensure_active;
use crate::engine::order_types::{SelfMatchingOption, TimeInForce};
use crate::engine::{execute, Incoming};
use crate::errors::MagiCLOBError;
use crate::state::*;
use anchor_lang::prelude::*;

/// Canonical trading context shared by order placement, market orders,
/// cancellations, and bulk batches.
#[derive(Accounts)]
pub struct PlaceLimitOrder<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, MarketState>>,
    #[account(mut, seeds = [ORDER_BOOK_SEED, market.key().as_ref()], bump)]
    pub order_book: Box<Account<'info, OrderBookState>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump,
        constraint = trader.owner == owner.key() @ MagiCLOBError::TraderAuthMismatch,
        constraint = trader.status != TraderStatus::Banned @ MagiCLOBError::InvalidAuthority
    )]
    pub trader: Box<Account<'info, TraderState>>,
    /// Signer authorizing use of the trader; also the default integrator.
    pub owner: Signer<'info>,
}

pub fn handle(
    ctx: Context<PlaceLimitOrder>,
    price: u64,
    qty: u64,
    client_order_id: u64,
    is_bid: bool,
    integrator_fee_bps: u16,
    time_in_force: u8,
    self_matching_option: u8,
    expire_timestamp: u64,
) -> Result<()> {
    ensure_active(&ctx.accounts.market)?;

    require!(qty >= ctx.accounts.market.min_size, MagiCLOBError::InvalidMinSize);
    require!(qty % ctx.accounts.market.lot_size == 0, MagiCLOBError::InvalidLotSize);
    require!(
        integrator_fee_bps <= ctx.accounts.market.integrator_fee_bps_cap,
        MagiCLOBError::InvalidFeeBps
    );
    if price > 0 {
        require!(price % ctx.accounts.market.tick_size == 0, MagiCLOBError::InvalidTickSize);
    }

    let tif = match time_in_force {
        0 => TimeInForce::GoodTillCancelled,
        1 => TimeInForce::ImmediateOrCancel,
        2 => TimeInForce::FillOrKill,
        3 => TimeInForce::PostOnly,
        _ => return err!(MagiCLOBError::InvalidPrice),
    };
    let smo = match self_matching_option {
        0 => SelfMatchingOption::Allowed,
        1 => SelfMatchingOption::CancelTaker,
        2 => SelfMatchingOption::CancelMaker,
        _ => return err!(MagiCLOBError::InvalidPrice),
    };

    let incoming = Incoming {
        is_bid,
        is_market: false,
        price,
        qty,
        client_order_id,
        owner: ctx.accounts.owner.key(),
        integrator: ctx.accounts.trader.owner,
        integrator_fee_bps,
        time_in_force: tif,
        self_matching_option: smo,
        expire_timestamp,
        clock_timestamp: Clock::get()?.unix_timestamp as u64,
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
        report: report.clone(),
    });

    if report.remaining_base > 0 && matches!(tif, TimeInForce::GoodTillCancelled) {
        emit!(super::OrderPlaced {
            market: ctx.accounts.market.key(),
            order_id: report.taker_order_id,
            side: if is_bid { OrderSide::Bid } else { OrderSide::Ask },
            price,
            qty: report.remaining_base,
            owner: ctx.accounts.owner.key(),
        });
    }

    Ok(())
}
