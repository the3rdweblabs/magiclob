// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// settlement - exact fill math, fee flows, price-time priority, and
// all-or-nothing balance failures (unit-style integration assertions).

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  placeLimitOrder,
  placeMarketOrder,
  fetchMarket,
  fetchOrderBook,
  fetchTrader,
  activeOrders,
  num,
  expectRevertWith,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

const META = (k: TraderFixture) => ({ pubkey: k.trader, isSigner: false, isWritable: true });
const fee = (notional: number, bps: number) => Math.floor((notional * bps) / 10_000);

describe("settlement", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;

  before(async () => {
    ctx = await bootMagiclob();
  });

  it("charges a taker fee to the aggressive bid and credits it to the protocol", async () => {
    const f = await initMarket({ takerFeeBps: 5, makerFeeBps: 0 });
    const maker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    const taker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });

    await placeLimitOrder(f, maker, { price: 100, qty: 100, clientOrderId: 1, isBid: false });
    await placeMarketOrder(f, taker, { qty: 100, clientOrderId: 2, isBid: true }, [META(maker)]);

    const t = await fetchTrader(taker.trader);
    // notional 10_000, taker fee 5 bps -> 5
    expect(num(t.baseBalance)).to.equal(200);
    expect(num(t.quoteBalance)).to.equal(1_000_000 - 10_000 - fee(10_000, 5));
    const m = await fetchTrader(maker.trader);
    expect(num(m.baseBalance)).to.equal(0);
    expect(num(m.quoteBalance)).to.equal(1_000_000 + 10_000);
    const market = await fetchMarket(f.market);
    expect(num(market.accumulatedFees)).to.equal(fee(10_000, 5));
  });

  it("charges a maker fee and tracks epoch_maker_fees_paid", async () => {
    const f = await initMarket({ takerFeeBps: 5, makerFeeBps: 10 });
    const maker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    const taker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });

    await placeLimitOrder(f, maker, { price: 100, qty: 100, clientOrderId: 1, isBid: false });
    await placeMarketOrder(f, taker, { qty: 100, clientOrderId: 2, isBid: true }, [META(maker)]);

    const m = await fetchTrader(maker.trader);
    expect(num(m.baseBalance)).to.equal(0);
    expect(num(m.quoteBalance)).to.equal(1_000_000 + 10_000 - fee(10_000, 10));
    expect(num(m.epochMakerFeesPaid)).to.equal(fee(10_000, 10));
    const market = await fetchMarket(f.market);
    expect(num(market.accumulatedFees)).to.equal(fee(10_000, 5) + fee(10_000, 10));
  });

  it("charges an integrator fee to the taker and into accumulated_integrator_fees", async () => {
    const f = await initMarket();
    const maker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    const taker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });

    // integrator fee is locked on the resting (maker) order
    await placeLimitOrder(f, maker, { price: 100, qty: 100, clientOrderId: 1, isBid: false, integratorFeeBps: 25 });
    await placeMarketOrder(f, taker, { qty: 100, clientOrderId: 2, isBid: true }, [META(maker)]);

    const t = await fetchTrader(taker.trader);
    expect(num(t.quoteBalance)).to.equal(
      1_000_000 - 10_000 - fee(10_000, 5) - fee(10_000, 25)
    );
    const market = await fetchMarket(f.market);
    expect(num(market.accumulatedFees)).to.equal(fee(10_000, 5));
    expect(num(market.accumulatedIntegratorFees)).to.equal(fee(10_000, 25));
  });

  it("fills makers in strict price-time priority", async () => {
    const f = await initMarket();
    const a = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    const b = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    const taker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });

    await placeLimitOrder(f, a, { price: 1000, qty: 10, clientOrderId: 1, isBid: false });
    await placeLimitOrder(f, b, { price: 1000, qty: 10, clientOrderId: 2, isBid: false });
    await placeLimitOrder(f, b, { price: 1001, qty: 10, clientOrderId: 3, isBid: false });

    await placeMarketOrder(f, taker, { qty: 12, clientOrderId: 4, isBid: true }, [META(a), META(b)]);

    // FIFO at 1000: a gets 10, b gets 2 (8 of b's 10 rest at 1000)
    const ta = await fetchTrader(taker.trader);
    expect(num(ta.baseBalance)).to.equal(112);
    expect(num(ta.quoteBalance)).to.equal(1_000_000 - 12_000 - fee(10_000, 5) - fee(2_000, 5));

    const ma = await fetchTrader(a.trader);
    expect(num(ma.baseBalance)).to.equal(90);
    expect(num(ma.quoteBalance)).to.equal(1_000_000 + 10_000);

    const mb = await fetchTrader(b.trader);
    expect(num(mb.baseBalance)).to.equal(98);
    expect(num(mb.quoteBalance)).to.equal(1_000_000 + 2_000);

    const book = await fetchOrderBook(f.orderBook);
    const remaining = activeOrders(book, "asks");
    expect(remaining.find((o: any) => o.clientOrderId === 2)).to.include({ price: 1000, qty: 8 });
    expect(remaining.find((o: any) => o.clientOrderId === 3)).to.include({ price: 1001, qty: 10 });
  });

  it("reverts the whole fill when the maker cannot cover (all-or-nothing)", async () => {
    const f = await initMarket();
    // Maker has only 3 base to sell but asks for 10.
    const maker = await registerTrader(f, { baseEndowment: 3, quoteEndowment: 1_000_000 });
    const taker = await registerTrader(f, { baseEndowment: 0, quoteEndowment: 1_000_000 });

    await placeLimitOrder(f, maker, { price: 100, qty: 10, clientOrderId: 1, isBid: false });
    await expectRevertWith(
      placeMarketOrder(f, taker, { qty: 8, clientOrderId: 2, isBid: true }, [META(maker)]),
      "Insufficient balance for the requested fill"
    );

    // Both orders still on the book after the revert.
    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "asks").find((o: any) => o.clientOrderId === 1)).to.include({ price: 100, qty: 10 });
    expect(num((await fetchTrader(maker.trader)).baseBalance)).to.equal(3);
  });

  it("marks maker fills for reclaimed snapshots after full consummation", async () => {
    const f = await initMarket();
    const maker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    const taker = await registerTrader(f, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    await placeLimitOrder(f, maker, { price: 100, qty: 4, clientOrderId: 1, isBid: false });
    await placeMarketOrder(f, taker, { qty: 4, clientOrderId: 2, isBid: true }, [META(maker)]);

    expect(num((await fetchTrader(taker.trader)).baseBalance)).to.equal(104);
    expect(num((await fetchTrader(maker.trader)).quoteBalance)).to.equal(1_000_000 + 400);
    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "asks")).to.have.length(0);
  });
});