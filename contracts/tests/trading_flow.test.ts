// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// trading_flow - end-to-end: init market -> register -> deposit -> resting ask
// -> aggressive bid cross (fills at the resting price + fees) -> leftover rests
// -> cancel -> withdraw. Runs against an in-process Surfpool surfnet with real
// SPL mints and token accounts.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  deposit,
  withdraw,
  fetchMarket,
  fetchOrderBook,
  fetchTrader,
  bn,
  num,
  tokenBalanceOf,
  expectRejected,
  EXPIRY_MAX,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

const EXPIRY = EXPIRY_MAX;

// Market configured with taker_fee_bps = 5, maker_fee_bps = 0.
const TAKER_FEE_BPS = 5;

describe("magiclob trading flow (E2E)", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let maker: TraderFixture; // rests the ask
  let taker: TraderFixture; // aggressive bid

  before(async () => {
    ctx = await bootMagiclob();
  });

  it("initializes a market and prepays vault token accounts", async () => {
    f = await initMarket({ tickSize: 1, lotSize: 1, minSize: 1 });

    const market = await fetchMarket(f.market);
    expect(num(market.takerFeeBps)).to.equal(5);
    expect(num(market.epoch)).to.equal(0);
    expect(num(market.accumulatedFees)).to.equal(0);
    expect(market.status).to.deep.equal({ active: {} });

    const book = await fetchOrderBook(f.orderBook);
    expect(book.market.toString()).to.equal(f.market.toString());
    expect(num(book.bidHead) === 0xffff).to.be.true; // NONE_IDX
    expect(num(book.askHead) === 0xffff).to.be.true;

    expect(await tokenBalanceOf(f.vaultBase)).to.equal(0n);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(0n);
  });

  it("registers two traders with endowments and funded ATAs", async () => {
    maker = await registerTrader(f, {
      baseEndowment: 10_000,
      quoteEndowment: 1_000_000,
      baseTokens: 10_000,
      quoteTokens: 1_000_000,
    });
    taker = await registerTrader(f, {
      baseEndowment: 10_000,
      quoteEndowment: 1_000_000,
      baseTokens: 10_000,
      quoteTokens: 1_000_000,
    });

    for (const t of [maker, taker]) {
      const st = await fetchTrader(t.trader);
      expect(st.owner.toString()).to.equal(t.keypair.publicKey.toString());
      expect(num(st.baseBalance)).to.equal(10_000);
      expect(num(st.quoteBalance)).to.equal(1_000_000);
      expect(st.status).to.deep.equal({ active: {} });
    }
  });

  it("deposits real tokens, vault balances track them", async () => {
    await deposit(f, maker, 10_000, 1_000_000);
    await deposit(f, taker, 10_000, 1_000_000);

    expect(await tokenBalanceOf(f.vaultBase)).to.equal(20_000n);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(2_000_000n);
    expect(await tokenBalanceOf(maker.baseAta)).to.equal(0n);

    const t = await fetchTrader(taker.trader);
    expect(num(t.depositedBase)).to.equal(10_000);
    expect(num(t.depositedQuote)).to.equal(1_000_000);
  });

  it("rests an ask GTC at price 100 qty 60 (maker)", async () => {
    await ctx.program.methods
      .placeLimitOrder(
        bn(100), // price
        bn(60), // qty
        bn(2001), // clientOrderId
        false, // isBid = ask
        bn(0), // integratorFeeBps
        0, // timeInForce: GoodTillCancelled
        0, // selfMatchingOption: Allowed
        bn(EXPIRY)
      )
      .accountsPartial({
        market: f.market,
        orderBook: f.orderBook,
        trader: maker.trader,
        owner: maker.keypair.publicKey,
      })
      .signers([maker.keypair])
      .rpc();

    const book = await fetchOrderBook(f.orderBook);
    const asks = book.asks
      .filter((n: any) => n.active)
      .map((n: any) => ({ price: num(n.price), qty: num(n.qtyRemaining) }));
    expect(asks).to.have.length(1);
    expect(asks[0]).to.deep.equal({ price: 100, qty: 60 });
  });

  it("aggressive bid 110 qty 110 crosses, fills 60@100, rests 50", async () => {
    const makerTraderPda = { pubkey: maker.trader, isSigner: false, isWritable: true };

    await ctx.program.methods
      .placeLimitOrder(
        bn(110),
        bn(110),
        bn(1001),
        true, // bid
        bn(0),
        0, // GTC
        0, // Allowed
        bn(EXPIRY)
      )
      .accountsPartial({
        market: f.market,
        orderBook: f.orderBook,
        trader: taker.trader,
        owner: taker.keypair.publicKey,
      })
      .remainingAccounts([makerTraderPda])
      .signers([taker.keypair])
      .rpc();

    const book = await fetchOrderBook(f.orderBook);
    const asks = book.asks.filter((n: any) => n.active);
    const bids = book.bids
      .filter((n: any) => n.active && num(n.qtyRemaining) > 0)
      .map((n: any) => ({ price: num(n.price), qty: num(n.qtyRemaining) }));
    expect(asks).to.have.length(0);
    expect(bids).to.have.length(1);
    expect(bids[0]).to.deep.equal({ price: 110, qty: 50 });
  });

  it("settles internal ledgers and credits protocol fees", async () => {
    // This timestamp (2026) gives clock ~1.77e9; fills price 100, qty 60 -> notional 6000.
    // taker fee = 6000 * 5 / 10000 = 3.
    const m = await fetchTrader(maker.trader);
    const t = await fetchTrader(taker.trader);
    expect(num(m.baseBalance)).to.equal(10_000 - 60);
    expect(num(m.quoteBalance)).to.equal(1_000_000 + 6000);
    expect(num(t.baseBalance)).to.equal(10_000 + 60);
    expect(num(t.quoteBalance)).to.equal(1_000_000 - 6000 - feeOf(6000, TAKER_FEE_BPS));

    const market = await fetchMarket(f.market);
    expect(num(market.accumulatedFees)).to.equal(feeOf(6000, TAKER_FEE_BPS));
  });

  it("rejects unexpected maker accounts passed implicitly", async () => {
    const dup = { pubkey: maker.trader, isSigner: false, isWritable: true };
    await expectRejected(
      ctx.program.methods
        .placeLimitOrder(
          bn(120),
          bn(60),
          bn(1002),
          true,
          bn(0),
          0,
          0,
          bn(EXPIRY)
        )
        .accountsPartial({
          market: f.market,
          orderBook: f.orderBook,
          trader: taker.trader,
          owner: taker.keypair.publicKey,
        })
        .remainingAccounts([dup, dup])
        .signers([taker.keypair])
        .rpc()
    );
  });

  it("cancels the resting bid by client order id", async () => {
    await ctx.program.methods
      .cancelOrder(true, bn(1001))
      .accountsPartial({
        market: f.market,
        orderBook: f.orderBook,
        trader: taker.trader,
        owner: taker.keypair.publicKey,
      })
      .signers([taker.keypair])
      .rpc();

    const book = await fetchOrderBook(f.orderBook);
    const bids = book.bids.filter((n: any) => n.active && num(n.qtyRemaining) > 0);
    expect(bids).to.have.length(0);
  });

  it("rejects a cancel of an unknown order", async () => {
    await expectRejected(
      ctx.program.methods
        .cancelOrder(true, bn(9999))
        .accountsPartial({
          market: f.market,
          orderBook: f.orderBook,
          trader: taker.trader,
          owner: taker.keypair.publicKey,
        })
        .signers([taker.keypair])
        .rpc()
    );
  });

  it("withdraws tokens from the vault back to the trader", async () => {
    const vaultBaseBefore = await tokenBalanceOf(f.vaultBase);
    const vaultQuoteBefore = await tokenBalanceOf(f.vaultQuote);

    await withdraw(f, maker, 10_000, 200_000);

    const st = await fetchTrader(maker.trader);
    expect(num(st.depositedBase)).to.equal(0);
    expect(num(st.depositedQuote)).to.equal(1_000_000 - 200_000);
    expect(await tokenBalanceOf(f.vaultBase)).to.equal(vaultBaseBefore - 10_000n);
    expect(await tokenBalanceOf(f.vaultQuote)).to.equal(vaultQuoteBefore - 200_000n);
    expect(await tokenBalanceOf(maker.baseAta)).to.equal(10_000n);
  });

  it("rejects a withdrawal exceeding the deposited balance", async () => {
    await expectRejected(withdraw(f, maker, 1_000, 0));
  });
});

function feeOf(notional: number, bps: number) {
  return Math.floor((notional * bps) / 10_000);
}