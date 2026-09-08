// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Governance instructions: submit_proposal, vote, execute_proposal.

use crate::errors::MagiCLOBError;
use crate::fees::MAX_FEE_BPS;
use crate::state::*;
use anchor_lang::prelude::*;

/// Submit a new fee-change governance proposal.
#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct SubmitProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, MarketState>,
    #[account(
        init,
        payer = proposer,
        seeds = [PROPOSAL_SEED, market.key().as_ref(), &proposal_id.to_le_bytes()],
        bump,
        space = Proposal::SIZE
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(
        seeds = [STAKE_SEED, market.key().as_ref(), proposer.key().as_ref()],
        bump = stake_info.bump,
        constraint = stake_info.market == market.key() @ MagiCLOBError::InvalidAuthority,
        constraint = stake_info.owner == proposer.key() @ MagiCLOBError::TraderAuthMismatch,
        constraint = stake_info.active @ MagiCLOBError::NoStake
    )]
    pub stake_info: Account<'info, StakeInfo>,
    pub system_program: Program<'info, System>,
}

pub fn submit_proposal(
    ctx: Context<SubmitProposal>,
    proposal_id: u64,
    taker_fee_bps: u16,
    maker_fee_bps: u16,
    start_epoch: u64,
    end_epoch: u64,
) -> Result<()> {
    let market = &ctx.accounts.market;
    crate::instructions::ensure_active(market)?;

    if taker_fee_bps > MAX_FEE_BPS || maker_fee_bps > MAX_FEE_BPS {
        return err!(MagiCLOBError::InvalidFeeBps);
    }
    if end_epoch <= start_epoch {
        return err!(MagiCLOBError::InvalidPrice);
    }
    if ctx.accounts.stake_info.amount < market.stake_required {
        return err!(MagiCLOBError::InsufficientStake);
    }

    let proposal = &mut ctx.accounts.proposal;
    proposal.id = proposal_id;
    proposal.market = market.key();
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.taker_fee_bps = taker_fee_bps;
    proposal.maker_fee_bps = maker_fee_bps;
    proposal.votes_for = 0;
    proposal.votes_against = 0;
    proposal.start_epoch = start_epoch;
    proposal.end_epoch = end_epoch;
    proposal.status = ProposalStatus::Active;
    proposal.bump = ctx.bumps.proposal;

    emit!(ProposalSubmittedEvent {
        market: market.key(),
        proposal_id,
        proposer: ctx.accounts.proposer.key(),
        taker_fee_bps,
        maker_fee_bps,
    });

    Ok(())
}

/// Vote for or against an active proposal.
#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, MarketState>,
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, market.key().as_ref(), &proposal.id.to_le_bytes()],
        bump = proposal.bump,
        constraint = proposal.market == market.key() @ MagiCLOBError::InvalidAuthority,
        constraint = proposal.status == ProposalStatus::Active @ MagiCLOBError::ProposalNotActive
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(
        mut,
        seeds = [STAKE_SEED, market.key().as_ref(), voter.key().as_ref()],
        bump = stake_info.bump,
        constraint = stake_info.market == market.key() @ MagiCLOBError::InvalidAuthority,
        constraint = stake_info.owner == voter.key() @ MagiCLOBError::TraderAuthMismatch,
        constraint = stake_info.active @ MagiCLOBError::NoStake
    )]
    pub stake_info: Account<'info, StakeInfo>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn vote(ctx: Context<Vote>, vote_for: bool) -> Result<()> {
    let market = &ctx.accounts.market;
    let proposal = &mut ctx.accounts.proposal;
    let current_epoch = market.epoch;

    if current_epoch < proposal.start_epoch || current_epoch > proposal.end_epoch {
        return err!(MagiCLOBError::ProposalEnded);
    }

    let weight = ctx.accounts.stake_info.amount;
    if weight == 0 {
        return err!(MagiCLOBError::ZeroVoteWeight);
    }

    if vote_for {
        proposal.votes_for = proposal
            .votes_for
            .checked_add(weight)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    } else {
        proposal.votes_against = proposal
            .votes_against
            .checked_add(weight)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    }

    emit!(VoteEvent {
        market: market.key(),
        proposal_id: proposal.id,
        voter: ctx.accounts.voter.key(),
        weight,
        vote_for,
    });

    Ok(())
}

/// Execute a passed proposal to apply fee changes.
#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, MarketState>,
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, market.key().as_ref(), &proposal.id.to_le_bytes()],
        bump = proposal.bump,
        constraint = proposal.market == market.key() @ MagiCLOBError::InvalidAuthority
    )]
    pub proposal: Account<'info, Proposal>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let proposal = &mut ctx.accounts.proposal;
    let clock = Clock::get()?;

    let proposal_id = proposal.id;
    let taker_fee_bps = proposal.taker_fee_bps;
    let maker_fee_bps = proposal.maker_fee_bps;

    if proposal.status == ProposalStatus::Executed {
        return err!(MagiCLOBError::InvalidProposalStatus);
    }
    if clock.unix_timestamp as u64 > proposal.end_epoch {
        return err!(MagiCLOBError::ProposalNotEnded);
    }
    if proposal.votes_for <= proposal.votes_against {
        return err!(MagiCLOBError::ProposalNotPassed);
    }

    market.next_taker_fee_bps = taker_fee_bps;
    market.next_maker_fee_bps = maker_fee_bps;

    proposal.status = ProposalStatus::Executed;

    emit!(ProposalExecutedEvent {
        market: market.key(),
        proposal_id,
        taker_fee_bps,
        maker_fee_bps,
    });

    Ok(())
}

#[event]
pub struct ProposalSubmittedEvent {
    pub market: Pubkey,
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub taker_fee_bps: u16,
    pub maker_fee_bps: u16,
}

#[event]
pub struct VoteEvent {
    pub market: Pubkey,
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub weight: u64,
    pub vote_for: bool,
}

#[event]
pub struct ProposalExecutedEvent {
    pub market: Pubkey,
    pub proposal_id: u64,
    pub taker_fee_bps: u16,
    pub maker_fee_bps: u16,
}
