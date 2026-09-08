// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! `MarketState` holds a market's configuration, status, and its fee ledger.

use anchor_lang::prelude::*;

use crate::errors::MagiCLOBError;
use crate::state::MARKET_SEED;

/// Market lifecycle status.
#[derive(
    Default, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord,
)]
pub enum MarketStatus {
    #[default]
    Active,
    Paused,
    Delisted,
}

#[account]
#[derive(Default)]
pub struct MarketState {
    /// Admin that can pause/delist the market. Set at init to the initializer.
    pub authority: Pubkey,
    /// Base asset mint.
    pub base_mint: Pubkey,
    /// Quote asset mint.
    pub quote_mint: Pubkey,
    /// Taker fee rate in bps, charged on the executed notional.
    pub taker_fee_bps: u16,
    /// Maker fee rate in bps, charged on the executed notional.
    pub maker_fee_bps: u16,
    /// Upper bound for the integrator fee rate of any resting order.
    pub integrator_fee_bps_cap: u16,
    /// Current market status.
    pub status: MarketStatus,
    /// Running counter of protocol fees collected (taker + maker).
    pub accumulated_fees: u64,
    /// Running counter of integrator fees collected.
    pub accumulated_integrator_fees: u64,
    /// PDA bump for `[b"market", base_mint, quote_mint]`.
    pub bump: u8,
    /// Minimum price increment (quote units per base unit).
    pub tick_size: u64,
    /// Minimum quantity increment (base units).
    pub lot_size: u64,
    /// Minimum order quantity (base units).
    pub min_size: u64,
    /// Current epoch number.
    pub epoch: u64,
    /// Epoch start timestamp (unix millis).
    pub epoch_start_timestamp: u64,
    /// Epoch duration in milliseconds.
    pub epoch_duration: u64,
    /// Current epoch taker fee (bps).
    pub current_taker_fee_bps: u16,
    /// Current epoch maker fee (bps).
    pub current_maker_fee_bps: u16,
    /// Next epoch taker fee (bps), applied at epoch transition.
    pub next_taker_fee_bps: u16,
    /// Next epoch maker fee (bps), applied at epoch transition.
    pub next_maker_fee_bps: u16,
    /// Minimum quote stake required for fee discounts / governance.
    pub stake_required: u64,
    /// Minimum order quantity allowed in this market.
    pub min_order_size: u64,
    /// Maker rebate basis points for staked traders (subtracted from maker fee).
    pub maker_rebate_bps: u16,
    /// Base token decimals (SCPB/SFT order sizes are in base raw units).
    pub base_decimals: u8,
    /// Quote token decimals (prices and balances are in quote raw units).
    pub quote_decimals: u8,
    /// Padding for future expansion.
    pub _reserved: [u8; 4],
}

impl MarketState {
    /// On-chain size (discriminator + serialized fields; borsh has no padding).
    pub const SIZE: usize = 8
        + 32
        + 32
        + 32
        + 2
        + 2
        + 2
        + 1
        + 8
        + 8
        + 1
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 2
        + 2
        + 2
        + 2
        + 8
        + 8
        + 2
        + 1
        + 1
        + 4;

    pub fn is_active(&self) -> bool {
        self.status == MarketStatus::Active
    }

    pub fn in_epoch(&self, timestamp: u64) -> bool {
        timestamp >= self.epoch_start_timestamp
            && timestamp < self.epoch_start_timestamp + self.epoch_duration
    }

    pub fn advance_epoch(&mut self) -> Result<()> {
        let clock = Clock::get()?;
        let now = clock.unix_timestamp as u64;
        if now < self.epoch_start_timestamp + self.epoch_duration {
            return Ok(());
        }
        self.current_taker_fee_bps = self.next_taker_fee_bps;
        self.current_maker_fee_bps = self.next_maker_fee_bps;
        self.epoch_start_timestamp = now;
        self.epoch = self.epoch.checked_add(1).ok_or(MagiCLOBError::ArithmeticOverflow)?;
        Ok(())
    }
}

/// Returns the `MarketState` PDA for a mint pair.
pub fn market_pda(base_mint: &Pubkey, quote_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[MARKET_SEED, base_mint.as_ref(), quote_mint.as_ref()],
        &crate::ID,
    )
}
