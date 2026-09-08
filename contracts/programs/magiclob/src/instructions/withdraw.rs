// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Withdraw SPL tokens from the pool vault to the trader.

use crate::errors::MagiCLOBError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
    #[account(
        mut,
        constraint = destination_base_account.owner == authority.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = destination_base_account.mint == market.base_mint @ MagiCLOBError::MintMismatch
    )]
    pub destination_base_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = destination_quote_account.owner == authority.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = destination_quote_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub destination_quote_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"base"],
        bump,
        constraint = base_vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = base_vault_account.mint == market.base_mint @ MagiCLOBError::MintMismatch
    )]
    pub base_vault_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"quote"],
        bump,
        constraint = quote_vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = quote_vault_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub quote_vault_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn withdraw(ctx: Context<Withdraw>, base_amount: u64, quote_amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let market_key = market.key();
    crate::instructions::ensure_active(market)?;

    if base_amount > 0 {
        require!(
            ctx.accounts.trader.deposited_base >= base_amount,
            MagiCLOBError::InsufficientVaultBalance
        );
        require!(
            ctx.accounts.trader.base_balance >= base_amount,
            MagiCLOBError::InsufficientBalance
        );
        let vault_seeds = &[
            VAULT_SEED,
            market_key.as_ref(),
            &[ctx.accounts.vault.bump],
        ];
        let vault_signer = &[&vault_seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.base_vault_account.to_account_info(),
                    to: ctx.accounts.destination_base_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                vault_signer,
            ),
            base_amount,
        )?;
        ctx.accounts.trader.deposited_base = ctx
            .accounts
            .trader
            .deposited_base
            .checked_sub(base_amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        ctx.accounts.trader.base_balance = ctx
            .accounts
            .trader
            .base_balance
            .checked_sub(base_amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    }

    if quote_amount > 0 {
        require!(
            ctx.accounts.trader.deposited_quote >= quote_amount,
            MagiCLOBError::InsufficientVaultBalance
        );
        require!(
            ctx.accounts.trader.quote_balance >= quote_amount,
            MagiCLOBError::InsufficientBalance
        );
        let vault_seeds = &[
            VAULT_SEED,
            market_key.as_ref(),
            &[ctx.accounts.vault.bump],
        ];
        let vault_signer = &[&vault_seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.quote_vault_account.to_account_info(),
                    to: ctx.accounts.destination_quote_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                vault_signer,
            ),
            quote_amount,
        )?;
        ctx.accounts.trader.deposited_quote = ctx
            .accounts
            .trader
            .deposited_quote
            .checked_sub(quote_amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        ctx.accounts.trader.quote_balance = ctx
            .accounts
            .trader
            .quote_balance
            .checked_sub(quote_amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    }

    emit!(crate::instructions::WithdrawEvent {
        market: market.key(),
        owner: ctx.accounts.authority.key(),
        base_amount,
        quote_amount,
    });

    Ok(())
}
