// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! `TraderState` tracks a single trader's virtual accounts inside one market.
//!
//! MagiCLOB uses real SPL Token-2022 custody. Deposited tokens sit in the pool
//! `VaultState` account; `deposited_base` / `deposited_quote` track the trader's
//! entitlement. Orders move tokens through the vault on match.

use anchor_lang::prelude::*;

use crate::state::TRADER_SEED;

/// Trader status.
#[derive(
    Default, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord,
)]
pub enum TraderStatus {
    #[default]
    Active,
    Delegated,
    Banned,
}

#[account]
#[derive(Default)]
pub struct TraderState {
    /// Wallet that owns this trader account.
    pub owner: Pubkey,
    /// Base asset balance (internal ledger).
    pub base_balance: u64,
    /// Quote asset balance (internal ledger).
    pub quote_balance: u64,
    /// Status of the trader.
    pub status: TraderStatus,
    /// PDA bump for `[b"trader", market, owner]`.
    pub bump: u8,
    /// Total base tokens deposited into the pool vault.
    pub deposited_base: u64,
    /// Total quote tokens deposited into the pool vault.
    pub deposited_quote: u64,
    /// Trader's base SPL token account (ATA or explicit).
    pub base_vault: Pubkey,
    /// Trader's quote SPL token account (ATA or explicit).
    pub quote_vault: Pubkey,
    /// Staked quote amount for fee discounts / governance.
    pub staked_amount: u64,
    /// Epoch when stake becomes active.
    pub stake_epoch: u64,
    /// Maker fees paid in the current epoch (reset at epoch advance).
    pub epoch_maker_fees_paid: u64,
}

impl TraderState {
    /// On-chain size (discriminator + serialized fields).
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1 + 1 + 8 + 8 + 32 + 32 + 8 + 8 + 8;
}

/// Returns the `TraderState` PDA for a market and owner.
pub fn trader_pda(market: &Pubkey, owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TRADER_SEED, market.as_ref(), owner.as_ref()],
        &crate::ID,
    )
}
