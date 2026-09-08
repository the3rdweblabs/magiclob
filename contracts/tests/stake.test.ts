// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// stake - stake/unstake/claim_rebates. Documents that unstake requires
// market.epoch to advance (which nothing in the program does), so the epoch
// advance is simulated by patching the MarketState account.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  fetchTrader,
  fetchStakeInfo,
  fetchVault,
  fetchMarket,
  stakePda,
  tokenBalanceOf,
  patchAccountU64,
  MARKET_EPOCH_OFFSET,
  bn,
  num,
  TOKEN_PROGRAM_ID,
  SystemProgram,
  expectRevertWith,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

describe("stake", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let t: TraderFixture;

  before(async () => {
    ctx = await bootMagiclob();
    f = await initMarket({ stakeRequired: 100 });
    t = await registerTrader(f, { quoteEndowment: 1_000, quoteTokens: 1_000 });
  });

  async function stake(x: TraderFixture, amount: number | bigint) {
    const [stakeInfo] = stakePda(f.market, x.keypair.publicKey);
    await ctx.program.methods
      .stake(bn(amount))
      .accountsPartial({
        authority: x.keypair.publicKey,
        market: f.market,
        stakeInfo,
        trader: x.trader,
        tokenAccount: x.quoteAta,
        vaultAccount: f.vaultQuote,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([x.keypair])
      .rpc();
    return stakeInfo;
  }

  async function unstake(x: TraderFixture) {
    const [stakeInfo] = stakePda(f.market, x.keypair.publicKey);
    await ctx.program.methods
      .unstake()
      .accountsPartial({
        authority: x.keypair.publicKey,
        market: f.market,
        stakeInfo,
        trader: x.trader,
        tokenAccount: x.quoteAta,
        vaultAccount: f.vaultQuote,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([x.keypair])
      .rpc();
    return stakeInfo;
  }

  it("stakes real quote tokens into the vault and the ledger", async () => {
    const stakeInfo = await stake(t, 100);

    const si = await fetchStakeInfo(stakeInfo);
    expect(si.active).to.be.true;
    expect(num(si.amount)).to.equal(100);
    expect(num(si.epochActivated)).to.equal(0);

    const st = await fetchTrader(t.trader);
    expect(num(st.quoteBalance)).to.equal(1_000 - 100);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(100n);
    expect(await tokenBalanceOf(t.quoteAta)).to.equal(900n);
  });

  it("stacks additional stakes", async () => {
    await stake(t, 100);
    const [si] = stakePda(f.market, t.keypair.publicKey);
    const info = await fetchStakeInfo(si);
    expect(num(info.amount)).to.equal(200);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(200n);
    const st = await fetchTrader(t.trader);
    expect(num(st.quoteBalance)).to.equal(1_000 - 200);
  });

  it("rejects a stake below the minimum", async () => {
    await expectRevertWith(stake(t, 1), "Stake amount is below the minimum");
  });

  it("rejects a zero stake", async () => {
    await expectRevertWith(
      stake(t, 0),
      "Order quantity must be greater than zero"
    );
  });

  it("rejects a stake larger than the trader's quote balance", async () => {
    await expectRevertWith(stake(t, 9_999), "Insufficient balance for the requested fill");
  });

  it("rejects unstake before the epoch lockup passes (epoch never advances)", async () => {
    await expectRevertWith(unstake(t), "Stake epoch lockup has not yet passed");
  });

  it("unstakes after the epoch advances (simulated epoch bump)", async () => {
    await patchAccountU64(f.market, MARKET_EPOCH_OFFSET, 1);
    const market = await fetchMarket(f.market);
    expect(num(market.epoch)).to.equal(1);

    await unstake(t);

    const [si] = stakePda(f.market, t.keypair.publicKey);
    const info = await fetchStakeInfo(si);
    expect(info.active).to.be.false;
    expect(num(info.amount)).to.equal(0);

    const st = await fetchTrader(t.trader);
    expect(num(st.quoteBalance)).to.equal(1_000);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(0n);
    expect(await tokenBalanceOf(t.quoteAta)).to.equal(1_000n);
  });

  it("rejects unstaking an already-inactive stake", async () => {
    await expectRevertWith(unstake(t), "Trader has no active stake");
  });

  it("claims no rebates while maker_rebate_bps is zero", async () => {
    await stake(t, 100);
    const [si] = stakePda(f.market, t.keypair.publicKey);
    await expectRevertWith(
      ctx.program.methods
        .claimRebates()
        .accountsPartial({
          authority: t.keypair.publicKey,
          market: f.market,
          stakeInfo: si,
          trader: t.trader,
          tokenAccount: t.quoteAta,
          vaultAccount: f.vaultQuote,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([t.keypair])
        .rpc(),
      "No rebates available to claim"
    );
  });

  it("reflects staked funds on the vault and trader snapshots", async () => {
    const [siPos] = stakePda(f.market, t.keypair.publicKey);
    const info = await fetchStakeInfo(siPos);
    expect(num(info.amount)).to.equal(100);
    const v = await fetchVault(f.vault);
    expect(num(v.vaultQuoteBalance)).to.equal(0); // ledger is not touched by staking
  });
});