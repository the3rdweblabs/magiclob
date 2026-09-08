// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// deposit_withdraw - real SPL token movement between trader ATAs and the
// market vault, and the deposited_* ledger bounds.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  deposit,
  withdraw,
  fetchTrader,
  tokenBalanceOf,
  fundTokenAccount,
  bn,
  num,
  TOKEN_PROGRAM_ID,
  SystemProgram,
  expectRevertWith,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

describe("deposit_withdraw", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let t: TraderFixture;

  before(async () => {
    ctx = await bootMagiclob();
    f = await initMarket();
    t = await registerTrader(f, {
      baseEndowment: 10_000,
      quoteEndowment: 1_000_000,
      baseTokens: 10_000,
      quoteTokens: 1_000_000,
    });
  });

  it("deposits base and quote into the vault token accounts", async () => {
    await deposit(f, t, 4_000, 500_000);

    expect(await tokenBalanceOf(f.vaultBase)).to.equal(4_000n);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(500_000n);
    expect(await tokenBalanceOf(t.baseAta)).to.equal(6_000n);
    expect(await tokenBalanceOf(t.quoteAta)).to.equal(500_000n);

    const st = await fetchTrader(t.trader);
    expect(num(st.depositedBase)).to.equal(4_000);
    expect(num(st.depositedQuote)).to.equal(500_000);
  });

  it("treats a zero-amount deposit as a no-op", async () => {
    await deposit(f, t, 0, 0);
    const st = await fetchTrader(t.trader);
    expect(num(st.depositedBase)).to.equal(4_000);
  });

  it("racks up consecutive deposits", async () => {
    await deposit(f, t, 1_000, 50_000);
    const st = await fetchTrader(t.trader);
    expect(num(st.depositedBase)).to.equal(5_000);
    expect(await tokenBalanceOf(f.vaultBase)).to.equal(5_000n);
  });

  it("rejects a deposit the trader cannot fund", async () => {
    await expectRevertWith(deposit(f, t, 100_000_000, 0), "insufficient funds");
  });

  it("withdraws a partial amount back to the trader", async () => {
    await withdraw(f, t, 2_000, 100_000);
    const st = await fetchTrader(t.trader);
    expect(num(st.depositedBase)).to.equal(3_000);
    expect(num(st.depositedQuote)).to.equal(450_000);
    expect(await tokenBalanceOf(t.baseAta)).to.equal(BigInt(10_000 - 5_000 + 2_000));
  });

  it("rejects withdrawing more than deposited", async () => {
    const st = await fetchTrader(t.trader);
    await expectRevertWith(
      withdraw(f, t, num(st.depositedBase) + 1, 0),
      "Insufficient vault balance for withdrawal"
    );
    await expectRevertWith(
      withdraw(f, t, 0, num(st.depositedQuote) + 1),
      "Insufficient vault balance for withdrawal"
    );
  });

  it("lets a trader drain their deposit fully", async () => {
    const st = await fetchTrader(t.trader);
    await withdraw(f, t, num(st.depositedBase), num(st.depositedQuote));
    const after = await fetchTrader(t.trader);
    expect(num(after.depositedBase)).to.equal(0);
    expect(num(after.depositedQuote)).to.equal(0);
    expect(await tokenBalanceOf(f.vaultBase)).to.equal(0n);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(0n);
  });

  it("rejects a deposit using a token account owned by someone else", async () => {
    const other = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 100 });
    await fundTokenAccount(other.baseAta, other.keypair.publicKey, f.baseMint, 1_000);
    // Deposit passing a stranger's base account.
    await expectRevertWith(
      ctx.program.methods
        .deposit(bn(100), bn(0))
        .accountsPartial({
          authority: t.keypair.publicKey,
          market: f.market,
          vault: f.vault,
          trader: t.trader,
          baseMint: f.baseMint,
          quoteMint: f.quoteMint,
          baseTokenAccount: other.baseAta,
          quoteTokenAccount: t.quoteAta,
          baseVaultAccount: f.vaultBase,
          quoteVaultAccount: f.vaultQuote,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([t.keypair])
        .rpc(),
      "Invalid token account owner"
    );
  });
});