// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Deposit SPL tokens into the pool vault.

use crate::errors::MagiCLOBError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub market: Box<Account<'info, MarketState>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump = vault.bump,
        constraint = vault.market == market.key() @ MagiCLOBError::InvalidAuthority
    )]
    pub vault: Box<Account<'info, VaultState>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), authority.key().as_ref()],
        bump = trader.bump,
        constraint = trader.owner == authority.key() @ MagiCLOBError::TraderAuthMismatch
    )]
    pub trader: Box<Account<'info, TraderState>>,
    pub base_mint: Box<Account<'info, anchor_spl::token::Mint>>,
    pub quote_mint: Box<Account<'info, anchor_spl::token::Mint>>,
    #[account(
        mut,
        constraint = base_token_account.mint == base_mint.key() @ MagiCLOBError::MintMismatch,
        constraint = base_token_account.owner == authority.key() @ MagiCLOBError::InvalidTokenAccountOwner
    )]
    pub base_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = quote_token_account.mint == quote_mint.key() @ MagiCLOBError::MintMismatch,
        constraint = quote_token_account.owner == authority.key() @ MagiCLOBError::InvalidTokenAccountOwner
    )]
    pub quote_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"base"],
        bump,
        constraint = base_vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = base_vault_account.mint == base_mint.key() @ MagiCLOBError::MintMismatch
    )]
    pub base_vault_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"quote"],
        bump,
        constraint = quote_vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = quote_vault_account.mint == quote_mint.key() @ MagiCLOBError::MintMismatch
    )]
    pub quote_vault_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn deposit(ctx: Context<Deposit>, base_amount: u64, quote_amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    crate::instructions::ensure_active(market)?;

    if base_amount > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.base_token_account.to_account_info(),
                    to: ctx.accounts.base_vault_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            base_amount,
        )?;
        ctx.accounts.trader.deposited_base = ctx
            .accounts
            .trader
            .deposited_base
            .checked_add(base_amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        ctx.accounts.trader.base_balance = ctx
            .accounts
            .trader
            .base_balance
            .checked_add(base_amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    }

    if quote_amount > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.quote_token_account.to_account_info(),
                    to: ctx.accounts.quote_vault_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            quote_amount,
        )?;
        ctx.accounts.trader.deposited_quote = ctx
            .accounts
            .trader
            .deposited_quote
            .checked_add(quote_amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        ctx.accounts.trader.quote_balance = ctx
            .accounts
            .trader
            .quote_balance
            .checked_add(quote_amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    }

    emit!(crate::instructions::DepositEvent {
        market: market.key(),
        owner: ctx.accounts.authority.key(),
        base_amount,
        quote_amount,
    });

    Ok(())
}
