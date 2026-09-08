// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Custom program errors for MagiCLOB.
//!
//! Error code ranges: anchor reserves `0x100`. Program codes start at `0x845A0000` via
//! `MagiCLOBError::ERROR_CODE_OFFSET` math handled by the `#[error_code]` macro.

use anchor_lang::prelude::*;

#[error_code]
pub enum MagiCLOBError {
    #[msg("Only the market authority may perform this action")]
    InvalidAuthority,
    #[msg("The market is not active")]
    MarketNotActive,
    #[msg("Order price must be greater than zero")]
    InvalidPrice,
    #[msg("Order quantity must be greater than zero")]
    InvalidQuantity,
    #[msg("Insufficient balance for the requested fill")]
    InsufficientBalance,
    #[msg("Order was not found on the specified side")]
    OrderNotFound,
    #[msg("The order book has reached its capacity")]
    BookCapacityReached,
    #[msg("Order owner does not match the trader account")]
    TraderAuthMismatch,
    #[msg("Fee basis points must be within 0..=10000")]
    InvalidFeeBps,
    #[msg("Arithmetic overflow while settling the match")]
    ArithmeticOverflow,
    #[msg("A maker trader account was not provided in remaining_accounts")]
    MakerAccountMissing,
    #[msg("An unexpected maker account was provided in remaining_accounts")]
    UnexpectedMakerAccount,
    #[msg("A maker trader account was provided more than once")]
    DuplicateMakerAccount,
    #[msg("Batch size exceeds the maximum supported length")]
    BatchTooLarge,
    #[msg("The trader account is already delegated")]
    AlreadyDelegated,
    #[msg("Order quantity must be a multiple of lot size")]
    InvalidLotSize,
    #[msg("Order quantity is below minimum size")]
    InvalidMinSize,
    #[msg("Order price must be a multiple of tick size")]
    InvalidTickSize,
    #[msg("Post-only order would cross the book")]
    PostOnlyWouldCross,
    #[msg("Fill-or-kill order cannot be fully filled")]
    FillOrKillNotFilled,
    #[msg("Post-only order would cross the book")]
    PostOnlyCrossesBook,
    #[msg("Fill-or-kill order cannot be fully filled")]
    FOKOrderCannotBeFullyFilled,
    #[msg("Self-trade prevention cancelled the taker")]
    SelfTradeCancelTaker,
    #[msg("Self-trade prevention cancelled the maker")]
    SelfTradeCancelMaker,
    #[msg("Order has expired")]
    OrderExpired,
    #[msg("New quantity must be less than original quantity")]
    InvalidModifyQuantity,
    #[msg("New quantity must be greater than filled quantity")]
    InvalidModifyFilled,
    #[msg("Order price cannot be changed without losing queue priority")]
    InvalidModifyPrice,
    #[msg("Flash loan was not repaid")]
    FlashLoanNotRepaid,
    #[msg("Invalid flash loan asset type")]
    InvalidFlashLoanAsset,
    #[msg("Flash loan borrower mismatch")]
    FlashLoanInvalidBorrower,
    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientVaultBalance,
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,
    #[msg("Mint mismatch between market and token account")]
    MintMismatch,
    #[msg("Governance proposal not active")]
    ProposalNotActive,
    #[msg("Governance proposal already ended")]
    ProposalEnded,
    #[msg("Insufficient stake for governance action")]
    InsufficientStake,
    #[msg("Session key is not approved")]
    InvalidSessionKey,
    #[msg("Crank authority mismatch")]
    CrankAuthorityMismatch,
    #[msg("Pool already exists")]
    PoolAlreadyExists,
    #[msg("Permission denied for this group")]
    PermissionDenied,
    #[msg("Trader has no active stake")]
    NoStake,
    #[msg("Stake epoch lockup has not yet passed")]
    StakeLockupNotPassed,
    #[msg("Trader is already staked")]
    AlreadyStaked,
    #[msg("Stake amount is below the minimum")]
    StakeBelowMinimum,
    #[msg("Stake amount exceeds available balance")]
    StakeExceedsBalance,
    #[msg("Proposal status does not allow this action")]
    InvalidProposalStatus,
    #[msg("Voter has already voted on this proposal")]
    AlreadyVoted,
    #[msg("Vote weight is zero")]
    ZeroVoteWeight,
    #[msg("Proposal has not reached its end epoch")]
    ProposalNotEnded,
    #[msg("Proposal did not pass")]
    ProposalNotPassed,
    #[msg("Proposal quorum not reached")]
    QuorumNotReached,
    #[msg("No rebates available to claim")]
    NoRebatesAvailable,
}