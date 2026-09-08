// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Lazily create the vault's SPL base/quote token accounts.
//!
//! The vault custodies deposits in vault-token SPL token accounts:
//!
//! * `base_vault_account`  - `[b"vault", market, b"base"]`
//! * `quote_vault_account` - `[b"vault", market, b"quote"]`
//!
//! Both are PDAs whose `owner`/authority field is the `VaultState` PDA
//! `[b"vault", market]` (see the `owner == vault.key()` constraints on
//! `deposit`/`withdraw`). External wallets cannot create them: SPL
//! `initialize_account` must be called by the account's own authority, and a
//! PDA can only act through a program CPI. This permissionless, idempotent
//! instruction therefore creates them via `system_program::create_account` +
//! SPL `initialize_account3` CPIs signed with the canonical vault-token PDA
//! seeds.
//!
//! Rerunning it after creation is a no-op (verified against the on-chain token
//! account's mint/owner), so it can be called unconditionally before first
//! deposit.

use super::ensure_active;
use crate::errors::MagiCLOBError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token::{Mint, Token, spl_token};

/// SPL token-account layout size in bytes (`spl_token::state::Account::LEN`).
const TOKEN_ACCOUNT_LEN: u64 = 165;

#[derive(Accounts)]
pub struct InitializeVaultAccounts<'info> {
    /// Pays the rent-exempt lamports for the two vault token accounts.
    #[account(mut)]
    pub rent_payer: Signer<'info>,
    #[account(mut)]
    pub market: Box<Account<'info, MarketState>>,
    #[account(constraint = base_mint.key() == market.base_mint @ MagiCLOBError::MintMismatch)]
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(constraint = quote_mint.key() == market.quote_mint @ MagiCLOBError::MintMismatch)]
    pub quote_mint: Box<Account<'info, Mint>>,
    /// CHECK: VaultState-PDA-owned SPL token account `[b"vault", market, b"base"]`
    /// as an `UncheckedAccount` because it may not exist yet (idempotent no-op
    /// once created). Ownership/state are validated inside the handler before
    /// any mutation.
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"base"],
        bump,
    )]
    pub base_vault_account: UncheckedAccount<'info>,
    /// CHECK: symmetric to `base_vault_account`, seeds `[b"vault", market, b"quote"]`.
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref(), b"quote"],
        bump,
    )]
    pub quote_vault_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle(ctx: Context<InitializeVaultAccounts>) -> Result<()> {
    ensure_active(&ctx.accounts.market)?;

    let market_key = ctx.accounts.market.key();
    let rent_lamports = ctx
        .accounts
        .rent
        .minimum_balance(TOKEN_ACCOUNT_LEN as usize);

    let payer = ctx.accounts.rent_payer.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();
    let base_vault_account = ctx.accounts.base_vault_account.to_account_info();
    let base_mint = ctx.accounts.base_mint.to_account_info();
    let quote_vault_account = ctx.accounts.quote_vault_account.to_account_info();
    let quote_mint = ctx.accounts.quote_mint.to_account_info();

    init_account(
        &payer,
        &base_vault_account,
        &base_mint,
        &market_key,
        b"base",
        ctx.bumps.base_vault_account,
        rent_lamports,
        &system_program,
        &token_program,
    )?;
    init_account(
        &payer,
        &quote_vault_account,
        &quote_mint,
        &market_key,
        b"quote",
        ctx.bumps.quote_vault_account,
        rent_lamports,
        &system_program,
        &token_program,
    )?;

    Ok(())
}

/// Idempotently ensure the vault token account for `side` exists.
#[allow(clippy::too_many_arguments)]
fn init_account<'info>(
    rent_payer: &AccountInfo<'info>,
    vault_account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    market_key: &Pubkey,
    side: &[u8],
    bump: u8,
    rent_lamports: u64,
    system_program: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
) -> Result<()> {
    if vault_account.lamports() > 0 {
        // Already created: verify it is the expected VaultState-PDA-owned
        // token account before treating the instruction as a no-op.
        if *vault_account.owner != token_program.key() {
            return err!(MagiCLOBError::InvalidTokenAccountOwner);
        }
        let existing =
            spl_token::state::Account::unpack(&vault_account.try_borrow_data()?)
                .map_err(|_| MagiCLOBError::InvalidTokenAccountOwner)?;
        if existing.owner != vault_pda(market_key).0 {
            return err!(MagiCLOBError::InvalidTokenAccountOwner);
        }
        if existing.mint != mint.key() {
            return err!(MagiCLOBError::MintMismatch);
        }
        return Ok(());
    }

    let bump_slice = [bump];
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, market_key.as_ref(), side, &bump_slice];

    anchor_lang::system_program::create_account(
        CpiContext::new_with_signer(
            system_program.key(),
            anchor_lang::system_program::CreateAccount {
                from: rent_payer.clone(),
                to: vault_account.clone(),
            },
            &[signer_seeds],
        ),
        rent_lamports,
        TOKEN_ACCOUNT_LEN,
        &token_program.key(),
    )?;

    let ix = spl_token::instruction::initialize_account3(
        &spl_token::ID,
        vault_account.key,
        mint.key,
        &vault_pda(market_key).0,
    )?;
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[vault_account.clone(), mint.clone()],
        &[signer_seeds],
    )?;

    Ok(())
}