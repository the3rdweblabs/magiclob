// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Market order placement - aggressive sweep with no resting.

use super::settle;
use super::ensure_active;
use crate::engine::{execute, Incoming, SelfMatchingOption};
use crate::errors::MagiCLOBError;
use anchor_lang::prelude::*;

pub use super::place_limit_order::PlaceLimitOrder;

pub fn handle(
    ctx: Context<PlaceLimitOrder>,
    qty: u64,
    client_order_id: u64,
    is_bid: bool,
    integrator_fee_bps: u16,
    self_matching_option: u8,
) -> Result<()> {
    ensure_active(&ctx.accounts.market)?;
    require!(
        qty >= ctx.accounts.market.min_size,
        MagiCLOBError::InvalidMinSize
    );
    require!(
        qty % ctx.accounts.market.lot_size == 0,
        MagiCLOBError::InvalidLotSize
    );
    require!(
        integrator_fee_bps <= ctx.accounts.market.integrator_fee_bps_cap,
        MagiCLOBError::InvalidFeeBps
    );

    let smo = match self_matching_option {
        0 => SelfMatchingOption::Allowed,
        1 => SelfMatchingOption::CancelTaker,
        2 => SelfMatchingOption::CancelMaker,
        _ => return err!(MagiCLOBError::InvalidPrice),
    };

    let incoming = Incoming {
        is_bid,
        is_market: true,
        price: if is_bid { u64::MAX } else { 0 },
        qty,
        client_order_id,
        owner: ctx.accounts.owner.key(),
        integrator: ctx.accounts.trader.owner,
        integrator_fee_bps,
        time_in_force: crate::engine::order_types::TimeInForce::ImmediateOrCancel,
        self_matching_option: smo,
        expire_timestamp: u64::MAX,
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
        report,
    });

    Ok(())
}
