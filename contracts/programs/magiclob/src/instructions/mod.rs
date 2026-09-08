// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Instruction handlers for MagiCLOB.
//!
//! The set of reference implementation:
//!
//! * `initialize_market`        - create `MarketState` + `OrderBookState` PDAs.
//! * `register_trader`          - create a `TraderState` for `(market, owner)`.
//! * `delegate_trader_session`  - ER: delegate trader + book to an Ephemeral Rollup.
//! * `place_limit_order`        - limit order with price-time priority matching.
//! * `place_market_order`       - aggressive sweep, no resting.
//! * `cancel_order`             - remove a resting order by client id.
//! * `bulk_batch_orders`        - atomic batch of limit/market orders.
//! * `settle_and_undelegate`    - ER: commit + undelegate a finished session.
//! * `deposit`                  - deposit SPL tokens into pool vault.
//! * `withdraw`                 - withdraw SPL tokens from pool vault.
//! * `initialize_vault_accounts` - lazily create the vault's SPL token accounts.
//! * `modify_order`             - modify resting order quantity/price.
//! * `stake`                    - lock quote tokens into a StakeInfo PDA.
//! * `unstake`                  - release stake after epoch lockup.
//! * `claim_rebates`            - claim maker rebates for low-liquidity epochs.
//! * `submit_proposal`          - create a fee-change Proposal PDA.
//! * `vote`                     - vote for/against a proposal.
//! * `execute_proposal`         - apply winning proposal's fee changes.
//! * `borrow_flashloan_base`    - borrow base from vault via flash loan.
//! * `borrow_flashloan_quote`   - borrow quote from vault via flash loan.
//! * `return_flashloan_base`    - repay base flash loan + fee.
//! * `return_flashloan_quote`   - repay quote flash loan + fee.

pub mod bulk_batch_orders;
pub mod cancel_order;
pub mod delegate_trader_session;
pub mod deposit;
pub mod flash_loan;
pub mod initialize_market;
pub mod initialize_vault_accounts;
pub mod modify_order;
pub mod place_limit_order;
pub mod place_market_order;
pub mod settle_and_undelegate;
pub mod withdraw;
pub mod stake;
pub mod governance;

pub use bulk_batch_orders::handle as bulk_batch_orders;
pub use delegate_trader_session::{DelegateTraderSession, handle as delegate_trader_session};
pub use deposit::{Deposit, deposit};
pub use flash_loan::{
    BorrowFlashLoanBase, BorrowFlashLoanQuote, ReturnFlashLoanBase, ReturnFlashLoanQuote,
    borrow_flashloan_base, borrow_flashloan_quote, return_flashloan_base, return_flashloan_quote,
};
pub use initialize_market::{InitializeMarket, RegisterTrader, handle_initialize, handle_register};
pub use initialize_vault_accounts::{InitializeVaultAccounts, handle as initialize_vault_accounts};
pub use modify_order::{ModifyOrder, handle as modify_order};
pub use place_limit_order::{PlaceLimitOrder, handle as place_limit_order};
pub use settle_and_undelegate::{SettleAndUndelegate, handle as settle_and_undelegate};
pub use withdraw::{Withdraw, withdraw};
pub use stake::{Stake, Unstake, ClaimRebates, stake, unstake, claim_rebates};
pub use governance::{
    SubmitProposal, Vote, ExecuteProposal,
    submit_proposal, vote, execute_proposal,
};

use crate::engine::order_types::MatchReport;
use crate::engine::order_types::OrderSide;
use crate::engine::MakerDeltas;
use crate::errors::MagiCLOBError;
use crate::state::market::MarketState;
use crate::state::trader::TraderState;
use anchor_lang::prelude::*;

/// Guard shared by every trading instruction.
pub(crate) fn ensure_active(market: &MarketState) -> Result<()> {
    if !market.is_active() {
        return err!(MagiCLOBError::MarketNotActive);
    }
    Ok(())
}

/// Vault-style settlement: commits the taker delta and all maker deltas to their
/// respective `TraderState` accounts atomically.
pub(crate) fn settle<'info>(
    market: &Pubkey,
    taker: &mut TraderState,
    taker_delta: crate::engine::matcher::TakerDelta,
    deltas: &MakerDeltas,
    remaining_accounts: &'info [AccountInfo<'info>],
) -> Result<()> {
    crate::engine::matcher::settle(market, taker, taker_delta, deltas, remaining_accounts)
}

/// Emitted when a resting order is accepted onto the book.
#[event]
pub struct OrderPlaced {
    pub market: Pubkey,
    pub order_id: u64,
    pub side: OrderSide,
    pub price: u64,
    pub qty: u64,
    pub owner: Pubkey,
}

/// Emitted after a match executes (taker or batch element).
#[event]
pub struct OrderFilled {
    pub market: Pubkey,
    pub report: MatchReport,
}

/// Emitted when a resting order is cancelled.
#[event]
pub struct OrderCancelled {
    pub market: Pubkey,
    pub client_order_id: u64,
    pub side: OrderSide,
    pub price: u64,
    pub qty_remaining: u64,
    pub owner: Pubkey,
}

/// Emitted at session settlement (pre-undelegation state summary).
#[event]
pub struct SessionSettled {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub best_bid: Option<u64>,
    pub best_ask: Option<u64>,
    pub bid_depth: u64,
    pub ask_depth: u64,
    pub accumulated_fees: u64,
}

/// Emitted on deposit into the pool vault.
#[event]
pub struct DepositEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub base_amount: u64,
    pub quote_amount: u64,
}

/// Emitted on withdrawal from the pool vault.
#[event]
pub struct WithdrawEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub base_amount: u64,
    pub quote_amount: u64,
}

/// Emitted when an order is modified.
#[event]
pub struct OrderModified {
    pub market: Pubkey,
    pub order_id: u64,
    pub client_order_id: u64,
    pub side: OrderSide,
    pub price: u64,
    pub previous_quantity: u64,
    pub new_quantity: u64,
    pub owner: Pubkey,
}

/// Emitted on flash loan borrow.
#[event]
pub struct FlashLoanEvent {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub asset: u8,
    pub amount: u64,
    pub fee: u64,
}
