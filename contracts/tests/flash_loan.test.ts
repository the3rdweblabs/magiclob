// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// flash_loan - borrow/return hot potato for base and quote assets.
//
// The vault's `vault_base_balance`/`vault_quote_balance` ledgers are never
// credited by deposit/withdraw/staking (documented elsewhere), so the happy
// paths below seed both the ledger and the matching SPL token account
// directly (mirroring what an operating vault would hold).

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  fetchFlashLoan,
  fetchVault,
  tokenBalanceOf,
  fundTokenAccount,
  fundVaultToken,
  patchAccountU64,
  VAULT_BASE_BALANCE_OFFSET,
  VAULT_QUOTE_BALANCE_OFFSET,
  flashLoanPda,
  createOwnedTokenAccount,
  bn,
  num,
  TOKEN_PROGRAM_ID,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  expectRevertWith,
  expectRejected,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

describe("flash_loan", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let borrower: TraderFixture;
  let other: TraderFixture;

  const loanOf = (who: TraderFixture) =>
    flashLoanPda(f.market, who.keypair.publicKey, 0)[0];
  const loanBase = () => loanOf(borrower);

  async function borrowBase(amount: number | bigint, who = borrower) {
    await ctx.program.methods
      .borrowFlashloanBase(bn(amount))
      .accountsPartial({
        borrower: who.keypair.publicKey,
        market: f.market,
        vault: f.vault,
        borrowerTrader: who.trader,
        baseVaultAccount: f.vaultBase,
        destinationBaseAccount: who.baseAta,
        flashLoan: flashLoanPda(f.market, who.keypair.publicKey, 0)[0],
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([who.keypair])
      .rpc();
  }

  async function returnBase(amount: number | bigint, who = borrower) {
    await ctx.program.methods
      .returnFlashloanBase(bn(amount))
      .accountsPartial({
        borrower: who.keypair.publicKey,
        market: f.market,
        vault: f.vault,
        borrowerTrader: who.trader,
        baseVaultAccount: f.vaultBase,
        sourceBaseAccount: who.baseAta,
        flashLoan: flashLoanPda(f.market, who.keypair.publicKey, 0)[0],
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who.keypair])
      .rpc();
  }

  async function borrowQuote(amount: number | bigint) {
    await ctx.program.methods
      .borrowFlashloanQuote(bn(amount))
      .accountsPartial({
        borrower: borrower.keypair.publicKey,
        market: f.market,
        vault: f.vault,
        borrowerTrader: borrower.trader,
        quoteVaultAccount: f.vaultQuote,
        destinationQuoteAccount: borrower.quoteAta,
        flashLoan: flashLoanPda(f.market, borrower.keypair.publicKey, 1)[0],
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([borrower.keypair])
      .rpc();
  }

  async function returnQuote(amount: number | bigint) {
    await ctx.program.methods
      .returnFlashloanQuote(bn(amount))
      .accountsPartial({
        borrower: borrower.keypair.publicKey,
        market: f.market,
        vault: f.vault,
        borrowerTrader: borrower.trader,
        quoteVaultAccount: f.vaultQuote,
        sourceQuoteAccount: borrower.quoteAta,
        flashLoan: flashLoanPda(f.market, borrower.keypair.publicKey, 1)[0],
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower.keypair])
      .rpc();
  }

  before(async () => {
    ctx = await bootMagiclob();
    f = await initMarket();
    borrower = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
    other = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
  });

  it("rejects borrowing while the vault ledger is empty", async () => {
    await expectRevertWith(
      borrowBase(100),
      "Insufficient vault balance for withdrawal"
    );
  });

  it("borrows base against a seeded vault", async () => {
    await patchAccountU64(f.vault, VAULT_BASE_BALANCE_OFFSET, 50_000);
    await fundVaultToken(f, "base", 50_000);

    await borrowBase(10_000);

    const loan = await fetchFlashLoan(loanBase());
    expect(loan.borrower.toString()).to.equal(borrower.keypair.publicKey.toString());
    expect(num(loan.amount)).to.equal(10_000);
    expect(num(loan.fee)).to.equal(5); // 10_000 * 5 / 10_000
    expect(loan.asset).to.equal(0);

    const v = await fetchVault(f.vault);
    expect(num(v.owedBase)).to.equal(10_000);
    expect(num(v.settledBase)).to.equal(0);
    expect(await tokenBalanceOf(f.vaultBase)).to.equal(40_000n);
    expect(await tokenBalanceOf(borrower.baseAta)).to.equal(10_000n);
  });

  it("cannot borrow again while a loan is open", async () => {
    await expectRevertWith(borrowBase(100), "already in use");
  });

  it("rejects returning the wrong amount", async () => {
    await expectRevertWith(returnBase(9_999), "Flash loan was not repaid");
  });

  it("rejects returning without enough tokens in the source account", async () => {
    await fundTokenAccount(borrower.baseAta, borrower.keypair.publicKey, f.baseMint, 10_004);
    await expectRevertWith(returnBase(10_000), "Insufficient balance for the requested fill");
  });

  it("repays principal plus fee and closes the loan", async () => {
    await fundTokenAccount(borrower.baseAta, borrower.keypair.publicKey, f.baseMint, 10_005);
    await returnBase(10_000);

    const v = await fetchVault(f.vault);
    expect(num(v.owedBase)).to.equal(0);
    expect(num(v.settledBase)).to.equal(5);
    expect(await tokenBalanceOf(f.vaultBase)).to.equal(50_005n);
    await expectRejected(fetchFlashLoan(loanBase())); // account closed
  });

  it("documents that the loan never updates the ledger balance", async () => {
    const v = await fetchVault(f.vault);
    expect(num(v.vaultBaseBalance)).to.equal(50_000); // still the seeded value
  });

  it("runs the quote flash loan path independently", async () => {
    await patchAccountU64(f.vault, VAULT_QUOTE_BALANCE_OFFSET, 20_000);
    await fundVaultToken(f, "quote", 20_000);

    await borrowQuote(5_000);
    let v = await fetchVault(f.vault);
    expect(num(v.owedQuote)).to.equal(5_000);
    expect(num(v.settledQuote)).to.equal(0);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(15_000n);

    await fundTokenAccount(borrower.quoteAta, borrower.keypair.publicKey, f.quoteMint, 5_002);
    await returnQuote(5_000);

    v = await fetchVault(f.vault);
    expect(num(v.owedQuote)).to.equal(0);
    expect(num(v.settledQuote)).to.equal(2); // 5_000 * 5 / 10_000
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(20_002n);
  });

  it("rejects a base loan being returned through the quote path", async () => {
    await patchAccountU64(f.vault, VAULT_BASE_BALANCE_OFFSET, 50_000);
    await fundVaultToken(f, "base", 50_000);
    await borrowBase(1_000); // fee 0

    // Point the quote-return at the base loan account.
    await expectRevertWith(
      ctx.program.methods
        .returnFlashloanQuote(bn(1_000))
        .accountsPartial({
          borrower: borrower.keypair.publicKey,
          market: f.market,
          vault: f.vault,
          borrowerTrader: borrower.trader,
          quoteVaultAccount: f.vaultQuote,
          sourceQuoteAccount: borrower.quoteAta,
          flashLoan: loanBase(),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([borrower.keypair])
        .rpc(),
      "Invalid flash loan asset type"
    );

    // Clean up the dangling loan.
    await fundTokenAccount(borrower.baseAta, borrower.keypair.publicKey, f.baseMint, 1_000);
    await returnBase(1_000);
  });

  it("rejects a different borrower returning the loan", async () => {
    await borrowBase(2_000); // fee 1
    await fundTokenAccount(other.baseAta, other.keypair.publicKey, f.baseMint, 2_001);
    await expectRejected(
      ctx.program.methods
        .returnFlashloanBase(bn(2_000))
        .accountsPartial({
          borrower: other.keypair.publicKey,
          market: f.market,
          vault: f.vault,
          borrowerTrader: other.trader,
          baseVaultAccount: f.vaultBase,
          sourceBaseAccount: other.baseAta,
          flashLoan: loanBase(),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([other.keypair])
        .rpc()
    );

    await fundTokenAccount(borrower.baseAta, borrower.keypair.publicKey, f.baseMint, 2_001);
    await returnBase(2_000);
  });

  it("rejects a zero or oversized borrow", async () => {
    await expectRevertWith(borrowBase(0), "Order quantity must be greater than zero");
    await expectRevertWith(
      borrowBase(60_000),
      "Insufficient vault balance for withdrawal"
    );
  });

  it("borrows into a distinct destination token account owner", async () => {
    const otherAta = await createOwnedTokenAccount(f.baseMint, other.keypair.publicKey);
    await patchAccountU64(f.vault, VAULT_BASE_BALANCE_OFFSET, 50_000);
    await fundVaultToken(f, "base", 50_000);
    await ctx.program.methods
      .borrowFlashloanBase(bn(3_000))
      .accountsPartial({
        borrower: other.keypair.publicKey,
        market: f.market,
        vault: f.vault,
        borrowerTrader: other.trader,
        baseVaultAccount: f.vaultBase,
        destinationBaseAccount: otherAta,
        flashLoan: flashLoanPda(f.market, other.keypair.publicKey, 0)[0],
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([other.keypair])
      .rpc();

    expect(await tokenBalanceOf(otherAta)).to.equal(3_000n);
    const v = await fetchVault(f.vault);
    expect(num(v.owedBase)).to.equal(3_000);
  });
});