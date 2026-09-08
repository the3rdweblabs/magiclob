// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! ER session delegation.
//!
//! Delegates the trader's `TraderState` **and** the market's `OrderBookState`
//! to an Ephemeral Rollup via the Delegation Program. The `#[delegate]` macro
//! generates the delegation CPI machinery (buffer / delegation record /
//! metadata accounts) and locks the accounts from base-layer writes while the
//! session is live.
//!
//! The trader owner authorizes the session; the payer may be a separate sponsor.

use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

#[delegate]
#[derive(Accounts)]
pub struct DelegateTraderSession<'info> {
    /// Fee payer of the session (signs the delegation).
    pub payer: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, MarketState>,
    #[account(
        mut,
        del,
        seeds = [TRADER_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump,
        constraint = trader.owner == owner.key() @ crate::errors::MagiCLOBError::TraderAuthMismatch,
        constraint = trader.status == TraderStatus::Active @ crate::errors::MagiCLOBError::AlreadyDelegated
    )]
    pub trader: Account<'info, TraderState>,
    #[account(
        mut,
        del,
        seeds = [ORDER_BOOK_SEED, market.key().as_ref()],
        bump,
        constraint = order_book.market == market.key() @ crate::errors::MagiCLOBError::InvalidAuthority
    )]
    pub order_book: Box<Account<'info, OrderBookState>>,
    /// Wallet that owns and authorizes the trader session.
    pub owner: Signer<'info>,
}

pub fn handle(ctx: Context<DelegateTraderSession>) -> Result<()> {
    let market = ctx.accounts.market.key();
    let owner = ctx.accounts.trader.owner;
    let validator = ctx
        .remaining_accounts
        .first()
        .map(|account| account.key());

    ctx.accounts.delegate_trader(
        &ctx.accounts.payer,
        &[TRADER_SEED, market.as_ref(), owner.as_ref()],
        DelegateConfig {
            validator,
            ..Default::default()
        },
    )?;

    ctx.accounts.delegate_order_book(
        &ctx.accounts.payer,
        &[ORDER_BOOK_SEED, market.as_ref()],
        DelegateConfig {
            validator,
            ..Default::default()
        },
    )?;

    ctx.accounts.trader.status = TraderStatus::Delegated;
    Ok(())
}