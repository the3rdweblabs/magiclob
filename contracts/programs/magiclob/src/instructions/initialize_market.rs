// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Market initialization and trader registration.

use crate::errors::MagiCLOBError;
use crate::fees::MAX_FEE_BPS;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    /// Admin; becomes `MarketState.authority`.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [MARKET_SEED, base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump,
        space = MarketState::SIZE
    )]
    pub market: Account<'info, MarketState>,
    #[account(
        init,
        payer = authority,
        seeds = [ORDER_BOOK_SEED, market.key().as_ref()],
        bump,
        space = OrderBookState::SIZE
    )]
    pub order_book: Box<Account<'info, OrderBookState>>,
    #[account(
        init,
        payer = authority,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
        space = VaultState::SIZE
    )]
    pub vault: Account<'info, VaultState>,
    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_initialize(
    ctx: Context<InitializeMarket>,
    taker_fee_bps: u16,
    maker_fee_bps: u16,
    integrator_fee_bps_cap: u16,
    tick_size: u64,
    lot_size: u64,
    min_size: u64,
    stake_required: u64,
) -> Result<()> {
    msg!("DBG init: len={} space={}", ctx.accounts.market.to_account_info().data_len(), MarketState::SIZE);
    msg!("DBG market owner={} lamports={}", ctx.accounts.market.to_account_info().owner, ctx.accounts.market.to_account_info().lamports());
    for (i, ai) in ctx.accounts.to_account_infos().iter().enumerate() {
        msg!("DBG acc[{}] key={} data_len={} owner={}", i, ai.key(), ai.data_len(), ai.owner);
    }
    let market = &mut ctx.accounts.market;
    if taker_fee_bps > MAX_FEE_BPS
        || maker_fee_bps > MAX_FEE_BPS
        || integrator_fee_bps_cap > MAX_FEE_BPS
    {
        return err!(MagiCLOBError::InvalidFeeBps);
    }
    if ctx.accounts.base_mint.key() == ctx.accounts.quote_mint.key() {
        return err!(MagiCLOBError::InvalidPrice);
    }
    if tick_size == 0 || lot_size == 0 || min_size == 0 {
        return err!(MagiCLOBError::InvalidPrice);
    }

    market.authority = ctx.accounts.authority.key();
    market.base_mint = ctx.accounts.base_mint.key();
    market.quote_mint = ctx.accounts.quote_mint.key();
    market.taker_fee_bps = taker_fee_bps;
    market.maker_fee_bps = maker_fee_bps;
    market.integrator_fee_bps_cap = integrator_fee_bps_cap;
    market.status = MarketStatus::Active;
    market.bump = ctx.bumps.market;
    market.tick_size = tick_size;
    market.lot_size = lot_size;
    market.min_size = min_size;
    market.epoch = 0;
    market.epoch_start_timestamp = Clock::get()?.unix_timestamp as u64;
    market.epoch_duration = 86400;
    market.current_taker_fee_bps = taker_fee_bps;
    market.current_maker_fee_bps = maker_fee_bps;
    market.next_taker_fee_bps = taker_fee_bps;
    market.next_maker_fee_bps = maker_fee_bps;
    market.stake_required = stake_required;
    market.min_order_size = min_size;
    market.maker_rebate_bps = 0;
    market.base_decimals = ctx.accounts.base_mint.decimals;
    market.quote_decimals = ctx.accounts.quote_mint.decimals;
    market._reserved = [0; 4];

    let book = &mut ctx.accounts.order_book;
    book.market = ctx.accounts.market.key();
    book.authority = ctx.accounts.authority.key();
    book.bid_head = NONE_IDX;
    book.ask_head = NONE_IDX;
    book.bid_free = NONE_IDX;
    book.ask_free = NONE_IDX;

    let vault = &mut ctx.accounts.vault;
    vault.market = ctx.accounts.market.key();
    vault.vault_base_balance = 0;
    vault.vault_quote_balance = 0;
    vault.settled_base = 0;
    vault.settled_quote = 0;
    vault.owed_base = 0;
    vault.owed_quote = 0;
    vault.bump = ctx.bumps.vault;

    Ok(())
}

#[derive(Accounts)]
pub struct RegisterTrader<'info> {
    /// Rent payer. May differ from `owner`.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, MarketState>,
    #[account(
        init,
        payer = payer,
        seeds = [TRADER_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump,
        space = TraderState::SIZE
    )]
    pub trader: Account<'info, TraderState>,
    /// Wallet that owns the internal balance ledger.
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register(
    ctx: Context<RegisterTrader>,
    base_endowment: u64,
    quote_endowment: u64,
) -> Result<()> {
    let trader = &mut ctx.accounts.trader;
    trader.owner = ctx.accounts.owner.key();
    trader.base_balance = base_endowment;
    trader.quote_balance = quote_endowment;
    trader.status = TraderStatus::Active;
    trader.bump = ctx.bumps.trader;
    trader.deposited_base = 0;
    trader.deposited_quote = 0;
    trader.base_vault = Pubkey::default();
    trader.quote_vault = Pubkey::default();
    trader.staked_amount = 0;
    trader.stake_epoch = 0;
    trader.epoch_maker_fees_paid = 0;
    Ok(())
}
