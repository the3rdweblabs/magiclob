// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! `Proposal` tracks a fee-change governance proposal for a market.

use anchor_lang::prelude::*;

use crate::state::PROPOSAL_SEED;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord)]
pub enum ProposalStatus {
    Pending,
    Active,
    Passed,
    Rejected,
    Executed,
}

impl Default for ProposalStatus {
    fn default() -> Self {
        Self::Pending
    }
}

#[account]
#[derive(Default)]
pub struct Proposal {
    /// Unique proposal id (monotonic per market).
    pub id: u64,
    /// Market this proposal targets.
    pub market: Pubkey,
    /// Proposer (must meet minimum stake).
    pub proposer: Pubkey,
    /// Proposed taker fee (bps).
    pub taker_fee_bps: u16,
    /// Proposed maker fee (bps).
    pub maker_fee_bps: u16,
    /// Votes in favor (weighted by stake).
    pub votes_for: u64,
    /// Votes against (weighted by stake).
    pub votes_against: u64,
    /// Epoch when voting started.
    pub start_epoch: u64,
    /// Epoch when voting ends.
    pub end_epoch: u64,
    /// Current proposal status.
    pub status: ProposalStatus,
    /// PDA bump for `[b"proposal", market, id_bytes]`.
    pub bump: u8,
}

impl Proposal {
    /// On-chain size (discriminator + serialized fields).
    pub const SIZE: usize = 8 + 8 + 32 + 32 + 2 + 2 + 8 + 8 + 8 + 8 + 1 + 1;
}

/// Returns the `Proposal` PDA for a market and proposal id.
pub fn proposal_pda(market: &Pubkey, id: u64) -> (Pubkey, u8) {
    let id_bytes = id.to_le_bytes();
    Pubkey::find_program_address(
        &[PROPOSAL_SEED, market.as_ref(), id_bytes.as_ref()],
        &crate::ID,
    )
}
