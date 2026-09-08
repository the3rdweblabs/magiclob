// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! `VaultState` holds the pool's token balances for a market.
//!
//! In addition to the raw SPL Token balances, the vault tracks outstanding
//! settlement obligations so the engine can run vault-style accounting
//! without touching trader accounts during matching.

use anchor_lang::prelude::*;

use crate::state::VAULT_SEED;
use crate::errors::MagiCLOBError;

#[account]
#[derive(Default)]
pub struct VaultState {
    /// Market this vault belongs to.
    pub market: Pubkey,
    /// Pool's base token balance (SPL Token account).
    pub vault_base_balance: u64,
    /// Pool's quote token balance (SPL Token account).
    pub vault_quote_balance: u64,
    /// Base tokens the pool owes to traders (outgoing settlement liability).
    pub settled_base: u64,
    /// Quote tokens the pool owes to traders (outgoing settlement liability).
    pub settled_quote: u64,
    /// Base tokens traders owe to the pool (incoming settlement receivable).
    pub owed_base: u64,
    /// Quote tokens traders owe to the pool (incoming settlement receivable).
    pub owed_quote: u64,
    /// PDA bump for `[b"vault", market]`.
    pub bump: u8,
}

impl VaultState {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 1;

    pub fn credit_base(&mut self, amount: u64) -> Result<()> {
        self.settled_base = self
            .settled_base
            .checked_add(amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn credit_quote(&mut self, amount: u64) -> Result<()> {
        self.settled_quote = self
            .settled_quote
            .checked_add(amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn debit_base(&mut self, amount: u64) -> Result<()> {
        self.owed_base = self
            .owed_base
            .checked_sub(amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn debit_quote(&mut self, amount: u64) -> Result<()> {
        self.owed_quote = self
            .owed_quote
            .checked_sub(amount)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        Ok(())
    }
}

/// Returns the `VaultState` PDA for a market.
pub fn vault_pda(market: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, market.as_ref()], &crate::ID)
}
