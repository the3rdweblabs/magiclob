// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! `FlashLoan` account tracks an outstanding flash loan.

use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct FlashLoan {
    /// Market this flash loan belongs to.
    pub market: Pubkey,
    /// Borrower of the flash loan.
    pub borrower: Pubkey,
    /// Asset type: 0 = base, 1 = quote.
    pub asset: u8,
    /// Amount borrowed.
    pub amount: u64,
    /// Fee charged for the flash loan.
    pub fee: u64,
    /// PDA bump.
    pub bump: u8,
}

impl FlashLoan {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 1;
}

/// Returns the `FlashLoan` PDA for a market, borrower, and asset type.
pub fn flash_loan_pda(market: &Pubkey, borrower: &Pubkey, asset: u8) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"flash_loan", market.as_ref(), borrower.as_ref(), &[asset]],
        &crate::ID,
    )
}
