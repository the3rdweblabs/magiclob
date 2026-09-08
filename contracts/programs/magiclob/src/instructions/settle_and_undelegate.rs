// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Session settlement + undelegation on the ER.
//!
//! Recorded evidence: a market/order-book/trader state must be serialized back
//! to the book before the commit + undelegate CPI (`Account::exit`), then
//! `MagicIntentBundleBuilder::commit_and_undelegate` atomically commits the
//! delegated state to the base layer and releases the Delegation Program lock.
//!
//! The Magic accounts (`magic_program`, `magic_context`) are deliberately NOT
//! declared as derived accounts here: dropping them from `try_accounts` keeps
//! the SBPF stack frame under the 4096-byte limit. The SDK always appends them
//! after the five tracked accounts, so they are read back from
//! `ctx.remaining_accounts` and their identities are re-validated on chain.

use crate::engine::price_level;
use crate::engine::OrderSide;
use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::ephem::FoldableIntentBuilder;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

#[derive(Accounts)]
pub struct SettleAndUndelegate<'info> {
    /// Session fee payer.
    #[account(mut)]
    pub payer: Signer<'info>,
    pub market: Box<Account<'info, MarketState>>,
    #[account(
        mut,
        seeds = [ORDER_BOOK_SEED, market.key().as_ref()],
        bump
    )]
    pub order_book: Box<Account<'info, OrderBookState>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub trader: Box<Account<'info, TraderState>>,
    /// Wallet that owns and authorizes settlement and undelegation.
    pub owner: Signer<'info>,
}

pub fn handle<'a>(ctx: Context<'a, SettleAndUndelegate<'a>>) -> Result<()> {
    let market = ctx.accounts.market.key();
    let trader = ctx.accounts.owner.key();

    // Magic accounts travel in remaining_accounts in SDK order:
    // [0] = magic_program, [1] = magic_context.
    let magic_program = ctx.remaining_accounts[0].clone();
    let magic_context = ctx.remaining_accounts[1].clone();
    require_keys_eq!(
        magic_program.key(),
        ephemeral_rollups_sdk::consts::MAGIC_PROGRAM_ID,
        crate::errors::MagiCLOBError::InvalidAuthority
    );
    require_keys_eq!(
        magic_context.key(),
        ephemeral_rollups_sdk::consts::MAGIC_CONTEXT_ID,
        crate::errors::MagiCLOBError::InvalidAuthority
    );

    // Snapshot the post-session book before serializing.
    let bid = price_level::levels(&ctx.accounts.order_book, OrderSide::Bid);
    let ask = price_level::levels(&ctx.accounts.order_book, OrderSide::Ask);

    // The PDA seed encodes owner; verify delegation status before release.
    require!(
        ctx.accounts.trader.status == TraderStatus::Delegated,
        crate::errors::MagiCLOBError::InvalidAuthority
    );

    // Persist the mutated accounts so the commit CPI sees fresh state.
    ctx.accounts.trader.exit(&crate::ID)?;
    ctx.accounts.order_book.exit(&crate::ID)?;

    MagicIntentBundleBuilder::new(
        ctx.accounts.payer.to_account_info(),
        magic_context,
        magic_program,
    )
    .commit_and_undelegate(&[
        ctx.accounts.order_book.to_account_info(),
        ctx.accounts.trader.to_account_info(),
    ])
    .build_and_invoke()?;

    emit!(super::SessionSettled {
        market,
        trader,
        best_bid: bid.first().map(|l| l.price),
        best_ask: ask.first().map(|l| l.price),
        bid_depth: bid.iter().map(|l| l.total_qty).sum(),
        ask_depth: ask.iter().map(|l| l.total_qty).sum(),
        accumulated_fees: ctx.accounts.market.accumulated_fees,
    });

    Ok(())
}