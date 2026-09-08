// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Staking instructions: stake, unstake, claim_rebates.

use crate::errors::MagiCLOBError;
use crate::fees::fee_amount;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

/// Stake quote tokens into the market's staking pool.
#[derive(Accounts)]
pub struct Stake<'info> {
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
        init_if_needed,
        payer = authority,
        seeds = [STAKE_SEED, market.key().as_ref(), authority.key().as_ref()],
        bump,
        space = StakeInfo::SIZE
    )]
    pub stake_info: Box<Account<'info, StakeInfo>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), authority.key().as_ref()],
        bump = trader.bump,
        constraint = trader.owner == authority.key() @ MagiCLOBError::TraderAuthMismatch
    )]
    pub trader: Box<Account<'info, TraderState>>,
    #[account(
        mut,
        constraint = token_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch,
        constraint = token_account.owner == authority.key() @ MagiCLOBError::InvalidTokenAccountOwner
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"quote"],
        bump,
        constraint = vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = vault_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub vault_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    crate::instructions::ensure_active(market)?;

    if amount == 0 {
        return err!(MagiCLOBError::InvalidQuantity);
    }
    if amount < market.stake_required {
        return err!(MagiCLOBError::StakeBelowMinimum);
    }
    if ctx.accounts.trader.quote_balance < amount {
        return err!(MagiCLOBError::InsufficientBalance);
    }

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.token_account.to_account_info(),
                to: ctx.accounts.vault_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        amount,
    )?;

    let trader = &mut ctx.accounts.trader;
    trader.quote_balance = trader
        .quote_balance
        .checked_sub(amount)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    let stake = &mut ctx.accounts.stake_info;
    stake.market = market.key();
    stake.owner = ctx.accounts.authority.key();
    stake.amount = stake.amount.checked_add(amount).ok_or(MagiCLOBError::ArithmeticOverflow)?;
    stake.epoch_activated = market.epoch;
    stake.active = true;
    stake.bump = ctx.bumps.stake_info;

    emit!(StakeEvent {
        market: market.key(),
        owner: ctx.accounts.authority.key(),
        amount,
    });

    Ok(())
}

/// Unstake tokens after the epoch lockup has passed.
#[derive(Accounts)]
pub struct Unstake<'info> {
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
        seeds = [STAKE_SEED, market.key().as_ref(), authority.key().as_ref()],
        bump = stake_info.bump,
        constraint = stake_info.market == market.key() @ MagiCLOBError::InvalidAuthority,
        constraint = stake_info.owner == authority.key() @ MagiCLOBError::TraderAuthMismatch,
        constraint = stake_info.active @ MagiCLOBError::NoStake
    )]
    pub stake_info: Box<Account<'info, StakeInfo>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), authority.key().as_ref()],
        bump = trader.bump,
        constraint = trader.owner == authority.key() @ MagiCLOBError::TraderAuthMismatch
    )]
    pub trader: Box<Account<'info, TraderState>>,
    #[account(
        mut,
        constraint = token_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch,
        constraint = token_account.owner == authority.key() @ MagiCLOBError::InvalidTokenAccountOwner
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"quote"],
        bump,
        constraint = vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = vault_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub vault_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
    let market = &ctx.accounts.market;
    crate::instructions::ensure_active(market)?;

    let stake = &ctx.accounts.stake_info;
    let amount = stake.amount;

    if !stake.active {
        return err!(MagiCLOBError::NoStake);
    }
    if market.epoch < stake.epoch_activated + 1 {
        return err!(MagiCLOBError::StakeLockupNotPassed);
    }

    let market_key = market.key();
    let vault_signature_seeds = &[
        VAULT_SEED,
        market_key.as_ref(),
        &[ctx.accounts.vault.bump],
    ];
    let signer_seeds = &[&vault_signature_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault_account.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let trader = &mut ctx.accounts.trader;
    trader.quote_balance = trader
        .quote_balance
        .checked_add(amount)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    let stake_info = &mut ctx.accounts.stake_info;
    stake_info.active = false;
    stake_info.amount = 0;

    emit!(UnstakeEvent {
        market: market.key(),
        owner: ctx.accounts.authority.key(),
        amount,
    });

    Ok(())
}

/// Claim maker rebates earned from providing liquidity in low-fee epochs.
#[derive(Accounts)]
pub struct ClaimRebates<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub market: Box<Account<'info, MarketState>>,
    #[account(
        mut,
        seeds = [STAKE_SEED, market.key().as_ref(), authority.key().as_ref()],
        bump = stake_info.bump,
        constraint = stake_info.market == market.key() @ MagiCLOBError::InvalidAuthority,
        constraint = stake_info.owner == authority.key() @ MagiCLOBError::TraderAuthMismatch,
        constraint = stake_info.active @ MagiCLOBError::NoStake
    )]
    pub stake_info: Box<Account<'info, StakeInfo>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), authority.key().as_ref()],
        bump = trader.bump,
        constraint = trader.owner == authority.key() @ MagiCLOBError::TraderAuthMismatch
    )]
    pub trader: Box<Account<'info, TraderState>>,
    #[account(
        mut,
        constraint = token_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch,
        constraint = token_account.owner == authority.key() @ MagiCLOBError::InvalidTokenAccountOwner
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump = vault.bump,
        constraint = vault.market == market.key() @ MagiCLOBError::InvalidAuthority
    )]
    pub vault: Box<Account<'info, VaultState>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"quote"],
        bump,
        constraint = vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = vault_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub vault_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn claim_rebates(ctx: Context<ClaimRebates>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    crate::instructions::ensure_active(market)?;

    let trader = &mut ctx.accounts.trader;

    if market.maker_rebate_bps == 0 {
        return err!(MagiCLOBError::NoRebatesAvailable);
    }

    let rebate_amount = fee_amount(trader.epoch_maker_fees_paid, market.maker_rebate_bps)?;

    if rebate_amount == 0 {
        return err!(MagiCLOBError::NoRebatesAvailable);
    }
    if market.accumulated_fees < rebate_amount {
        return err!(MagiCLOBError::InsufficientVaultBalance);
    }

    market.accumulated_fees = market
        .accumulated_fees
        .checked_sub(rebate_amount)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    let market_key = market.key();
    let vault_signature_seeds = &[
        VAULT_SEED,
        market_key.as_ref(),
        &[ctx.accounts.vault.bump],
    ];
    let signer_seeds = &[&vault_signature_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault_account.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        rebate_amount,
    )?;

    trader.quote_balance = trader
        .quote_balance
        .checked_add(rebate_amount)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    trader.epoch_maker_fees_paid = 0;

    emit!(ClaimRebatesEvent {
        market: market.key(),
        owner: ctx.accounts.authority.key(),
        amount: rebate_amount,
    });

    Ok(())
}

#[event]
pub struct StakeEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct UnstakeEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ClaimRebatesEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}
