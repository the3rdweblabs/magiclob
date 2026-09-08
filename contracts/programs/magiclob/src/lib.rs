// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! MagiCLOB - a price-time priority CLOB engine for Magicblock Ephemeral Rollups.

pub mod engine;
pub mod errors;
pub mod fees;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

declare_id!("DSMktdhdDAGgittEg88wqrh2AJmNq6oj2YDnNnmeKeQe");

use crate::instructions::delegate_trader_session::__client_accounts_delegate_trader_session;
use crate::instructions::deposit::__client_accounts_deposit;
use crate::instructions::flash_loan::__client_accounts_borrow_flash_loan_base;
use crate::instructions::flash_loan::__client_accounts_borrow_flash_loan_quote;
use crate::instructions::flash_loan::__client_accounts_return_flash_loan_base;
use crate::instructions::flash_loan::__client_accounts_return_flash_loan_quote;
use crate::instructions::initialize_market::__client_accounts_initialize_market;
use crate::instructions::initialize_market::__client_accounts_register_trader;
use crate::instructions::initialize_vault_accounts::__client_accounts_initialize_vault_accounts;
use crate::instructions::modify_order::__client_accounts_modify_order;
use crate::instructions::place_limit_order::__client_accounts_place_limit_order;
use crate::instructions::settle_and_undelegate::__client_accounts_settle_and_undelegate;
use crate::instructions::stake::__client_accounts_stake;
use crate::instructions::stake::__client_accounts_unstake;
use crate::instructions::stake::__client_accounts_claim_rebates;
use crate::instructions::governance::__client_accounts_submit_proposal;
use crate::instructions::governance::__client_accounts_vote;
use crate::instructions::governance::__client_accounts_execute_proposal;
use crate::instructions::withdraw::__client_accounts_withdraw;
pub use crate::instructions::{
    BorrowFlashLoanBase, BorrowFlashLoanQuote, DelegateTraderSession, Deposit, FlashLoanEvent,
    InitializeMarket, ModifyOrder, PlaceLimitOrder, RegisterTrader, ReturnFlashLoanBase,
    ReturnFlashLoanQuote, SettleAndUndelegate, Stake, Unstake, ClaimRebates,
    SubmitProposal, Vote, ExecuteProposal,
    Withdraw,
    InitializeVaultAccounts,
};
pub use crate::state::flash_loan::FlashLoan;

#[ephemeral]
#[program]
pub mod magiclob {
    use super::*;

    /// Create `MarketState` + `OrderBookState` + `VaultState` PDAs.
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        taker_fee_bps: u16,
        maker_fee_bps: u16,
        integrator_fee_bps_cap: u16,
        tick_size: u64,
        lot_size: u64,
        min_size: u64,
        stake_required: u64,
    ) -> Result<()> {
        instructions::initialize_market::handle_initialize(
            ctx,
            taker_fee_bps,
            maker_fee_bps,
            integrator_fee_bps_cap,
            tick_size,
            lot_size,
            min_size,
            stake_required,
        )
    }

    /// Create a `TraderState` for `(market, owner)`.
    pub fn register_trader(
        ctx: Context<RegisterTrader>,
        base_endowment: u64,
        quote_endowment: u64,
    ) -> Result<()> {
        instructions::initialize_market::handle_register(ctx, base_endowment, quote_endowment)
    }

    /// Deposit SPL tokens into the pool vault.
    pub fn deposit(ctx: Context<Deposit>, base_amount: u64, quote_amount: u64) -> Result<()> {
        instructions::deposit::deposit(ctx, base_amount, quote_amount)
    }

    /// Withdraw SPL tokens from the pool vault.
    pub fn withdraw(ctx: Context<Withdraw>, base_amount: u64, quote_amount: u64) -> Result<()> {
        instructions::withdraw::withdraw(ctx, base_amount, quote_amount)
    }

    /// Lazily create the vault's SPL base/quote token accounts (idempotent).
    pub fn initialize_vault_accounts(
        ctx: Context<InitializeVaultAccounts>,
    ) -> Result<()> {
        instructions::initialize_vault_accounts::handle(ctx)
    }

    /// ER: delegate the trader + order book to an Ephemeral Rollup session.
    pub fn delegate_trader_session(ctx: Context<DelegateTraderSession>) -> Result<()> {
        instructions::delegate_trader_session::handle(ctx)
    }

    /// Place a limit order with time-in-force and self-trade prevention.
    pub fn place_limit_order(
        ctx: Context<PlaceLimitOrder>,
        price: u64,
        qty: u64,
        client_order_id: u64,
        is_bid: bool,
        integrator_fee_bps: u16,
        time_in_force: u8,
        self_matching_option: u8,
        expire_timestamp: u64,
    ) -> Result<()> {
        instructions::place_limit_order::handle(
            ctx,
            price,
            qty,
            client_order_id,
            is_bid,
            integrator_fee_bps,
            time_in_force,
            self_matching_option,
            expire_timestamp,
        )
    }

    /// Sweep the opposite side until filled or the book is exhausted.
    pub fn place_market_order(
        ctx: Context<PlaceLimitOrder>,
        qty: u64,
        client_order_id: u64,
        is_bid: bool,
        integrator_fee_bps: u16,
        self_matching_option: u8,
    ) -> Result<()> {
        instructions::place_market_order::handle(
            ctx,
            qty,
            client_order_id,
            is_bid,
            integrator_fee_bps,
            self_matching_option,
        )
    }

    /// Remove a resting order by owner + client order id.
    pub fn cancel_order(
        ctx: Context<PlaceLimitOrder>,
        is_bid: bool,
        client_order_id: u64,
    ) -> Result<()> {
        instructions::cancel_order::handle(ctx, is_bid, client_order_id)
    }

    /// Modify a resting order's quantity/price.
    pub fn modify_order(
        ctx: Context<ModifyOrder>,
        client_order_id: u64,
        is_bid: bool,
        new_quantity: u64,
        new_price: u64,
    ) -> Result<()> {
        instructions::modify_order::handle(ctx, client_order_id, is_bid, new_quantity, new_price)
    }

    /// Atomic batch of limit/market orders.
    pub fn bulk_batch_orders(
        ctx: Context<PlaceLimitOrder>,
        orders: Vec<crate::engine::order_types::OrderArgs>,
    ) -> Result<()> {
        instructions::bulk_batch_orders::handle(ctx, orders)
    }

    /// ER: commit the session state and undelegate (release the Delegation lock).
    pub fn settle_and_undelegate<'a>(
        ctx: Context<'a, SettleAndUndelegate<'a>>,
    ) -> Result<()> {
        instructions::settle_and_undelegate::handle(ctx)
    }

    /// Lock quote tokens into a StakeInfo PDA for fee discounts and governance.
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        instructions::stake::stake(ctx, amount)
    }

    /// Release staked tokens after the epoch lockup period.
    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        instructions::stake::unstake(ctx)
    }

    /// Claim maker rebates for providing liquidity during low-fee epochs.
    pub fn claim_rebates(ctx: Context<ClaimRebates>) -> Result<()> {
        instructions::stake::claim_rebates(ctx)
    }

    /// Submit a governance proposal to change market fees.
    pub fn submit_proposal(
        ctx: Context<SubmitProposal>,
        proposal_id: u64,
        taker_fee_bps: u16,
        maker_fee_bps: u16,
        start_epoch: u64,
        end_epoch: u64,
    ) -> Result<()> {
        instructions::governance::submit_proposal(
            ctx, proposal_id, taker_fee_bps, maker_fee_bps, start_epoch, end_epoch,
        )
    }

    /// Vote for or against an active proposal.
    pub fn vote(ctx: Context<Vote>, vote_for: bool) -> Result<()> {
        instructions::governance::vote(ctx, vote_for)
    }

    /// Execute a passed proposal to apply fee changes.
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        instructions::governance::execute_proposal(ctx)
    }

    /// Borrow base tokens from the vault via flash loan.
    pub fn borrow_flashloan_base(
        ctx: Context<BorrowFlashLoanBase>,
        amount: u64,
    ) -> Result<()> {
        instructions::flash_loan::borrow_flashloan_base(ctx, amount)
    }

    /// Borrow quote tokens from the vault via flash loan.
    pub fn borrow_flashloan_quote(
        ctx: Context<BorrowFlashLoanQuote>,
        amount: u64,
    ) -> Result<()> {
        instructions::flash_loan::borrow_flashloan_quote(ctx, amount)
    }

    /// Repay a base flash loan (principal + fee).
    pub fn return_flashloan_base(
        ctx: Context<ReturnFlashLoanBase>,
        amount: u64,
    ) -> Result<()> {
        instructions::flash_loan::return_flashloan_base(ctx, amount)
    }

    /// Repay a quote flash loan (principal + fee).
    pub fn return_flashloan_quote(
        ctx: Context<ReturnFlashLoanQuote>,
        amount: u64,
    ) -> Result<()> {
        instructions::flash_loan::return_flashloan_quote(ctx, amount)
    }
}
