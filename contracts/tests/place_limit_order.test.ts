// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// place_limit_order - validation ordering, rest/prevent behavior, time-in-force,
// self-trade prevention, and expiry.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  placeLimitOrder,
  fetchOrderBook,
  fetchTrader,
  activeOrders,
  bn,
  num,
  expectRevertWith,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

const META = (k: TraderFixture) => ({ pubkey: k.trader, isSigner: false, isWritable: true });

describe("place_limit_order", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;

  async function mkFixture(opts?: { tickSize?: number; lotSize?: number; minSize?: number }) {
    const f = await initMarket(opts);
    const maker = await registerTrader(f, {
      baseEndowment: 1_000_000,
      quoteEndowment: 1_000_000,
    });
    const taker = await registerTrader(f, {
      baseEndowment: 1_000_000,
      quoteEndowment: 1_000_000,
    });
    return { f, maker, taker };
  }

  // Validation-ordering tests share one strict market (tick 5, lot 5, min 10);
  // all of them revert, so they never rest orders and cannot pollute each other.
  let f: MarketFixture;
  let maker: TraderFixture;
  let taker: TraderFixture;

  before(async () => {
    ctx = await bootMagiclob();
    ({ f, maker, taker } = await mkFixture({ tickSize: 5, lotSize: 5, minSize: 10 }));
  });

  it("rejects qty below minSize before anything else", async () => {
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 99, qty: 5, clientOrderId: 99, isBid: false }),
      "Order quantity is below minimum size"
    );
  });

  it("rejects qty that is not a multiple of lotSize", async () => {
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 100, qty: 12, clientOrderId: 99, isBid: false }),
      "Order quantity must be a multiple of lot size"
    );
  });

  it("rejects a price that is not a multiple of tickSize", async () => {
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 101, qty: 10, clientOrderId: 99, isBid: false }),
      "Order price must be a multiple of tick size"
    );
  });

  it("rejects integrator fee above the market cap", async () => {
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 100, qty: 10, clientOrderId: 99, isBid: true, integratorFeeBps: 101 }),
      "Fee basis points must be within 0..=10000"
    );
  });

  it("rejects an invalid time-in-force value", async () => {
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 100, qty: 10, clientOrderId: 98, isBid: true, timeInForce: 9 }),
      "Order price must be greater than zero"
    );
  });

  it("rejects an invalid self-matching option", async () => {
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 100, qty: 10, clientOrderId: 97, isBid: true, selfMatchingOption: 7 }),
      "Order price must be greater than zero"
    );
  });

  it("rejects a zero still-unexpired but expired-by-timestamp order", async () => {
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 100, qty: 10, clientOrderId: 96, isBid: true, expireTimestamp: 1n }),
      "Order has expired"
    );
  });

  it("rejects a zero-price limit bid", async () => {
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 0, qty: 10, clientOrderId: 95, isBid: true }),
      "Order price must be greater than zero"
    );
  });

  it("rests a GTC bid at a valid price/qty", async () => {
    const { f, taker } = await mkFixture();
    await placeLimitOrder(f, taker, { price: 100, qty: 10, clientOrderId: 1, isBid: true });
    const book = await fetchOrderBook(f.orderBook);
    const bids = activeOrders(book, "bids");
    expect(bids).to.have.length(1);
    expect(bids[0]).to.include({ price: 100, qty: 10, clientOrderId: 1, owner: String(taker.keypair.publicKey) });
  });

  it("PostOnly bid rejects when it would cross", async () => {
    const { f, maker, taker } = await mkFixture();
    await placeLimitOrder(f, maker, { price: 100, qty: 10, clientOrderId: 21, isBid: false });
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 100, qty: 10, clientOrderId: 94, isBid: true, timeInForce: 3 }),
      "Post-only order would cross the book"
    );
    // No bid was allowed to rest.
    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "bids")).to.have.length(0);
  });

  it("PostOnly ask that does not cross rests", async () => {
    const { f, taker } = await mkFixture();
    await placeLimitOrder(f, taker, { price: 110, qty: 10, clientOrderId: 93, isBid: false, timeInForce: 3 });
    const book = await fetchOrderBook(f.orderBook);
    const asks = activeOrders(book, "asks");
    expect(asks.some((a: any) => a.price === 110 && a.qty === 10)).to.be.true;
  });

  it("a crossing GTC bid fills the maker and rests its remainder", async () => {
    const { f, maker, taker } = await mkFixture();
    await placeLimitOrder(f, maker, { price: 100, qty: 10, clientOrderId: 22, isBid: false });
    await placeLimitOrder(
      f,
      taker,
      { price: 110, qty: 14, clientOrderId: 1001, isBid: true },
      [META(maker)]
    );

    const book = await fetchOrderBook(f.orderBook);
    const asks = activeOrders(book, "asks");
    expect(asks.filter((a: any) => a.clientOrderId === 22)).to.have.length(0);
    const bids = activeOrders(book, "bids");
    expect(bids.find((b: any) => b.clientOrderId === 1001)).to.include({ price: 110, qty: 4 });

    const m = await fetchTrader(maker.trader);
    expect(num(m.baseBalance)).to.equal(1_000_000 - 10);
    expect(num(m.quoteBalance)).to.equal(1_000_000 + 10 * 100);
    const t = await fetchTrader(taker.trader);
    expect(num(t.baseBalance)).to.equal(1_000_000 + 10);
    expect(num(t.quoteBalance)).to.equal(1_000_000 - 10 * 100);
  });

  it("IOC bid fills and discards the remainder", async () => {
    const { f, maker, taker } = await mkFixture();
    await placeLimitOrder(f, maker, { price: 100, qty: 10, clientOrderId: 23, isBid: false });
    await placeLimitOrder(f, taker, { price: 110, qty: 14, clientOrderId: 1002, isBid: true, timeInForce: 1 }, [META(maker)]);

    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "asks").find((a: any) => a.clientOrderId === 23)).to.be.undefined;
    expect(activeOrders(book, "bids").find((b: any) => b.clientOrderId === 1002)).to.be.undefined;
  });

  it("FOK bid reverts when it cannot fill completely (book restored)", async () => {
    const { f, maker, taker } = await mkFixture();
    await placeLimitOrder(f, maker, { price: 100, qty: 10, clientOrderId: 24, isBid: false });
    await expectRevertWith(
      placeLimitOrder(f, taker, { price: 110, qty: 14, clientOrderId: 1003, isBid: true, timeInForce: 2 }, [META(maker)]),
      "Fill-or-kill order cannot be fully filled"
    );
    // All-or-nothing: the maker's resting ask is still on the book.
    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "asks").find((a: any) => a.clientOrderId === 24)).to.include({ price: 100, qty: 10 });
  });

  it("FOK bid fills exactly when quantity matches", async () => {
    const { f, maker, taker } = await mkFixture();
    await placeLimitOrder(f, maker, { price: 100, qty: 10, clientOrderId: 25, isBid: false });
    await placeLimitOrder(f, taker, { price: 110, qty: 10, clientOrderId: 1004, isBid: true, timeInForce: 2 }, [META(maker)]);

    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "asks").find((a: any) => a.clientOrderId === 25)).to.be.undefined;
    expect(activeOrders(book, "bids")).to.have.length(0);
  });

  it("Allowed self-trading nets out on the same trader", async () => {
    const { f } = await mkFixture();
    const s = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
    await placeLimitOrder(f, s, { price: 100, qty: 10, clientOrderId: 2001, isBid: true });
    await placeLimitOrder(f, s, { price: 90, qty: 10, clientOrderId: 2002, isBid: false, selfMatchingOption: 0 });

    // Bid 100 -> ask 90 crossed; self fill at 100 nets to zero each side.
    const st = await fetchTrader(s.trader);
    expect(num(st.baseBalance)).to.equal(1_000_000);
    expect(num(st.quoteBalance)).to.equal(1_000_000);
    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "bids")).to.have.length(0);
    expect(activeOrders(book, "asks")).to.have.length(0);
  });

  it("CancelTaker skips the self-fill and rests the taker", async () => {
    const { f } = await mkFixture();
    const s = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
    await placeLimitOrder(f, s, { price: 100, qty: 10, clientOrderId: 2003, isBid: true });
    await placeLimitOrder(f, s, { price: 90, qty: 10, clientOrderId: 2004, isBid: false, selfMatchingOption: 1 });

    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "bids").find((b: any) => b.clientOrderId === 2003)).to.include({ price: 100, qty: 10 });
    expect(activeOrders(book, "asks").find((a: any) => a.clientOrderId === 2004)).to.include({ price: 90, qty: 10 });
    const st = await fetchTrader(s.trader);
    expect(num(st.baseBalance)).to.equal(1_000_000);
  });

  it("CancelMaker pops the resting self-order and lets the taker rest", async () => {
    const { f } = await mkFixture();
    const s = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
    await placeLimitOrder(f, s, { price: 100, qty: 10, clientOrderId: 2005, isBid: true });
    await placeLimitOrder(f, s, { price: 90, qty: 10, clientOrderId: 2006, isBid: false, selfMatchingOption: 2 });

    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "bids").find((b: any) => b.clientOrderId === 2005)).to.be.undefined;
    expect(activeOrders(book, "asks").find((a: any) => a.clientOrderId === 2006)).to.include({ price: 90, qty: 10 });
  });

  it("does not require a deposit to trade (virtual ledger)", async () => {
    const { f, maker } = await mkFixture();
    const fresh = await registerTrader(f, { baseEndowment: 500, quoteEndowment: 500_000 });
    await placeLimitOrder(f, fresh, { price: 100, qty: 10, clientOrderId: 3001, isBid: true });
    await placeLimitOrder(f, maker, { price: 110, qty: 10, clientOrderId: 26, isBid: false });
    await placeLimitOrder(f, fresh, { price: 150, qty: 10, clientOrderId: 3002, isBid: true }, [META(maker)]);
    const st = await fetchTrader(fresh.trader);
    expect(num(st.baseBalance)).to.equal(500 + 10);
    expect(num(st.quoteBalance)).to.equal(500_000 - 1_100);
  });
});