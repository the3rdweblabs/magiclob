// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! `StakeInfo` tracks a single staker's locked position in a market.

use anchor_lang::prelude::*;

use crate::state::STAKE_SEED;

#[account]
#[derive(Default)]
pub struct StakeInfo {
    /// Market this stake belongs to.
    pub market: Pubkey,
    /// Trader/owner of the stake.
    pub owner: Pubkey,
    /// Amount staked (quote units).
    pub amount: u64,
    /// Epoch when the stake became active.
    pub epoch_activated: u64,
    /// Whether the stake is currently active (not yet unstaked).
    pub active: bool,
    /// PDA bump for `[b"stake", market, owner]`.
    pub bump: u8,
}

impl StakeInfo {
    /// On-chain size (discriminator + serialized fields).
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

/// Returns the `StakeInfo` PDA for a market and owner.
pub fn stake_pda(market: &Pubkey, owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[STAKE_SEED, market.as_ref(), owner.as_ref()], &crate::ID)
}
