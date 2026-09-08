// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// governance - submit_proposal, vote, execute_proposal. Execution eligibility
// uses wall-clock `end_epoch`; voting uses `market.epoch` (kept at 0 unless the
// market somehow advances), so proposals are submitted with start_epoch 0.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  fetchProposal,
  fetchMarket,
  proposalPda,
  stakePda,
  timeTravel,
  bn,
  num,
  TOKEN_PROGRAM_ID,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  expectRevertWith,
  expectRejected,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

const NOW = Math.floor(Date.now() / 1000);

describe("governance", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let proposer: TraderFixture;
  let voter: TraderFixture;

  const proposalOf = (id: number) => proposalPda(f.market, id)[0];

  async function submit(
    who: TraderFixture,
    id: number,
    takerFeeBps: number,
    makerFeeBps: number,
    start: number,
    end: number
  ) {
    const [stakeInfo] = stakePda(f.market, who.keypair.publicKey);
    await ctx.program.methods
      .submitProposal(bn(id), bn(takerFeeBps), bn(makerFeeBps), bn(start), bn(end))
      .accountsPartial({
        proposer: who.keypair.publicKey,
        market: f.market,
        proposal: proposalOf(id),
        stakeInfo,
        systemProgram: SystemProgram.programId,
      })
      .signers([who.keypair])
      .rpc();
  }

  async function vote(who: TraderFixture, proposal: any, voteFor: boolean) {
    const [stakeInfo] = stakePda(f.market, who.keypair.publicKey);
    await ctx.program.methods
      .vote(voteFor)
      .accountsPartial({
        voter: who.keypair.publicKey,
        market: f.market,
        proposal,
        stakeInfo,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .signers([who.keypair])
      .rpc();
  }

  async function execute(proposal: any) {
    await ctx.program.methods
      .executeProposal()
      .accountsPartial({
        authority: proposer.keypair.publicKey,
        market: f.market,
        proposal,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .signers([proposer.keypair])
      .rpc();
  }

  before(async () => {
    ctx = await bootMagiclob();
    f = await initMarket({ stakeRequired: 100 });
    proposer = await registerTrader(f, { quoteEndowment: 1_000, quoteTokens: 1_000 });
    voter = await registerTrader(f, { quoteEndowment: 1_000, quoteTokens: 1_000 });

    for (const who of [proposer, voter]) {
      const [stakeInfo] = stakePda(f.market, who.keypair.publicKey);
      await ctx.program.methods
        .stake(bn(150))
        .accountsPartial({
          authority: who.keypair.publicKey,
          market: f.market,
          stakeInfo,
          trader: who.trader,
          tokenAccount: who.quoteAta,
          vaultAccount: f.vaultQuote,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([who.keypair])
        .rpc();
    }
  });

  it("submits an active proposal with the requested fees", async () => {
    await submit(proposer, 1, 12, 3, 0, NOW + 3600);
    const p = await fetchProposal(proposalOf(1));
    expect(num(p.id)).to.equal(1);
    expect(p.market.toString()).to.equal(f.market.toString());
    expect(num(p.takerFeeBps)).to.equal(12);
    expect(num(p.makerFeeBps)).to.equal(3);
    expect(num(p.votesFor)).to.equal(0);
    expect(num(p.votesAgainst)).to.equal(0);
    expect(num(p.startEpoch)).to.equal(0);
    expect(p.status).to.deep.equal({ active: {} });
  });

  it("votes with stake-weighted power", async () => {
    await vote(voter, proposalOf(1), true);
    const p = await fetchProposal(proposalOf(1));
    expect(num(p.votesFor)).to.equal(150);
  });

  it("does not enforce a once-per-proposal vote (documented lacuna)", async () => {
    await vote(voter, proposalOf(1), true);
    const p = await fetchProposal(proposalOf(1));
    expect(num(p.votesFor)).to.equal(300);
  });

  it("rejects votes outside the proposal epoch window", async () => {
    await submit(proposer, 2, 1, 0, 50, 100);
    await expectRevertWith(vote(voter, proposalOf(2), true), "already ended");
  });

  it("rejects fee params above MAX_FEE_BPS", async () => {
    await expectRevertWith(
      submit(proposer, 3, 10_001, 0, 0, NOW + 3600),
      "Fee basis points must be within 0..=10000"
    );
  });

  it("rejects a proposal whose end is not after its start", async () => {
    await expectRevertWith(
      submit(proposer, 4, 10, 0, 50, 50),
      "Order price must be greater than zero"
    );
  });

  it("rejects submission without an active stake", async () => {
    const bystander = await registerTrader(f, { quoteEndowment: 10 });
    const [stakeInfo] = stakePda(f.market, bystander.keypair.publicKey);
    await expectRejected(
      ctx.program.methods
        .submitProposal(bn(99), bn(5), bn(0), bn(0), bn(NOW + 3600))
        .accountsPartial({
          proposer: bystander.keypair.publicKey,
          market: f.market,
          proposal: proposalOf(99),
          stakeInfo,
          systemProgram: SystemProgram.programId,
        })
        .signers([bystander.keypair])
        .rpc()
    );
  });

  it("executes only after a simple-majority vote", async () => {
    await submit(proposer, 5, 7, 1, 0, NOW + 3600);
    await expectRejected(execute(proposalOf(5))); // 0 for / 0 against

    await vote(voter, proposalOf(5), false);
    await expectRevertWith(execute(proposalOf(5)), "did not pass");
  });

  it("applies the winning fees after a majority vote", async () => {
    await execute(proposalOf(1));

    const market = await fetchMarket(f.market);
    expect(num(market.nextTakerFeeBps)).to.equal(12);
    expect(num(market.nextMakerFeeBps)).to.equal(3);
    const p = await fetchProposal(proposalOf(1));
    expect(p.status).to.deep.equal({ executed: {} });
  });

  it("rejects re-executing an executed proposal", async () => {
    await expectRevertWith(execute(proposalOf(1)), "does not allow this action");
  });

  it("rejects execution past the deadline", async () => {
    await submit(proposer, 6, 4, 0, 0, NOW + 3600);
    await vote(voter, proposalOf(6), true);
    await timeTravel({ absoluteTimestamp: NOW + 7200 });
    await expectRevertWith(execute(proposalOf(6)), "has not reached its end epoch");
  });
});