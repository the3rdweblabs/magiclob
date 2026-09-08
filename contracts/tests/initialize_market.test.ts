// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// initialize_market - PDA derivation, config persistence, param validation,
// duplicate-init protection, and trader registration.

import {
  bootMagiclob,
  initMarket,
  fetchMarket,
  fetchTrader,
  createMintAccount,
  marketPda,
  orderBookPda,
  vaultPda,
  vaultTokenPda,
  traderPda,
  bn,
  num,
  TOKEN_PROGRAM_ID,
  expectRevertWith,
} from "./helpers";
import { Keypair } from "@solana/web3.js";
import { expect } from "chai";

describe("initialize_market", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: Awaited<ReturnType<typeof initMarket>>;

  before(async () => {
    ctx = await bootMagiclob();
  });

  it("derives deterministic PDAs from seeds", async () => {
    f = await initMarket({ tickSize: 10, lotSize: 5, minSize: 10, stakeRequired: 42 });
    const [m0] = marketPda(f.baseMint, f.quoteMint);
    const [ob0] = orderBookPda(f.market);
    const [v0] = vaultPda(f.market);
    expect(m0.toString()).to.equal(f.market.toString());
    expect(ob0.toString()).to.equal(f.orderBook.toString());
    expect(v0.toString()).to.equal(f.vault.toString());
    expect((await fetchMarket(f.market)).bump).to.be.above(0);
  });

  it("persists the configured parameters", async () => {
    const m = await fetchMarket(f.market);
    expect(num(m.takerFeeBps)).to.equal(5);
    expect(num(m.makerFeeBps)).to.equal(0);
    expect(num(m.integratorFeeBpsCap)).to.equal(100);
    expect(num(m.tickSize)).to.equal(10);
    expect(num(m.lotSize)).to.equal(5);
    expect(num(m.minSize)).to.equal(10);
    expect(num(m.stakeRequired)).to.equal(42);
    expect(num(m.epoch)).to.equal(0);
    expect(num(m.epochDuration)).to.equal(86400);
    expect(m.status).to.deep.equal({ active: {} });
    expect(m.authority.toString()).to.equal(ctx.payer.publicKey.toString());
  });

  it("cannot initialize twice with the same mints", async () => {
    const { program } = ctx;
    const [m] = marketPda(f.baseMint, f.quoteMint);
    const [ob] = orderBookPda(m);
    const [v] = vaultPda(m);
    await expectRevertWith(
      program.methods
        .initializeMarket(bn(5), bn(0), bn(100), bn(10), bn(5), bn(10), bn(0))
        .accountsPartial({
          authority: ctx.payer.publicKey,
          market: m,
          orderBook: ob,
          vault: v,
          baseMint: f.baseMint,
          quoteMint: f.quoteMint,
        })
        .rpc(),
      "already in use"
    );
  });

  it("rejects fee bps above MAX_FEE_BPS", async () => {
    await expectRevertWith(
      initMarket({ takerFeeBps: 10_001 }),
      "Fee basis points must be within 0..=10000"
    );
  });

  it("rejects a maker fee above the cap", async () => {
    await expectRevertWith(
      initMarket({ makerFeeBps: 50_000 }),
      "Fee basis points must be within 0..=10000"
    );
  });

  it("rejects integrator fee cap above MAX_FEE_BPS", async () => {
    await expectRevertWith(
      initMarket({ integratorFeeBpsCap: 10_001 }),
      "Fee basis points must be within 0..=10000"
    );
  });

  it("rejects zero tick/lot/min sizes", async () => {
    await expectRevertWith(
      initMarket({ tickSize: 0 }),
      "Order price must be greater than zero"
    );
    await expectRevertWith(
      initMarket({ lotSize: 0 }),
      "Order price must be greater than zero"
    );
    await expectRevertWith(
      initMarket({ minSize: 0 }),
      "Order price must be greater than zero"
    );
  });

  it("rejects identical base and quote mints", async () => {
    const mint = await createMintAccount();
    const [m] = marketPda(mint, mint);
    const [ob] = orderBookPda(m);
    const [v] = vaultPda(m);
    await expectRevertWith(
      ctx.program.methods
        .initializeMarket(bn(5), bn(0), bn(100), bn(10), bn(5), bn(10), bn(0))
        .accountsPartial({
          authority: ctx.payer.publicKey,
          market: m,
          orderBook: ob,
          vault: v,
          baseMint: mint,
          quoteMint: mint,
        })
        .rpc(),
      "Order price must be greater than zero"
    );
  });

  it("registers a trader with an internal endowment", async () => {
    const [t] = traderPda(f.market, ctx.payer.publicKey);
    await ctx.program.methods
      .registerTrader(bn(500), bn(7000))
      .accountsPartial({
        payer: ctx.payer.publicKey,
        market: f.market,
        trader: t,
        owner: ctx.payer.publicKey,
      })
      .rpc();
    const st = await fetchTrader(t);
    expect(st.owner.toString()).to.equal(ctx.payer.publicKey.toString());
    expect(num(st.baseBalance)).to.equal(500);
    expect(num(st.quoteBalance)).to.equal(7000);
    expect(num(st.depositedBase)).to.equal(0);
    expect(num(st.depositedQuote)).to.equal(0);
    expect(st.status).to.deep.equal({ active: {} });
  });

  it("rejects double-registering the same owner", async () => {
    const [t] = traderPda(f.market, ctx.payer.publicKey);
    await expectRevertWith(
      ctx.program.methods
        .registerTrader(bn(1), bn(1))
        .accountsPartial({
          payer: ctx.payer.publicKey,
          market: f.market,
          trader: t,
          owner: ctx.payer.publicKey,
        })
        .rpc(),
      "already in use"
    );
  });

  it("creates the vault token accounts at their PDAs", async () => {
    const [vb] = vaultTokenPda(f.market, "base");
    const [vq] = vaultTokenPda(f.market, "quote");
    expect(vb.toString()).to.equal(f.vaultBase.toString());
    expect(vq.toString()).to.equal(f.vaultQuote.toString());
    const b = await ctx.connection.getAccountInfo(vb);
    const q = await ctx.connection.getAccountInfo(vq);
    expect(b?.owner.toBase58()).to.equal(TOKEN_PROGRAM_ID.toBase58());
    expect(q?.owner.toBase58()).to.equal(TOKEN_PROGRAM_ID.toBase58());
  });

  it("does not require a system program account for registration", async () => {
    const { program, payer } = ctx;
    const owner = Keypair.generate();
    const [t] = traderPda(f.market, owner.publicKey);
    await program.methods
      .registerTrader(bn(10), bn(10))
      .accountsPartial({
        payer: payer.publicKey,
        market: f.market,
        trader: t,
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();
    expect((await fetchTrader(t)).owner.toString()).to.equal(owner.publicKey.toString());
  });
});