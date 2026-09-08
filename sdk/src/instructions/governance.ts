// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Governance instructions: `submit_proposal`, `vote`, `execute_proposal`.
 *
 * Proposals let staked traders vote on fee changes for a market. A proposer
 * must hold a minimum stake; voters are weighted by their stake amount.
 * Proposals transition through Pending → Active → Passed/Rejected → Executed.
 *
 * Base layer only.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  MAGICLOB_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../constants";
import {
  marketPda,
  proposalPda,
  stakePda,
} from "../pda";
import type { SubmitProposalParams, VoteParams, ExecuteProposalParams } from "../types";
import {
  DISCRIMINATORS,
  buildIx,
  ixData,
  mut,
  mutSigner,
  ro,
} from "./shared";

const CLOCK_SYSVAR = new PublicKey("SysvarC1ock11111111111111111111111111111111");

/** Build a `submit_proposal` instruction. */
export function createSubmitProposalInstruction(
  params: SubmitProposalParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, proposer, proposalId, takerFeeBps, makerFeeBps, startEpoch, endEpoch } = params;

  const data = ixData(DISCRIMINATORS.submit_proposal)
    .u64(proposalId)
    .u16(takerFeeBps)
    .u16(makerFeeBps)
    .u64(startEpoch)
    .u64(endEpoch)
    .toBuffer();

  return buildIx(
    [
      mutSigner(proposer),
      mut(market),
      mut(proposalPda(market, proposalId, programId).address),
      ro(stakePda(market, proposer, programId).address),
    ],
    data,
    programId
  );
}

/** Build a `vote` instruction. */
export function createVoteInstruction(
  params: VoteParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, voter, proposalId, voteFor } = params;

  const data = ixData(DISCRIMINATORS.vote)
    .bool(voteFor)
    .toBuffer();

  return buildIx(
    [
      mutSigner(voter),
      mut(market),
      mut(proposalPda(market, proposalId, programId).address),
      mut(stakePda(market, voter, programId).address),
      ro(CLOCK_SYSVAR),
    ],
    data,
    programId
  );
}

/** Build an `execute_proposal` instruction. */
export function createExecuteProposalInstruction(
  params: ExecuteProposalParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, authority, proposalId } = params;

  return buildIx(
    [
      mutSigner(authority),
      mut(market),
      mut(proposalPda(market, proposalId, programId).address),
      ro(CLOCK_SYSVAR),
    ],
    ixData(DISCRIMINATORS.execute_proposal).toBuffer(),
    programId
  );
}
