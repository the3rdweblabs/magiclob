// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Flash loan instructions.
//!
//! Flash loans allow traders to borrow assets from the vault without collateral,
//! provided the loan is repaid (principal + fee) in the same transaction.
//!
//! The `FlashLoan` PDA acts as a hot potato: it is created in the borrow
//! instruction and consumed (closed) in the return instruction.

use crate::errors::MagiCLOBError;
use crate::state::flash_loan::FlashLoan;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

// Base flash loan

#[derive(Accounts)]
pub struct BorrowFlashLoanBase<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub market: Box<Account<'info, MarketState>>,
    #[account(mut)]
    pub vault: Box<Account<'info, VaultState>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), borrower.key().as_ref()],
        bump = borrower_trader.bump,
        constraint = borrower_trader.owner == borrower.key() @ MagiCLOBError::FlashLoanInvalidBorrower
    )]
    pub borrower_trader: Box<Account<'info, TraderState>>,
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
        constraint = destination_base_account.owner == borrower.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = destination_base_account.mint == market.base_mint @ MagiCLOBError::MintMismatch
    )]
    pub destination_base_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = borrower,
        space = FlashLoan::SIZE,
        seeds = [b"flash_loan", market.key().as_ref(), borrower.key().as_ref(), &[0u8]],
        bump,
    )]
    pub flash_loan: Account<'info, FlashLoan>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn borrow_flashloan_base(ctx: Context<BorrowFlashLoanBase>, amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let market_key = market.key();
    let vault = &mut ctx.accounts.vault;

    require!(amount > 0, MagiCLOBError::InvalidQuantity);
    require!(
        vault.vault_base_balance >= amount,
        MagiCLOBError::InsufficientVaultBalance
    );

    let fee = amount
        .checked_mul(5)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    vault.owed_base = vault
        .owed_base
        .checked_add(amount)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    let vault_seeds = &[
        VAULT_SEED,
        market_key.as_ref(),
        &[vault.bump],
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
        amount,
    )?;

    let flash_loan = &mut ctx.accounts.flash_loan;
    flash_loan.market = market_key;
    flash_loan.borrower = ctx.accounts.borrower.key();
    flash_loan.asset = 0;
    flash_loan.amount = amount;
    flash_loan.fee = fee;
    flash_loan.bump = ctx.bumps.flash_loan;

    emit!(crate::instructions::FlashLoanEvent {
        market: market_key,
        borrower: ctx.accounts.borrower.key(),
        asset: 0,
        amount,
        fee,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ReturnFlashLoanBase<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, MarketState>,
    #[account(mut)]
    pub vault: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), borrower.key().as_ref()],
        bump = borrower_trader.bump,
        constraint = borrower_trader.owner == borrower.key() @ MagiCLOBError::FlashLoanInvalidBorrower
    )]
    pub borrower_trader: Account<'info, TraderState>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"base"],
        bump,
        constraint = base_vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = base_vault_account.mint == market.base_mint @ MagiCLOBError::MintMismatch
    )]
    pub base_vault_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = source_base_account.owner == borrower.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = source_base_account.mint == market.base_mint @ MagiCLOBError::MintMismatch
    )]
    pub source_base_account: Account<'info, TokenAccount>,
    #[account(mut, close = borrower)]
    pub flash_loan: Account<'info, FlashLoan>,
    pub token_program: Program<'info, Token>,
}

pub fn return_flashloan_base(ctx: Context<ReturnFlashLoanBase>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let flash_loan = &ctx.accounts.flash_loan;

    require!(flash_loan.asset == 0, MagiCLOBError::InvalidFlashLoanAsset);
    require!(
        flash_loan.borrower == ctx.accounts.borrower.key(),
        MagiCLOBError::FlashLoanInvalidBorrower
    );
    require!(flash_loan.amount == amount, MagiCLOBError::FlashLoanNotRepaid);

    let total_due = flash_loan
        .amount
        .checked_add(flash_loan.fee)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    require!(
        ctx.accounts.source_base_account.amount >= total_due,
        MagiCLOBError::InsufficientBalance
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.source_base_account.to_account_info(),
                to: ctx.accounts.base_vault_account.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            },
        ),
        total_due,
    )?;

    vault.owed_base = vault
        .owed_base
        .checked_sub(amount)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    vault.settled_base = vault
        .settled_base
        .checked_add(flash_loan.fee)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    Ok(())
}

// Quote flash loan

#[derive(Accounts)]
pub struct BorrowFlashLoanQuote<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub market: Box<Account<'info, MarketState>>,
    #[account(mut)]
    pub vault: Box<Account<'info, VaultState>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), borrower.key().as_ref()],
        bump = borrower_trader.bump,
        constraint = borrower_trader.owner == borrower.key() @ MagiCLOBError::FlashLoanInvalidBorrower
    )]
    pub borrower_trader: Box<Account<'info, TraderState>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"quote"],
        bump,
        constraint = quote_vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = quote_vault_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub quote_vault_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = destination_quote_account.owner == borrower.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = destination_quote_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub destination_quote_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = borrower,
        space = FlashLoan::SIZE,
        seeds = [b"flash_loan", market.key().as_ref(), borrower.key().as_ref(), &[1u8]],
        bump,
    )]
    pub flash_loan: Account<'info, FlashLoan>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn borrow_flashloan_quote(ctx: Context<BorrowFlashLoanQuote>, amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let market_key = market.key();
    let vault = &mut ctx.accounts.vault;

    require!(amount > 0, MagiCLOBError::InvalidQuantity);
    require!(
        vault.vault_quote_balance >= amount,
        MagiCLOBError::InsufficientVaultBalance
    );

    let fee = amount
        .checked_mul(5)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    vault.owed_quote = vault
        .owed_quote
        .checked_add(amount)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    let vault_seeds = &[
        VAULT_SEED,
        market_key.as_ref(),
        &[vault.bump],
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
        amount,
    )?;

    let flash_loan = &mut ctx.accounts.flash_loan;
    flash_loan.market = market_key;
    flash_loan.borrower = ctx.accounts.borrower.key();
    flash_loan.asset = 1;
    flash_loan.amount = amount;
    flash_loan.fee = fee;
    flash_loan.bump = ctx.bumps.flash_loan;

    emit!(crate::instructions::FlashLoanEvent {
        market: market_key,
        borrower: ctx.accounts.borrower.key(),
        asset: 1,
        amount,
        fee,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ReturnFlashLoanQuote<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, MarketState>,
    #[account(mut)]
    pub vault: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), borrower.key().as_ref()],
        bump = borrower_trader.bump,
        constraint = borrower_trader.owner == borrower.key() @ MagiCLOBError::FlashLoanInvalidBorrower
    )]
    pub borrower_trader: Account<'info, TraderState>,
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"quote"],
        bump,
        constraint = quote_vault_account.owner == vault.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = quote_vault_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub quote_vault_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = source_quote_account.owner == borrower.key() @ MagiCLOBError::InvalidTokenAccountOwner,
        constraint = source_quote_account.mint == market.quote_mint @ MagiCLOBError::MintMismatch
    )]
    pub source_quote_account: Account<'info, TokenAccount>,
    #[account(mut, close = borrower)]
    pub flash_loan: Account<'info, FlashLoan>,
    pub token_program: Program<'info, Token>,
}

pub fn return_flashloan_quote(ctx: Context<ReturnFlashLoanQuote>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let flash_loan = &ctx.accounts.flash_loan;

    require!(flash_loan.asset == 1, MagiCLOBError::InvalidFlashLoanAsset);
    require!(
        flash_loan.borrower == ctx.accounts.borrower.key(),
        MagiCLOBError::FlashLoanInvalidBorrower
    );
    require!(flash_loan.amount == amount, MagiCLOBError::FlashLoanNotRepaid);

    let total_due = flash_loan
        .amount
        .checked_add(flash_loan.fee)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    require!(
        ctx.accounts.source_quote_account.amount >= total_due,
        MagiCLOBError::InsufficientBalance
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.source_quote_account.to_account_info(),
                to: ctx.accounts.quote_vault_account.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            },
        ),
        total_due,
    )?;

    vault.owed_quote = vault
        .owed_quote
        .checked_sub(amount)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    vault.settled_quote = vault
        .settled_quote
        .checked_add(flash_loan.fee)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;

    Ok(())
}
